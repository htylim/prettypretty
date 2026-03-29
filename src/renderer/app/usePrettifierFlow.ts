import { useCallback } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PrettifyRunResponse, PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import {
  EMPTY_FILE_NOTICE,
  type FallbackAgentOption,
  type FallbackWaitState,
  type IngestSource,
  getIngestEventName,
  getIngestTrigger,
  isFileIngestSource,
} from './appDomain';
import {
  selectInputText,
  selectLastPrettifiedInput,
  selectOutputText,
  selectPaneMode,
} from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';
import {
  applyLocalPrettifyOutput,
  applyPassthroughOutput,
  applyRemotePrettifyOutput,
  createEmptyOutputFormattingState,
  createOutputReindentTransition,
  type PrettifierSessionState,
  type OutputReindentSnapshot,
} from './session/prettifierSessionDomain';
import { usePrettifierRequestFlow } from './usePrettifierRequestFlow';

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
  runPrettifierRequest: (
    nextInputText: string,
    trigger: PrettifyTrigger,
  ) => Promise<PrettifyRunResponse | null>;
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
  const paneMode = useDocumentSession(selectPaneMode);
  const inputText = useDocumentSession(selectInputText);
  const outputText = useDocumentSession(selectOutputText);
  const lastPrettifiedInput = useDocumentSession(selectLastPrettifiedInput);
  const setPaneMode = useDocumentSession((state) => state.setPaneMode);
  const setInputText = useDocumentSession((state) => state.setInputText);
  const setIngestNotice = useDocumentSession((state) => state.setIngestNotice);
  const setOutputText = useDocumentSession((state) => state.setOutputText);
  const setOutputFormattingState = useDocumentSession((state) => state.setOutputFormattingState);
  const setLastPrettifiedInput = useDocumentSession((state) => state.setLastPrettifiedInput);

  const requestFlow = usePrettifierRequestFlow({
    indentSize,
    fallbackWarningLineThreshold,
    fallbackAgentId,
    fallbackAgentOptions,
    getWindowApi,
    requestFallbackConfirmation,
    requestFallbackAgentSelection,
    logTelemetry,
  });

  const applyTransientOutputState = useCallback(
    (nextState: PrettifierSessionState): void => {
      setOutputText(nextState.outputText);
      setOutputFormattingState(nextState.outputFormattingState);
      setLastPrettifiedInput(nextState.lastPrettifiedInput);
    },
    [setLastPrettifiedInput, setOutputFormattingState, setOutputText],
  );

  const clearTransientOutputState = useCallback(
    (nextOutputText: string): void => {
      setOutputText(nextOutputText);
      setOutputFormattingState(createEmptyOutputFormattingState());
      setLastPrettifiedInput(null);
    },
    [setLastPrettifiedInput, setOutputFormattingState, setOutputText],
  );

  const applyPrettifyResponse = useCallback(
    (response: PrettifyRunResponse): void => {
      const currentState = useDocumentSession.getState();

      if (response.status === 'applied-local') {
        applyTransientOutputState(
          applyLocalPrettifyOutput(
            currentState,
            currentState.outputText,
            response.outputText,
            indentSize,
          ),
        );
        return;
      }

      if (response.status === 'applied-fallback') {
        applyTransientOutputState(
          applyRemotePrettifyOutput(
            currentState,
            currentState.outputText,
            response.outputText,
            indentSize,
            response.status,
          ),
        );
        return;
      }

      applyTransientOutputState(applyPassthroughOutput(currentState, response.outputText));
    },
    [applyTransientOutputState, indentSize],
  );

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
      void requestFlow.discardActiveFallback();
      clearTransientOutputState('');
      setPaneMode('input');
      if (notice !== undefined) {
        setIngestNotice(notice);
      }
    },
    [clearTransientOutputState, requestFlow, setIngestNotice, setPaneMode],
  );

  const cancelActiveFallback = useCallback(async (): Promise<void> => {
    await requestFlow.cancelActiveFallback();
  }, [requestFlow]);

  const runPrettifier = useCallback(
    async (
      nextInputText: string,
      trigger: PrettifyTrigger,
      options: PrettifierRunOptions,
    ): Promise<void> => {
      setOutputText(nextInputText);
      setOutputFormattingState(createEmptyOutputFormattingState());
      setLastPrettifiedInput(null);

      const response = await requestFlow.requestPrettifier(nextInputText, trigger);
      if (!response) {
        return;
      }

      applyPrettifyResponse(response);
      showOutputIfRequested(options.switchToOutputOnComplete);
    },
    [
      applyPrettifyResponse,
      requestFlow,
      setLastPrettifiedInput,
      setOutputFormattingState,
      setOutputText,
      showOutputIfRequested,
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
    void requestFlow.discardActiveFallback();
    clearTransientOutputState('');
  }, [clearTransientOutputState, requestFlow]);

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
    isLlmRunning: requestFlow.isLlmRunning,
    fallbackWaitState: requestFlow.fallbackWaitState,
    cancelActiveFallback,
    runPrettifierRequest: requestFlow.requestPrettifier,
    runPrettifier,
    ingestInputText,
    resetPrettifierState,
    isInputAlreadyPrettified,
    reindentOutputIfPrettified,
    restoreOutputFromSnapshot,
    alignOutputIndentAfterPersist,
  };
};
