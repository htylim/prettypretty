import { useCallback, useMemo, useRef } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type {
  PrettifyRunResponse,
  PrettifyTrigger,
  PrettifierProgressEvent,
} from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { WindowApi } from '../../shared/window-api';
import {
  appendFallbackProgressLine,
  type FallbackAgentOption,
  type FallbackWaitState,
  getConfiguredFallbackAgentFromSelection,
} from './appDomain';
import { reportRendererError } from './reportRendererError';
import { selectFallbackWaitState } from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';
import { usePrettifierRuntime } from './session/usePrettifierRuntime';
import {
  createFallbackWaitState,
  getLineCount,
  shouldPromptForFallbackConfirmation,
  shouldRequestFallbackAgentSelection,
} from './session/prettifierSessionDomain';
import { createPrettifierService } from '../prettifier/prettifierService';

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UsePrettifierRequestFlowOptions = {
  indentSize: IndentSize;
  fallbackWarningLineThreshold: number;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  getWindowApi: () => WindowApi | null;
  requestFallbackConfirmation: (lineCount: number) => Promise<boolean>;
  requestFallbackAgentSelection: () => Promise<string | null>;
  logTelemetry: (name: TelemetryEventName, meta: TelemetryMeta) => Promise<void>;
};

type PendingFallbackRequest = {
  requestId: number;
  resolveInterruption: (response: PrettifyRunResponse | null) => void;
  createCanceledResponse: () => PrettifyRunResponse;
};

export type UsePrettifierRequestFlowResult = {
  isLlmRunning: boolean;
  fallbackWaitState: FallbackWaitState | null;
  cancelActiveFallback: () => Promise<void>;
  discardActiveFallback: () => Promise<void>;
  requestPrettifier: (
    nextInputText: string,
    trigger: PrettifyTrigger,
  ) => Promise<PrettifyRunResponse | null>;
};

const isLatestPrettifyRequest = (
  requestId: number,
  latestRequestIdRef: { current: number },
): boolean => {
  return requestId === latestRequestIdRef.current;
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};

