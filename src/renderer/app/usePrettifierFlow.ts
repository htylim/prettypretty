import { useCallback, useMemo, useRef } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PrettifyTrigger, PrettifierProgressEvent } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import {
  EMPTY_FILE_NOTICE,
  appendFallbackProgressLine,
  type FallbackAgentOption,
  type FallbackWaitState,
  type IngestSource,
  getConfiguredFallbackAgentFromSelection,
  getIngestEventName,
  getIngestTrigger,
  isFileIngestSource,
} from './appDomain';
import { reportRendererError } from './reportRendererError';
import {
  selectFallbackWaitState,
  selectInputText,
  selectLastPrettifiedInput,
  selectOutputText,
  selectPaneMode,
} from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';
import { usePrettifierRuntime } from './session/usePrettifierRuntime';
import {
  applyLocalPrettifyOutput,
  applyPassthroughOutput,
  applyRemotePrettifyOutput,
  createEmptyOutputFormattingState,
  createFallbackWaitState,
  createOutputReindentTransition,
  getLineCount,
  shouldPromptForFallbackConfirmation,
  shouldRequestFallbackAgentSelection,
  type OutputReindentSnapshot,
  type PrettifierSessionState,
} from './session/prettifierSessionDomain';
import { createPrettifierService } from '../prettifier/prettifierService';

type PrettifierRunOptions = {
  switchToOutputOnComplete: boolean;
};

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UsePrettifierFlowOptions = {
  indentSize: IndentSize;
  fallbackWarningLineThreshold: number;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  getWindowApi: () => WindowApi | null;
  requestFallbackConfirmation: (lineCount: number) => Promise<boolean>;
  requestFallbackAgentSelection: () => Promise<string | null>;
  logTelemetry: (name: TelemetryEventName, meta: TelemetryMeta) => Promise<void>;
};

export type UsePrettifierFlowResult = {
  outputText: string;
  isLlmRunning: boolean;
  fallbackWaitState: FallbackWaitState | null;
  cancelActiveFallback: () => Promise<void>;
  runPrettifier: (
    nextInputText: string,
    trigger: PrettifyTrigger,
    options: PrettifierRunOptions,
  ) => Promise<void>;
  ingestInputText: (nextText: string, source: IngestSource) => void;
  resetPrettifierState: () => void;
  isInputAlreadyPrettified: (input: string) => boolean;
  reindentOutputIfPrettified: (options: {
    paneMode: PaneMode;
    inputText: string;
    nextIndentSize: IndentSize;
  }) => OutputReindentSnapshot | null;
  restoreOutputFromSnapshot: (snapshot: OutputReindentSnapshot | null) => void;
  alignOutputIndentAfterPersist: (
    requestedIndentSize: IndentSize,
    persistedIndentSize: IndentSize,
  ) => void;
};

const isLatestPrettifyRequest = (
  requestId: number,
  latestRequestIdRef: { current: number },
): boolean => {
  return requestId === latestRequestIdRef.current;
};

/**
 * Owns renderer-side prettifier orchestration while session state stores the
 * visible output, wait state, and last-successful input.
 */
