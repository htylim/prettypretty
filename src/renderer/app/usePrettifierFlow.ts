import { useCallback, useRef } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PrettifyRunResponse, PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import type { DocumentFileSource } from './session/documentSessionDomain';
import { reportRendererError } from './reportRendererError';
import {
  createIngestRejectionPrompt,
  EMPTY_FILE_NOTICE,
  type FallbackAgentOption,
  type FallbackWaitState,
  type IngestRejectionPrompt,
  type IngestSource,
  type PendingIngestFileSource,
  getIngestEventName,
  getIngestTrigger,
  isFileIngestSource,
} from './appDomain';
import {
  selectInputText,
  selectIngestRejectionPrompt,
  selectLastPrettifiedInput,
  selectOutputFormattingState,
  selectOutputLanguageOverride,
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
import { getLocalResultOutputLanguageOverride } from '../prettifier/localResultOutputLanguage';

type PrettifierRunOptions = {
  switchToOutputOnComplete: boolean;
  isResponseCurrent?: (() => boolean) | undefined;
};

type IngestInputTextOptions = {
  isReadableSlice?: boolean;
  originalCharCount?: number | null;
  fileSource?: PendingIngestFileSource | null;
  preservePendingFileSourceOnCommitFailure?: boolean;
  switchToOutputOnComplete?: boolean;
  awaitPrettifierCompletion?: boolean;
  isCurrent?: () => boolean;
};

export type IngestInputTextResult = 'accepted' | 'blocked' | 'failed' | 'stale';

type SourceTransitionSnapshot = {
  inputText: string;
  fileSource: DocumentFileSource | null;
  ingestRejectionPrompt: IngestRejectionPrompt | null;
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
  outputLanguageOverride: ReturnType<typeof selectOutputLanguageOverride>;
  isLlmRunning: boolean;
  fallbackWaitState: FallbackWaitState | null;
  ingestRejectionPrompt: IngestRejectionPrompt | null;
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
  ingestInputText: (
    nextText: string,
    source: IngestSource,
    options?: IngestInputTextOptions,
  ) => Promise<IngestInputTextResult>;
  openReadableIngestSlice: () => void;
  dismissIngestRejection: () => void;
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
  const readableSliceRequestKeyRef = useRef<string | null>(null);
  const paneMode = useDocumentSession(selectPaneMode);
  const inputText = useDocumentSession(selectInputText);
  const outputText = useDocumentSession(selectOutputText);
  const outputLanguageOverride = useDocumentSession(selectOutputLanguageOverride);
  const ingestRejectionPrompt = useDocumentSession(selectIngestRejectionPrompt);
  const lastPrettifiedInput = useDocumentSession(selectLastPrettifiedInput);
  const outputFormattingState = useDocumentSession(selectOutputFormattingState);
  const setPaneMode = useDocumentSession((state) => state.setPaneMode);
  const setInputText = useDocumentSession((state) => state.setInputText);
  const setFileSource = useDocumentSession((state) => state.setFileSource);
  const setIngestNotice = useDocumentSession((state) => state.setIngestNotice);
  const setIngestRejectionPrompt = useDocumentSession((state) => state.setIngestRejectionPrompt);
  const setOutputText = useDocumentSession((state) => state.setOutputText);
  const setOutputLanguageOverride = useDocumentSession((state) => state.setOutputLanguageOverride);
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

  const areFileSourcesEqual = useCallback(
    (left: DocumentFileSource | null, right: DocumentFileSource | null): boolean => {
      if (left === null || right === null) {
        return left === right;
      }

      return (
        left.sourceToken === right.sourceToken &&
        left.path === right.path &&
        left.sourceKind === right.sourceKind &&
        left.lastLoadedText === right.lastLoadedText
      );
    },
    [],
  );

  const captureSourceTransitionSnapshot = useCallback((): SourceTransitionSnapshot => {
    const state = useDocumentSession.getState();
    return {
      inputText: state.inputText,
      fileSource: state.fileSource,
      ingestRejectionPrompt: state.ingestRejectionPrompt,
    };
  }, []);

  const isSourceTransitionSnapshotCurrent = useCallback(
    (snapshot: SourceTransitionSnapshot): boolean => {
      const state = useDocumentSession.getState();
      return (
        state.inputText === snapshot.inputText &&
        areFileSourcesEqual(state.fileSource, snapshot.fileSource) &&
        state.ingestRejectionPrompt === snapshot.ingestRejectionPrompt
      );
    },
    [areFileSourcesEqual],
  );

  const clearOpenFileSource = useCallback(
    async (
      source: Pick<DocumentFileSource, 'sourceToken' | 'path'>,
      scope: 'pending' | 'committed',
    ): Promise<boolean> => {
      const api = getWindowApi();
      if (!api) {
        return false;
      }

      try {
        await api.file.clearOpenFileSource({
          sourceToken: source.sourceToken,
          path: source.path,
          scope,
        });
        return true;
      } catch (error) {
        reportRendererError('Failed to clear file source', error);
        return false;
      }
    },
    [getWindowApi],
  );

  const clearPendingPromptFileSource = useCallback(
    (prompt: IngestRejectionPrompt | null): void => {
      const pendingFileSource = prompt?.pendingFileSource;
      if (!pendingFileSource) {
        return;
      }

      void clearOpenFileSource(pendingFileSource, 'pending');
    },
    [clearOpenFileSource],
  );

  const clearCapturedIngestPrompt = useCallback(
    (
      snapshot: SourceTransitionSnapshot,
      committedFileSource: Pick<DocumentFileSource, 'sourceToken' | 'path'> | null,
    ): void => {
      const promptToClear = snapshot.ingestRejectionPrompt;
      const pendingPromptFileSource = promptToClear?.pendingFileSource;
      if (
        pendingPromptFileSource &&
        (committedFileSource === null ||
          pendingPromptFileSource.sourceToken !== committedFileSource.sourceToken ||
          pendingPromptFileSource.path !== committedFileSource.path)
      ) {
        void clearOpenFileSource(pendingPromptFileSource, 'pending');
      }

      if (useDocumentSession.getState().ingestRejectionPrompt === promptToClear) {
        setIngestRejectionPrompt(null);
      }
    },
    [clearOpenFileSource, setIngestRejectionPrompt],
  );

  const applyTransientOutputState = useCallback(
    (nextState: PrettifierSessionState): void => {
      setOutputText(nextState.outputText);
      setOutputLanguageOverride(nextState.outputLanguageOverride);
      setOutputFormattingState(nextState.outputFormattingState);
      setLastPrettifiedInput(nextState.lastPrettifiedInput);
    },
    [setLastPrettifiedInput, setOutputFormattingState, setOutputLanguageOverride, setOutputText],
  );

  const clearTransientOutputState = useCallback(
    (nextOutputText: string): void => {
      setOutputText(nextOutputText);
      setOutputLanguageOverride(null);
      setOutputFormattingState(createEmptyOutputFormattingState());
      setLastPrettifiedInput(null);
    },
    [setLastPrettifiedInput, setOutputFormattingState, setOutputLanguageOverride, setOutputText],
  );

  const applyPrettifyResponse = useCallback(
    (response: PrettifyRunResponse): void => {
      const currentState = useDocumentSession.getState();

      if (response.status === 'applied-local') {
        const outputLanguageHint = getLocalResultOutputLanguageOverride(
          response.localResult,
          response.outputText,
        );
        applyTransientOutputState(
          applyLocalPrettifyOutput(
            currentState,
            currentState.outputText,
            response.outputText,
            indentSize,
            response.localResult,
            outputLanguageHint,
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
      const inputSnapshot = useDocumentSession.getState().inputText;
      const fileSourceSnapshot = useDocumentSession.getState().fileSource;
      setOutputText(nextInputText);
      setOutputLanguageOverride(null);
      setOutputFormattingState(createEmptyOutputFormattingState());
      setLastPrettifiedInput(null);

      const response = await requestFlow.requestPrettifier(nextInputText, trigger);
      if (!response) {
        return;
      }

      if (
        inputSnapshot === nextInputText &&
        useDocumentSession.getState().inputText !== nextInputText
      ) {
        return;
      }

      if (!areFileSourcesEqual(useDocumentSession.getState().fileSource, fileSourceSnapshot)) {
        return;
      }

      if (options.isResponseCurrent && !options.isResponseCurrent()) {
        return;
      }

      applyPrettifyResponse(response);
      showOutputIfRequested(options.switchToOutputOnComplete);
    },
    [
      areFileSourcesEqual,
      applyPrettifyResponse,
      requestFlow,
      setLastPrettifiedInput,
      setOutputFormattingState,
      setOutputLanguageOverride,
      setOutputText,
      showOutputIfRequested,
    ],
  );

  const ingestInputText = useCallback(
    async (
      nextText: string,
      source: IngestSource,
      options: IngestInputTextOptions = {},
    ): Promise<IngestInputTextResult> => {
      const pendingFileSource = options.fileSource ?? null;
      const isIngestRequestCurrent = options.isCurrent ?? (() => true);
      const ingestPrompt = createIngestRejectionPrompt(
        nextText,
        source,
        pendingFileSource,
        options.switchToOutputOnComplete ?? true,
      );
      void logTelemetry(getIngestEventName(source), {
        source,
        inputLength: nextText.length,
        isEmpty: nextText.length === 0,
        blockedByMonacoLimits: ingestPrompt !== null,
        blockedByMonacoLimitReason: ingestPrompt?.rejectionReason ?? null,
        blockedByMonacoLimitActual: ingestPrompt?.rejectionActual ?? null,
        blockedByMonacoLimitThreshold: ingestPrompt?.rejectionLimit ?? null,
        openedReadableSlice: options?.isReadableSlice ?? false,
        originalInputLength: options?.originalCharCount ?? null,
      });

      if (ingestPrompt) {
        clearPendingPromptFileSource(useDocumentSession.getState().ingestRejectionPrompt);
        setIngestRejectionPrompt(ingestPrompt);
        return 'blocked';
      }

      const sourceTransitionSnapshot = captureSourceTransitionSnapshot();
      const currentFileSource = sourceTransitionSnapshot.fileSource;
      if (pendingFileSource) {
        if (!isIngestRequestCurrent()) {
          void clearOpenFileSource(pendingFileSource, 'pending');
          return 'stale';
        }

        const api = getWindowApi();
        if (!api) {
          setIngestNotice('Unable to refresh file.');
          return 'failed';
        }

        try {
          await api.file.commitOpenFileSource({
            sourceToken: pendingFileSource.sourceToken,
            path: pendingFileSource.path,
          });
        } catch (error) {
          reportRendererError('Failed to commit file source', error);
          if (!options.preservePendingFileSourceOnCommitFailure) {
            void clearOpenFileSource(pendingFileSource, 'pending');
          }
          setIngestNotice('Unable to refresh file.');
          return 'failed';
        }

        if (
          !isIngestRequestCurrent() ||
          !isSourceTransitionSnapshotCurrent(sourceTransitionSnapshot)
        ) {
          void clearOpenFileSource(pendingFileSource, 'committed');
          if (
            areFileSourcesEqual(
              useDocumentSession.getState().fileSource,
              sourceTransitionSnapshot.fileSource,
            )
          ) {
            setFileSource(null);
          }
          return 'stale';
        }

        setFileSource({
          sourceToken: pendingFileSource.sourceToken,
          path: pendingFileSource.path,
          sourceKind: pendingFileSource.sourceKind,
          lastLoadedText: nextText,
        });
      } else if ((source === 'paste' || source === 'drop') && currentFileSource) {
        const didClear = await clearOpenFileSource(currentFileSource, 'committed');
        if (!didClear) {
          setIngestNotice('Unable to refresh file.');
          return 'failed';
        }

        if (!isSourceTransitionSnapshotCurrent(sourceTransitionSnapshot)) {
          if (
            areFileSourcesEqual(
              useDocumentSession.getState().fileSource,
              sourceTransitionSnapshot.fileSource,
            )
          ) {
            setFileSource(null);
          }
          return 'stale';
        }

        setFileSource(null);
      }

      clearCapturedIngestPrompt(sourceTransitionSnapshot, pendingFileSource);
      setInputText(nextText);

      if (isFileIngestSource(source) && nextText.length === 0) {
        resetToInputState(EMPTY_FILE_NOTICE);
        return 'accepted';
      }

      if (nextText.trim().length === 0) {
        resetToInputState(source === 'paste' ? undefined : null);
        return 'accepted';
      }

      setIngestNotice(null);
      const responseTransitionSnapshot = captureSourceTransitionSnapshot();
      const responsePaneMode = useDocumentSession.getState().paneMode;
      const prettifierPromise = runPrettifier(nextText, getIngestTrigger(source), {
        isResponseCurrent: () =>
          isSourceTransitionSnapshotCurrent(responseTransitionSnapshot) &&
          useDocumentSession.getState().paneMode === responsePaneMode,
        switchToOutputOnComplete: options.switchToOutputOnComplete ?? true,
      });
      if (options.awaitPrettifierCompletion === true) {
        await prettifierPromise;
      } else {
        void prettifierPromise;
      }
      return 'accepted';
    },
    [
      areFileSourcesEqual,
      captureSourceTransitionSnapshot,
      clearCapturedIngestPrompt,
      clearOpenFileSource,
      clearPendingPromptFileSource,
      logTelemetry,
      getWindowApi,
      isSourceTransitionSnapshotCurrent,
      resetToInputState,
      runPrettifier,
      setFileSource,
      setIngestNotice,
      setIngestRejectionPrompt,
      setInputText,
    ],
  );

  const openReadableIngestSlice = useCallback((): void => {
    const pendingPrompt = useDocumentSession.getState().ingestRejectionPrompt;
    if (!pendingPrompt) {
      return;
    }

    const readableSliceRequestKey = pendingPrompt.pendingFileSource
      ? `${pendingPrompt.pendingFileSource.sourceToken}:${pendingPrompt.pendingFileSource.path}`
      : null;
    if (
      readableSliceRequestKey !== null &&
      readableSliceRequestKeyRef.current === readableSliceRequestKey
    ) {
      return;
    }

    readableSliceRequestKeyRef.current = readableSliceRequestKey;
    void ingestInputText(pendingPrompt.recoveryText, pendingPrompt.source, {
      isReadableSlice: true,
      originalCharCount: pendingPrompt.originalCharCount,
      preservePendingFileSourceOnCommitFailure: true,
      switchToOutputOnComplete: pendingPrompt.switchToOutputOnComplete,
      fileSource: pendingPrompt.pendingFileSource
        ? {
            ...pendingPrompt.pendingFileSource,
            baselineText: pendingPrompt.recoveryText,
          }
        : null,
    }).finally(() => {
      if (readableSliceRequestKeyRef.current === readableSliceRequestKey) {
        readableSliceRequestKeyRef.current = null;
      }
    });
  }, [ingestInputText]);

  const dismissIngestRejection = useCallback((): void => {
    clearPendingPromptFileSource(useDocumentSession.getState().ingestRejectionPrompt);
    setIngestRejectionPrompt(null);
  }, [clearPendingPromptFileSource, setIngestRejectionPrompt]);

  const resetPrettifierState = useCallback(() => {
    void requestFlow.discardActiveFallback();
    clearPendingPromptFileSource(useDocumentSession.getState().ingestRejectionPrompt);
    setIngestRejectionPrompt(null);
    clearTransientOutputState('');
  }, [
    clearPendingPromptFileSource,
    clearTransientOutputState,
    requestFlow,
    setIngestRejectionPrompt,
  ]);

  const isInputAlreadyPrettified = useCallback(
    (input: string): boolean => {
      const needsFreshPrettifyForCurrentIndent =
        outputFormattingState.isPrettified &&
        outputFormattingState.indentSize !== null &&
        outputFormattingState.indentSize !== indentSize &&
        outputFormattingState.reindentStrategy === 'none';

      return lastPrettifiedInput === input && !needsFreshPrettifyForCurrentIndent;
    },
    [indentSize, lastPrettifiedInput, outputFormattingState],
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
      setOutputLanguageOverride(snapshot.outputLanguageOverride);
      setOutputFormattingState({ ...snapshot.formattingState });
    },
    [setOutputFormattingState, setOutputLanguageOverride, setOutputText],
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
    outputLanguageOverride,
    isLlmRunning: requestFlow.isLlmRunning,
    fallbackWaitState: requestFlow.fallbackWaitState,
    ingestRejectionPrompt,
    cancelActiveFallback,
    runPrettifierRequest: requestFlow.requestPrettifier,
    runPrettifier,
    ingestInputText,
    openReadableIngestSlice,
    dismissIngestRejection,
    resetPrettifierState,
    isInputAlreadyPrettified,
    reindentOutputIfPrettified,
    restoreOutputFromSnapshot,
    alignOutputIndentAfterPersist,
  };
};