export const usePrettifierRequestFlow = ({
  indentSize,
  fallbackWarningLineThreshold,
  fallbackAgentId,
  fallbackAgentOptions,
  getWindowApi,
  requestFallbackConfirmation,
  requestFallbackAgentSelection,
  logTelemetry,
}: UsePrettifierRequestFlowOptions): UsePrettifierRequestFlowResult => {
  const latestPrettifyRequestIdRef = useRef(0);
  const activeFallbackRequestRef = useRef<PendingFallbackRequest | null>(null);
  const prettifierService = useMemo(() => createPrettifierService(indentSize), [indentSize]);

  const fallbackWaitState = useDocumentSession(selectFallbackWaitState);
  const setFallbackWaitState = useDocumentSession((state) => state.setFallbackWaitState);

  const isLlmRunning = fallbackWaitState !== null;

  const handlePrettifierProgress = useCallback(
    (event: PrettifierProgressEvent): void => {
      const currentState = useDocumentSession.getState();
      const waitState = currentState.fallbackWaitState;
      if (!waitState || waitState.requestId !== event.requestId) {
        return;
      }

      setFallbackWaitState({
        ...waitState,
        progressLines: appendFallbackProgressLine(waitState.progressLines, event.line),
      });
    },
    [setFallbackWaitState],
  );

  const { runPrettifier: runPrettifierRequest, cancelPrettifierFallback: cancelFallbackRequest } =
    usePrettifierRuntime({
      getWindowApi,
      onProgress: handlePrettifierProgress,
    });

  const takeActiveFallbackRequest = useCallback((): PendingFallbackRequest | null => {
    const activeRequest = activeFallbackRequestRef.current;
    activeFallbackRequestRef.current = null;

    return activeRequest;
  }, []);

  const interruptActiveFallback = useCallback(
    async (outcome: 'passthrough' | 'discard'): Promise<void> => {
      const activeRequest = takeActiveFallbackRequest();
      if (!activeRequest) {
        return;
      }

      if (outcome === 'passthrough') {
        activeRequest.resolveInterruption(activeRequest.createCanceledResponse());
      } else {
        latestPrettifyRequestIdRef.current += 1;
        activeRequest.resolveInterruption(null);
      }

      setFallbackWaitState(null);
      await cancelFallbackRequest(activeRequest.requestId);
    },
    [cancelFallbackRequest, setFallbackWaitState, takeActiveFallbackRequest],
  );

  const cancelActiveFallback = useCallback(async (): Promise<void> => {
    if (activeFallbackRequestRef.current === null) {
      return;
    }

    await interruptActiveFallback('passthrough');
  }, [interruptActiveFallback]);

  const discardActiveFallback = useCallback(async (): Promise<void> => {
    if (activeFallbackRequestRef.current === null) {
      return;
    }

    await interruptActiveFallback('discard');
  }, [interruptActiveFallback]);

  const requestPrettifier = useCallback(
    async (
      nextInputText: string,
      trigger: PrettifyTrigger,
    ): Promise<PrettifyRunResponse | null> => {
      if (activeFallbackRequestRef.current !== null) {
        void interruptActiveFallback('discard');
      }

      const requestId = latestPrettifyRequestIdRef.current + 1;
      latestPrettifyRequestIdRef.current = requestId;

      const startedAt = Date.now();
      const getDurationMs = (): number => Date.now() - startedAt;

      const localResult = prettifierService.prettifyDetailed(nextInputText);
      void logTelemetry('renderer.prettifier.local.result', {
        trigger,
        inputLength: nextInputText.length,
        localDetection: localResult.localDetection,
        localResultKind: localResult.kind,
      });

      if (localResult.kind === 'applied') {
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return null;
        }

        return {
          status: 'applied-local',
          outputText: localResult.outputText,
          localDetection: localResult.localDetection,
          fallbackStatus: 'not-attempted',
          agentId: null,
          durationMs: getDurationMs(),
        };
      }

      const api = getWindowApi();
      if (!api) {
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return null;
        }

        return {
          status: 'passthrough-no-fallback',
          outputText: nextInputText,
          localDetection: localResult.localDetection,
          fallbackStatus: 'skipped-no-fallback',
          agentId: null,
          durationMs: getDurationMs(),
        };
      }

      const configuredFallbackAgent = getConfiguredFallbackAgentFromSelection(
        fallbackAgentId,
        fallbackAgentOptions,
      );
      const hasEnabledFallbackAgentOption = fallbackAgentOptions.some((option) => option.enabled);
      let effectiveFallbackAgentId = fallbackAgentId;
      let effectiveFallbackAgent = configuredFallbackAgent;

      if (
        shouldRequestFallbackAgentSelection(
          configuredFallbackAgent.shouldWaitForFallback,
          hasEnabledFallbackAgentOption,
        )
      ) {
        effectiveFallbackAgentId = await requestFallbackAgentSelection();
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return null;
        }

        if (!effectiveFallbackAgentId) {
          return {
            status: 'passthrough-no-fallback',
            outputText: nextInputText,
            localDetection: localResult.localDetection,
            fallbackStatus: 'skipped-no-fallback',
            agentId: null,
            durationMs: getDurationMs(),
          };
        }

        effectiveFallbackAgent = getConfiguredFallbackAgentFromSelection(
          effectiveFallbackAgentId,
          fallbackAgentOptions,
        );
      }

      if (!effectiveFallbackAgent.shouldWaitForFallback) {
        return {
          status: 'passthrough-no-fallback',
          outputText: nextInputText,
          localDetection: localResult.localDetection,
          fallbackStatus: 'skipped-invalid-agent',
          agentId: effectiveFallbackAgentId,
          durationMs: getDurationMs(),
        };
      }

      const lineCount = getLineCount(nextInputText);
      const shouldPromptForFallback = shouldPromptForFallbackConfirmation(
        lineCount,
        fallbackWarningLineThreshold,
        effectiveFallbackAgent.shouldWaitForFallback,
      );

      if (shouldPromptForFallback) {
        const shouldUseFallbackAgent = await requestFallbackConfirmation(lineCount);
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return null;
        }

        if (!shouldUseFallbackAgent) {
          return {
            status: 'passthrough-no-fallback',
            outputText: nextInputText,
            localDetection: localResult.localDetection,
            fallbackStatus: 'skipped-no-fallback',
            agentId: effectiveFallbackAgentId,
            durationMs: getDurationMs(),
          };
        }
      }

      setFallbackWaitState(
        createFallbackWaitState(requestId, nextInputText, effectiveFallbackAgent.agentName),
      );
      const interruption = createDeferred<PrettifyRunResponse | null>();
      activeFallbackRequestRef.current = {
        requestId,
        resolveInterruption: interruption.resolve,
        createCanceledResponse: () => ({
          status: 'passthrough-fallback-failed',
          outputText: nextInputText,
          localDetection: localResult.localDetection,
          fallbackStatus: 'failed-canceled',
          agentId: effectiveFallbackAgentId,
          durationMs: getDurationMs(),
        }),
      };

      try {
        const response = await Promise.race([
          runPrettifierRequest({
            requestId,
            inputText: nextInputText,
            indentSize,
            trigger,
            ...(effectiveFallbackAgentId && effectiveFallbackAgentId !== fallbackAgentId
              ? { fallbackAgentIdOverride: effectiveFallbackAgentId }
              : {}),
          }),
          interruption.promise,
        ]);

        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef) || !response) {
          return null;
        }

        return response;
      } catch (error) {
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return null;
        }

        reportRendererError('Failed to run prettifier fallback', error);
        return {
          status: 'passthrough-fallback-failed',
          outputText: nextInputText,
          localDetection: localResult.localDetection,
          fallbackStatus: 'failed-spawn-error',
          agentId: effectiveFallbackAgentId,
          durationMs: getDurationMs(),
        };
      } finally {
        if (activeFallbackRequestRef.current?.requestId === requestId) {
          activeFallbackRequestRef.current = null;
        }

        if (isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          setFallbackWaitState(null);
        }
      }
    },
    [
      fallbackAgentId,
      fallbackAgentOptions,
      fallbackWarningLineThreshold,
      getWindowApi,
      interruptActiveFallback,
      indentSize,
      logTelemetry,
      prettifierService,
      requestFallbackAgentSelection,
      requestFallbackConfirmation,
      runPrettifierRequest,
      setFallbackWaitState,
    ],
  );

  return {
    isLlmRunning,
    fallbackWaitState,
    cancelActiveFallback,
    discardActiveFallback,
    requestPrettifier,
  };
};