export const usePrettifierFlow = ({
  indentSize,
  fallbackWarningLineThreshold,
  fallbackAgentId,
  fallbackAgentOptions,
  getWindowApi,
  requestFallbackConfirmation,
  requestFallbackAgentSelection,
  logTelemetry,
}: UsePrettifierFlowOptions): UsePrettifierFlowResult => {
  const latestPrettifyRequestIdRef = useRef(0);
  const activeFallbackRequestIdRef = useRef<number | null>(null);
  const prettifierService = useMemo(() => createPrettifierService(indentSize), [indentSize]);

  const paneMode = useDocumentSession(selectPaneMode);
  const inputText = useDocumentSession(selectInputText);
  const outputText = useDocumentSession(selectOutputText);
  const fallbackWaitState = useDocumentSession(selectFallbackWaitState);
  const lastPrettifiedInput = useDocumentSession(selectLastPrettifiedInput);
  const setPaneMode = useDocumentSession((state) => state.setPaneMode);
  const setInputText = useDocumentSession((state) => state.setInputText);
  const setIngestNotice = useDocumentSession((state) => state.setIngestNotice);
  const setOutputText = useDocumentSession((state) => state.setOutputText);
  const setOutputFormattingState = useDocumentSession((state) => state.setOutputFormattingState);
  const setFallbackWaitState = useDocumentSession((state) => state.setFallbackWaitState);
  const setLastPrettifiedInput = useDocumentSession((state) => state.setLastPrettifiedInput);

  const isLlmRunning = fallbackWaitState !== null;

  const applyTransientOutputState = useCallback(
    (nextState: PrettifierSessionState): void => {
      setOutputText(nextState.outputText);
      setOutputFormattingState(nextState.outputFormattingState);
      setFallbackWaitState(nextState.fallbackWaitState);
      setLastPrettifiedInput(nextState.lastPrettifiedInput);
    },
    [setFallbackWaitState, setLastPrettifiedInput, setOutputFormattingState, setOutputText],
  );

  const clearTransientOutputState = useCallback(
    (nextOutputText: string): void => {
      latestPrettifyRequestIdRef.current += 1;
      setOutputText(nextOutputText);
      setOutputFormattingState(createEmptyOutputFormattingState());
      setFallbackWaitState(null);
      setLastPrettifiedInput(null);
    },
    [setFallbackWaitState, setLastPrettifiedInput, setOutputFormattingState, setOutputText],
  );

  const takeActiveFallbackRequestId = useCallback((): number | null => {
    const activeRequestId = activeFallbackRequestIdRef.current;
    activeFallbackRequestIdRef.current = null;

    return activeRequestId;
  }, []);

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

  const showOutputIfRequested = useCallback(
    (shouldSwitchToOutput: boolean): void => {
      if (shouldSwitchToOutput) {
        setPaneMode('output');
      }
    },
    [setPaneMode],
  );

  const resetToInputState = useCallback(
    (notice?: string | null): void => {
      const activeRequestId = takeActiveFallbackRequestId();
      if (activeRequestId !== null) {
        void cancelFallbackRequest(activeRequestId);
      }

      clearTransientOutputState('');
      setPaneMode('input');
      if (notice !== undefined) {
        setIngestNotice(notice);
      }
    },
    [
      cancelFallbackRequest,
      clearTransientOutputState,
      setIngestNotice,
      setPaneMode,
      takeActiveFallbackRequestId,
    ],
  );

  const cancelActiveFallback = useCallback(async (): Promise<void> => {
    if (activeFallbackRequestIdRef.current === null) {
      return;
    }

    const activeRequestId = takeActiveFallbackRequestId();
    clearTransientOutputState('');
    setPaneMode('input');
    if (activeRequestId !== null) {
      await cancelFallbackRequest(activeRequestId);
    }
  }, [cancelFallbackRequest, clearTransientOutputState, setPaneMode, takeActiveFallbackRequestId]);

  const runPrettifier = useCallback(
    async (
      nextInputText: string,
      trigger: PrettifyTrigger,
      options: PrettifierRunOptions,
    ): Promise<void> => {
      if (activeFallbackRequestIdRef.current !== null) {
        const previousRequestId = takeActiveFallbackRequestId();
        if (previousRequestId !== null) {
          void cancelFallbackRequest(previousRequestId);
        }
      }

      const requestId = latestPrettifyRequestIdRef.current + 1;
      latestPrettifyRequestIdRef.current = requestId;
      setOutputText(nextInputText);
      setOutputFormattingState(createEmptyOutputFormattingState());
      setFallbackWaitState(null);
      setLastPrettifiedInput(null);

      const localResult = prettifierService.prettifyDetailed(nextInputText);
      void logTelemetry('renderer.prettifier.local.result', {
        trigger,
        inputLength: nextInputText.length,
        localDetection: localResult.localDetection,
        localResultKind: localResult.kind,
      });

      if (localResult.kind === 'applied') {
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return;
        }

        applyTransientOutputState(
          applyLocalPrettifyOutput(
            useDocumentSession.getState(),
            nextInputText,
            localResult.outputText,
            indentSize,
          ),
        );
        showOutputIfRequested(options.switchToOutputOnComplete);
        return;
      }

      const api = getWindowApi();
      if (!api) {
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return;
        }

        applyTransientOutputState(
          applyPassthroughOutput(useDocumentSession.getState(), nextInputText),
        );
        showOutputIfRequested(options.switchToOutputOnComplete);
        return;
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
          return;
        }

        if (!effectiveFallbackAgentId) {
          applyTransientOutputState(
            applyPassthroughOutput(useDocumentSession.getState(), nextInputText),
          );
          showOutputIfRequested(options.switchToOutputOnComplete);
          return;
        }

        effectiveFallbackAgent = getConfiguredFallbackAgentFromSelection(
          effectiveFallbackAgentId,
          fallbackAgentOptions,
        );
      }

      if (!effectiveFallbackAgent.shouldWaitForFallback) {
        applyTransientOutputState(
          applyPassthroughOutput(useDocumentSession.getState(), nextInputText),
        );
        showOutputIfRequested(options.switchToOutputOnComplete);
        return;
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
          return;
        }

        if (!shouldUseFallbackAgent) {
          applyTransientOutputState(
            applyPassthroughOutput(useDocumentSession.getState(), nextInputText),
          );
          showOutputIfRequested(options.switchToOutputOnComplete);
          return;
        }
      }

      setFallbackWaitState(
        createFallbackWaitState(requestId, nextInputText, effectiveFallbackAgent.agentName),
      );
      activeFallbackRequestIdRef.current = requestId;

      try {
        const response = await runPrettifierRequest({
          requestId,
          inputText: nextInputText,
          indentSize,
          trigger,
          ...(effectiveFallbackAgentId && effectiveFallbackAgentId !== fallbackAgentId
            ? { fallbackAgentIdOverride: effectiveFallbackAgentId }
            : {}),
        });

        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef) || !response) {
          return;
        }

        applyTransientOutputState(
          applyRemotePrettifyOutput(
            useDocumentSession.getState(),
            nextInputText,
            response.outputText,
            indentSize,
            response.status,
          ),
        );
        showOutputIfRequested(options.switchToOutputOnComplete);
      } catch (error) {
        if (!isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          return;
        }

        applyTransientOutputState(
          applyPassthroughOutput(useDocumentSession.getState(), nextInputText),
        );
        showOutputIfRequested(options.switchToOutputOnComplete);
        reportRendererError('Failed to run prettifier fallback', error);
      } finally {
        if (activeFallbackRequestIdRef.current === requestId) {
          activeFallbackRequestIdRef.current = null;
        }

        if (isLatestPrettifyRequest(requestId, latestPrettifyRequestIdRef)) {
          setFallbackWaitState(null);
        }
      }
    },
    [
      applyTransientOutputState,
      cancelFallbackRequest,
      fallbackAgentId,
      fallbackAgentOptions,
      fallbackWarningLineThreshold,
      getWindowApi,
      indentSize,
      logTelemetry,
      requestFallbackAgentSelection,
      requestFallbackConfirmation,
      prettifierService,
      runPrettifierRequest,
      setFallbackWaitState,
      setLastPrettifiedInput,
      setOutputFormattingState,
      setOutputText,
      showOutputIfRequested,
      takeActiveFallbackRequestId,
    ],
  );

  const ingestInputText = useCallback(
    (nextText: string, source: IngestSource): void => {
      setInputText(nextText);
      void logTelemetry(getIngestEventName(source), {
        source,
        inputLength: nextText.length,
        isEmpty: nextText.length === 0,
      });

      if (isFileIngestSource(source) && nextText.length === 0) {
        resetToInputState(EMPTY_FILE_NOTICE);
        return;
      }

      if (nextText.trim().length === 0) {
        resetToInputState(source === 'paste' ? undefined : null);
        return;
      }

      setIngestNotice(null);
      void runPrettifier(nextText, getIngestTrigger(source), {
        switchToOutputOnComplete: true,
      });
    },
    [logTelemetry, resetToInputState, runPrettifier, setIngestNotice, setInputText],
  );

  const resetPrettifierState = useCallback(() => {
    const activeRequestId = takeActiveFallbackRequestId();
    if (activeRequestId !== null) {
      void cancelFallbackRequest(activeRequestId);
    }
    clearTransientOutputState('');
  }, [cancelFallbackRequest, clearTransientOutputState, takeActiveFallbackRequestId]);

  const isInputAlreadyPrettified = useCallback(
    (input: string): boolean => {
      return lastPrettifiedInput === input;
    },
    [lastPrettifiedInput],
  );

  const reindentOutputIfPrettified = useCallback(
    (options: { paneMode: PaneMode; inputText: string; nextIndentSize: IndentSize }) => {
      const transition = createOutputReindentTransition(useDocumentSession.getState(), options);
      if (!transition) {
        return null;
      }

      applyTransientOutputState(transition.nextState);
      return transition.snapshot;
    },
    [applyTransientOutputState],
  );

  const restoreOutputFromSnapshot = useCallback(
    (snapshot: OutputReindentSnapshot | null): void => {
      if (!snapshot) {
        return;
      }

      setOutputText(snapshot.outputText);
      setOutputFormattingState({ ...snapshot.formattingState });
    },
    [setOutputFormattingState, setOutputText],
  );

  const alignOutputIndentAfterPersist = useCallback(
    (requestedIndentSize: IndentSize, persistedIndentSize: IndentSize): void => {
      if (requestedIndentSize === persistedIndentSize) {
        return;
      }

      const transition = createOutputReindentTransition(useDocumentSession.getState(), {
        paneMode,
        inputText,
        nextIndentSize: persistedIndentSize,
      });
      if (!transition) {
        return;
      }

      const currentIndentSize = transition.snapshot.formattingState.indentSize;
      if (currentIndentSize !== requestedIndentSize) {
        return;
      }

      applyTransientOutputState(transition.nextState);
    },
    [applyTransientOutputState, inputText, paneMode],
  );

  return {
    outputText,
    isLlmRunning,
    fallbackWaitState,
    cancelActiveFallback,
    runPrettifier,
    ingestInputText,
    resetPrettifierState,
    isInputAlreadyPrettified,
    reindentOutputIfPrettified,
    restoreOutputFromSnapshot,
    alignOutputIndentAfterPersist,
  };
};
