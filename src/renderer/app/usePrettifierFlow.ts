import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PrettifyRunStatus, PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import { detectFallbackFormatLabel } from '../prettifier/detectFallbackFormat';
import {
  createPrettifierService,
  type PrettifyDetailedResult,
} from '../prettifier/prettifierService';
import { reindentText } from '../prettifier/reindentText';
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

type PrettifierRunOptions = {
  switchToOutputOnComplete: boolean;
};

type OutputFormattingState = {
  isPrettified: boolean;
  indentSize: IndentSize | null;
};

type OutputReindentSnapshot = {
  outputText: string;
  formattingState: OutputFormattingState;
};

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UsePrettifierFlowOptions = {
  indentSize: IndentSize;
  fallbackWarningLineThreshold: number;
  setPaneMode: (mode: PaneMode) => void;
  setInputText: (text: string) => void;
  setIngestNotice: (notice: string | null) => void;
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
  cancelDetachedEmbeddedPrettify: () => Promise<void>;
  prettifyEmbeddedContent: (rawText: string) => PrettifyDetailedResult;
  prettifyEmbeddedContentForPane: (rawText: string) => Promise<string>;
  prettifyEmbeddedContentForReplace: (rawText: string) => Promise<string>;
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

const createEmptyFormattingState = (): OutputFormattingState => ({
  isPrettified: false,
  indentSize: null,
});

const isAppliedPrettifyStatus = (status: PrettifyRunStatus): boolean => {
  return status === 'applied-local' || status === 'applied-fallback';
};

const getLineCount = (value: string): number => {
  if (value.length === 0) {
    return 0;
  }

  return value.split(/\r\n|\r|\n/u).length;
};

/**
 * Owns renderer-side prettifier state: local formatting, fallback wait/cancel
 * orchestration, ingest-driven runs, and lightweight output reindentation when
 * only indentation preferences change.
 */
export const usePrettifierFlow = ({
  indentSize,
  fallbackWarningLineThreshold,
  setPaneMode,
  setInputText,
  setIngestNotice,
  fallbackAgentId,
  fallbackAgentOptions,
  getWindowApi,
  requestFallbackConfirmation,
  requestFallbackAgentSelection,
  logTelemetry,
}: UsePrettifierFlowOptions): UsePrettifierFlowResult => {
  const latestPrettifyRequestIdRef = useRef(0);
  // Detached embedded-prettify runs need valid positive request ids, but they
  // must stay out of the main runPrettifier sequence to avoid collisions.
  const nextDetachedPrettifyRequestIdRef = useRef(1_000_000_000);
  const activeFallbackRequestIdRef = useRef<number | null>(null);
  const activeDetachedPrettifyRequestIdsRef = useRef<Set<number>>(new Set());
  const lastPrettifiedInputRef = useRef<string | null>(null);
  const outputFormattingRef = useRef<OutputFormattingState>(createEmptyFormattingState());
  const [outputText, setOutputText] = useState('');
  const [isLlmRunning, setIsLlmRunning] = useState(false);
  const [fallbackWaitState, setFallbackWaitState] = useState<FallbackWaitState | null>(null);

  const prettifierService = useMemo(() => createPrettifierService(indentSize), [indentSize]);
  // Every async branch checks the current request id before mutating state so
  // superseded runs cannot overwrite newer output or wait-state.
  const isLatestRequest = useCallback((requestId: number): boolean => {
    return requestId === latestPrettifyRequestIdRef.current;
  }, []);

  const cancelFallbackRequest = useCallback(
    async (requestId: number): Promise<void> => {
      const api = getWindowApi();
      if (!api) {
        return;
      }

      try {
        await api.prettifier.cancel({ requestId });
      } catch (error) {
        reportRendererError('Failed to cancel prettifier fallback', error);
      }
    },
    [getWindowApi],
  );

  const clearOutputFormatting = useCallback((): void => {
    outputFormattingRef.current = createEmptyFormattingState();
  }, []);

  // Embedded pane formatting should mirror the same local-pass behavior as the
  // root output flow, including passthrough text on malformed/unsupported input.
  const prettifyEmbeddedContent = useCallback(
    (rawText: string): PrettifyDetailedResult => {
      return prettifierService.prettifyDetailed(rawText);
    },
    [prettifierService],
  );

  const takeDetachedPrettifyRequestId = useCallback((): number => {
    const requestId = nextDetachedPrettifyRequestIdRef.current;
    nextDetachedPrettifyRequestIdRef.current += 1;
    return requestId;
  }, []);

  const cancelDetachedEmbeddedPrettify = useCallback(async (): Promise<void> => {
    const requestIds = [...activeDetachedPrettifyRequestIdsRef.current];
    if (requestIds.length === 0) {
      return;
    }

    await Promise.all(requestIds.map((requestId) => cancelFallbackRequest(requestId)));
  }, [cancelFallbackRequest]);

  /**
   * Independent pane formatting should preserve the main output state while
   * still reusing the configured local/fallback prettifier contract.
   */
  const prettifyEmbeddedContentForPane = useCallback(
    async (rawText: string): Promise<string> => {
      const localResult = prettifyEmbeddedContent(rawText);
      if (localResult.kind === 'applied') {
        return localResult.outputText;
      }

      const api = getWindowApi();
      if (!api) {
        return localResult.outputText;
      }

      const configuredFallbackAgent = getConfiguredFallbackAgentFromSelection(
        fallbackAgentId,
        fallbackAgentOptions,
      );
      if (!configuredFallbackAgent.shouldWaitForFallback) {
        return localResult.outputText;
      }

      const requestId = takeDetachedPrettifyRequestId();
      activeDetachedPrettifyRequestIdsRef.current.add(requestId);

      try {
        const response = await api.prettifier.run({
          requestId,
          inputText: rawText,
          indentSize,
          trigger: 'switch-output',
        });
        return response.outputText;
      } catch (error) {
        reportRendererError('Failed to run embedded pane prettifier fallback', error);
        return localResult.outputText;
      } finally {
        activeDetachedPrettifyRequestIdsRef.current.delete(requestId);
      }
    },
    [
      fallbackAgentId,
      fallbackAgentOptions,
      getWindowApi,
      indentSize,
      prettifyEmbeddedContent,
      takeDetachedPrettifyRequestId,
    ],
  );

  const prettifyEmbeddedContentForReplace = useCallback(
    async (rawText: string): Promise<string> => {
      return await prettifyEmbeddedContentForPane(rawText);
    },
    [prettifyEmbeddedContentForPane],
  );

  // Clearing a run invalidates all pending responses by advancing the shared request id.
  const clearRunState = useCallback(
    (nextOutputText: string): void => {
      latestPrettifyRequestIdRef.current += 1;
      lastPrettifiedInputRef.current = null;
      setIsLlmRunning(false);
      setFallbackWaitState(null);
      setOutputText(nextOutputText);
      clearOutputFormatting();
    },
    [clearOutputFormatting],
  );

  const takeActiveFallbackRequestId = useCallback((): number | null => {
    const activeRequestId = activeFallbackRequestIdRef.current;
    activeFallbackRequestIdRef.current = null;

    return activeRequestId;
  }, []);

  const showOutputIfRequested = useCallback(
    (shouldSwitchToOutput: boolean): void => {
      if (shouldSwitchToOutput) {
        setPaneMode('output');
      }
    },
    [setPaneMode],
  );

  const applyPassthroughOutput = useCallback(
    (nextInputText: string, options: PrettifierRunOptions): void => {
      setOutputText(nextInputText);
      lastPrettifiedInputRef.current = nextInputText;
      clearOutputFormatting();
      showOutputIfRequested(options.switchToOutputOnComplete);
    },
    [clearOutputFormatting, showOutputIfRequested],
  );

  const applyPrettifiedOutput = useCallback(
    (inputText: string, prettifiedText: string, options: PrettifierRunOptions): void => {
      setOutputText(prettifiedText);
      lastPrettifiedInputRef.current = inputText;
      outputFormattingRef.current = {
        isPrettified: true,
        indentSize,
      };
      showOutputIfRequested(options.switchToOutputOnComplete);
    },
    [indentSize, showOutputIfRequested],
  );

  const resetToInputState = useCallback(
    (notice?: string | null): void => {
      const activeRequestId = takeActiveFallbackRequestId();
      if (activeRequestId !== null) {
        void cancelFallbackRequest(activeRequestId);
      }

      clearRunState('');
      setPaneMode('input');
      if (notice !== undefined) {
        setIngestNotice(notice);
      }
    },
    [
      cancelFallbackRequest,
      clearRunState,
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
    clearRunState('');
    setPaneMode('input');
    if (activeRequestId !== null) {
      await cancelFallbackRequest(activeRequestId);
    }
  }, [cancelFallbackRequest, clearRunState, setPaneMode, takeActiveFallbackRequestId]);

  const runPrettifier = useCallback(
    async (
      nextInputText: string,
      trigger: PrettifyTrigger,
      options: PrettifierRunOptions,
    ): Promise<void> => {
      // Starting a new run always cancels any in-flight fallback first so progress
      // events and completion results stay correlated to one active request.
      if (activeFallbackRequestIdRef.current !== null) {
        const previousRequestId = takeActiveFallbackRequestId();
        if (previousRequestId !== null) {
          void cancelFallbackRequest(previousRequestId);
        }
      }

      const requestId = latestPrettifyRequestIdRef.current + 1;
      latestPrettifyRequestIdRef.current = requestId;
      setIsLlmRunning(false);
      setFallbackWaitState(null);
      setOutputText(nextInputText);
      clearOutputFormatting();

      const localResult = prettifierService.prettifyDetailed(nextInputText);
      void logTelemetry('renderer.prettifier.local.result', {
        trigger,
        inputLength: nextInputText.length,
        localDetection: localResult.localDetection,
        localResultKind: localResult.kind,
      });

      if (localResult.kind === 'applied') {
        if (!isLatestRequest(requestId)) {
          return;
        }

        applyPrettifiedOutput(nextInputText, localResult.outputText, options);
        return;
      }

      const api = getWindowApi();
      if (!api) {
        if (!isLatestRequest(requestId)) {
          return;
        }

        applyPassthroughOutput(nextInputText, options);
        return;
      }

      const configuredFallbackAgent = getConfiguredFallbackAgentFromSelection(
        fallbackAgentId,
        fallbackAgentOptions,
      );
      const hasEnabledFallbackAgentOption = fallbackAgentOptions.some((option) => option.enabled);
      let effectiveFallbackAgentId = fallbackAgentId;
      let effectiveFallbackAgent = configuredFallbackAgent;

      if (!configuredFallbackAgent.shouldWaitForFallback && hasEnabledFallbackAgentOption) {
        effectiveFallbackAgentId = await requestFallbackAgentSelection();
        if (!isLatestRequest(requestId)) {
          return;
        }

        if (!effectiveFallbackAgentId) {
          applyPassthroughOutput(nextInputText, options);
          return;
        }

        effectiveFallbackAgent = getConfiguredFallbackAgentFromSelection(
          effectiveFallbackAgentId,
          fallbackAgentOptions,
        );
      }

      if (!effectiveFallbackAgent.shouldWaitForFallback) {
        applyPassthroughOutput(nextInputText, options);
        return;
      }

      const lineCount = getLineCount(nextInputText);
      const shouldPromptForFallbackConfirmation =
        effectiveFallbackAgent.shouldWaitForFallback && lineCount > fallbackWarningLineThreshold;

      if (shouldPromptForFallbackConfirmation) {
        const shouldUseFallbackAgent = await requestFallbackConfirmation(lineCount);
        if (!isLatestRequest(requestId)) {
          return;
        }

        if (!shouldUseFallbackAgent) {
          applyPassthroughOutput(nextInputText, options);
          return;
        }
      }

      setFallbackWaitState({
        requestId,
        formatLabel: detectFallbackFormatLabel(nextInputText),
        agentName: effectiveFallbackAgent.agentName,
        progressLines: [],
      });
      // Only one fallback request can be active at a time in the renderer; the
      // stored id is used for explicit cancellation and progress correlation.
      activeFallbackRequestIdRef.current = requestId;
      setIsLlmRunning(true);

      try {
        const response = await api.prettifier.run({
          requestId,
          inputText: nextInputText,
          indentSize,
          trigger,
          ...(effectiveFallbackAgentId && effectiveFallbackAgentId !== fallbackAgentId
            ? { fallbackAgentIdOverride: effectiveFallbackAgentId }
            : {}),
        });

        if (!isLatestRequest(requestId)) {
          return;
        }

        setOutputText(response.outputText);
        lastPrettifiedInputRef.current = nextInputText;
        outputFormattingRef.current = {
          isPrettified: isAppliedPrettifyStatus(response.status),
          indentSize: isAppliedPrettifyStatus(response.status) ? indentSize : null,
        };
        showOutputIfRequested(options.switchToOutputOnComplete);
      } catch (error) {
        if (!isLatestRequest(requestId)) {
          return;
        }

        applyPassthroughOutput(nextInputText, options);
        reportRendererError('Failed to run prettifier fallback', error);
      } finally {
        if (activeFallbackRequestIdRef.current === requestId) {
          activeFallbackRequestIdRef.current = null;
        }

        if (isLatestRequest(requestId)) {
          setIsLlmRunning(false);
          setFallbackWaitState(null);
        }
      }
    },
    [
      applyPassthroughOutput,
      applyPrettifiedOutput,
      fallbackAgentId,
      fallbackAgentOptions,
      fallbackWarningLineThreshold,
      getWindowApi,
      isLatestRequest,
      logTelemetry,
      prettifierService,
      requestFallbackConfirmation,
      requestFallbackAgentSelection,
      cancelFallbackRequest,
      clearOutputFormatting,
      indentSize,
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

      // Empty whitespace should reset the UI instead of showing passthrough output.
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
    void cancelDetachedEmbeddedPrettify();
    clearRunState('');
  }, [
    cancelDetachedEmbeddedPrettify,
    cancelFallbackRequest,
    clearRunState,
    takeActiveFallbackRequestId,
  ]);

  const isInputAlreadyPrettified = useCallback((input: string): boolean => {
    return lastPrettifiedInputRef.current === input;
  }, []);

  const reindentOutputIfPrettified = useCallback(
    (options: { paneMode: PaneMode; inputText: string; nextIndentSize: IndentSize }) => {
      const currentFormatting = outputFormattingRef.current;
      const hasInputContent = options.inputText.trim().length > 0;
      const canReindent =
        options.paneMode === 'output' &&
        hasInputContent &&
        currentFormatting.isPrettified &&
        currentFormatting.indentSize !== null &&
        currentFormatting.indentSize !== options.nextIndentSize;

      if (!canReindent || currentFormatting.indentSize === null) {
        return null;
      }
      const currentIndentSize = currentFormatting.indentSize;

      const snapshot: OutputReindentSnapshot = {
        outputText,
        formattingState: { ...currentFormatting },
      };

      setOutputText((currentOutputText) =>
        reindentText(currentOutputText, currentIndentSize, options.nextIndentSize),
      );
      outputFormattingRef.current = {
        isPrettified: true,
        indentSize: options.nextIndentSize,
      };

      return snapshot;
    },
    [outputText],
  );

  const restoreOutputFromSnapshot = useCallback((snapshot: OutputReindentSnapshot | null): void => {
    if (!snapshot) {
      return;
    }

    setOutputText(snapshot.outputText);
    outputFormattingRef.current = { ...snapshot.formattingState };
  }, []);

  const alignOutputIndentAfterPersist = useCallback(
    (requestedIndentSize: IndentSize, persistedIndentSize: IndentSize): void => {
      if (requestedIndentSize === persistedIndentSize) {
        return;
      }

      const currentFormatting = outputFormattingRef.current;
      if (!currentFormatting.isPrettified || currentFormatting.indentSize !== requestedIndentSize) {
        return;
      }

      setOutputText((currentOutputText) =>
        reindentText(currentOutputText, requestedIndentSize, persistedIndentSize),
      );
      outputFormattingRef.current = {
        isPrettified: true,
        indentSize: persistedIndentSize,
      };
    },
    [],
  );

  useEffect(() => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    // Main emits progress for every request, so renderer filters by `requestId`
    // before appending to the visible rolling buffer.
    return api.prettifier.onProgress((event) => {
      setFallbackWaitState((currentState) => {
        if (!currentState || currentState.requestId !== event.requestId) {
          return currentState;
        }

        return {
          ...currentState,
          progressLines: appendFallbackProgressLine(currentState.progressLines, event.line),
        };
      });
    });
  }, [getWindowApi]);

  return {
    outputText,
    isLlmRunning,
    fallbackWaitState,
    cancelActiveFallback,
    cancelDetachedEmbeddedPrettify,
    prettifyEmbeddedContent,
    prettifyEmbeddedContentForPane,
    prettifyEmbeddedContentForReplace,
    runPrettifier,
    ingestInputText,
    resetPrettifierState,
    isInputAlreadyPrettified,
    reindentOutputIfPrettified,
    restoreOutputFromSnapshot,
    alignOutputIndentAfterPersist,
  };
};
