import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { RefreshableOpenTextFile } from '../../shared/ipc-contracts';
import type { IndentSize } from '../../shared/preferences';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode, ThemeMode } from '../../shared/types';
import type { InputEditorHandle } from '../components/InputEditor';
import type { EditorViewportSnapshot } from '../components/InputEditor';
import type { OutputEditorHandle } from '../components/OutputEditor';
import type {
  FallbackAgentOption,
  FallbackWaitState,
  IngestRejectionPrompt,
  IngestSource,
} from './appDomain';
import { reportRendererError } from './reportRendererError';
import type { OutputLanguageId } from '../output/detectOutputLanguage';
import {
  resolveContextPrettifyTarget,
  type ContextPrettifyTarget,
} from '../output/contextPrettifyTarget';
import { mapOutputPaneViewportSnapshotToRoot, ROOT_OUTPUT_PANE_ID } from './outputPaneDomain';
import { getLocalResultOutputLanguageOverride } from '../prettifier/localResultOutputLanguage';
import {
  selectIndentSize,
  selectFileSource,
  selectIngestNotice,
  selectInputText,
  selectPaneMode,
  selectThemeMode,
} from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';
import type { DocumentFileSource, DocumentSessionState } from './session/documentSessionDomain';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useMouseNavigationShortcuts } from './useMouseNavigationShortcuts';
import { useOutputPaneController } from './useOutputPaneController';
import { usePreferencesFlow } from './usePreferencesFlow';
import { useFallbackModalRuntime } from './session/useFallbackModalRuntime';
import { usePrettifierFlow } from './usePrettifierFlow';
import type { FallbackModalState } from './session/prettifierSessionDomain';
import { getWindowApi } from './windowApi';

type TelemetryMeta = Record<string, string | number | boolean | null>;

// StrictMode remounts this tree in dev, so remember which startup files have
// already been applied within the current renderer process.
const consumedInitialOpenFilePaths = new Set<string>();

type UseAppControllerOptions = {
  initialOpenFile: RefreshableOpenTextFile | null;
  inputEditorRef: RefObject<InputEditorHandle | null>;
};

type ResetDocumentSnapshot = Pick<
  DocumentSessionState,
  | 'paneMode'
  | 'inputText'
  | 'fileSource'
  | 'ingestNotice'
  | 'ingestRejectionPrompt'
  | 'outputText'
  | 'outputLanguageOverride'
  | 'outputFormattingState'
  | 'fallbackWaitState'
  | 'fallbackModalState'
  | 'lastPrettifiedInput'
  | 'outputPaneChainState'
>;

export type DirtyRefreshPrompt = {
  fileSource: DocumentFileSource;
  inputText: string;
};

type RefreshRequestSnapshot = {
  requestId: number;
  fileSource: DocumentFileSource;
  inputText: string;
  paneMode: PaneMode;
  viewportSnapshot: EditorViewportSnapshot | null;
  viewportInteractionVersion: number;
};

const captureResetDocumentSnapshot = (state: DocumentSessionState): ResetDocumentSnapshot => ({
  paneMode: state.paneMode,
  inputText: state.inputText,
  fileSource: state.fileSource,
  ingestNotice: state.ingestNotice,
  ingestRejectionPrompt: state.ingestRejectionPrompt,
  outputText: state.outputText,
  outputLanguageOverride: state.outputLanguageOverride,
  outputFormattingState: state.outputFormattingState,
  fallbackWaitState: state.fallbackWaitState,
  fallbackModalState: state.fallbackModalState,
  lastPrettifiedInput: state.lastPrettifiedInput,
  outputPaneChainState: state.outputPaneChainState,
});

export type OutputContextMenuState = {
  paneId: string;
  anchorX: number;
  anchorY: number;
  target: ContextPrettifyTarget | null;
};

export type UseAppControllerResult = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  inputText: string;
  ingestNotice: string | null;
  ingestRejectionPrompt: IngestRejectionPrompt | null;
  outputText: string;
  outputDocumentId: string;
  outputPanes: ReturnType<typeof useOutputPaneController>['outputPanes'];
  activeOutputPaneId: string;
  outputLeftVisiblePaneIndex: number;
  visibleOutputPanePosition: {
    current: number;
    total: number;
  } | null;
  outputPaneFocusRequest: ReturnType<typeof useOutputPaneController>['outputPaneFocusRequest'];
  outputContextMenuState: OutputContextMenuState | null;
  fallbackWaitState: FallbackWaitState | null;
  fallbackWarningLineThreshold: number;
  fallbackModalState: FallbackModalState | null;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  canRefreshFile: boolean;
  isRefreshingFile: boolean;
  dirtyRefreshPrompt: DirtyRefreshPrompt | null;
  hasContent: boolean;
  hasDerivedOutputPane: boolean;
  canNavigateOutputPaneLeft: boolean;
  canNavigateOutputPaneRight: boolean;
  onCancelActiveFallback: () => Promise<void>;
  onNew: () => void;
  onPaneModeChange: (mode: PaneMode) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSave: () => Promise<void>;
  onCopy: () => Promise<void>;
  onRefreshFile: () => void;
  onCancelDirtyRefresh: () => void;
  onConfirmDirtyRefresh: () => void;
  onCloseSplit: () => void;
  onNavigateOutputPaneViewport: (stepDelta: number) => void;
  onNavigateOutputPaneLeft: () => void;
  onNavigateOutputPaneRight: () => void;
  onThemeModeChange: (mode: ThemeMode) => Promise<void>;
  onIndentSizeChange: (size: IndentSize) => Promise<void>;
  onFallbackAgentIdChange: (agentId: string | null) => Promise<void>;
  onEditInputChange: (value: string) => void;
  onIngestInput: (value: string, source: IngestSource) => void;
  onDismissIngestNotice: () => void;
  onDismissIngestRejection: () => void;
  onOpenReadableIngestSlice: () => void;
  onOpenFile: () => Promise<void>;
  onOutputPaneHandleChange: ReturnType<typeof useOutputPaneController>['onOutputPaneHandleChange'];
  onOutputPaneFocus: (paneId: string) => void;
  onToggleExtractedSourcePane: ReturnType<
    typeof useOutputPaneController
  >['onToggleExtractedSourcePane'];
  onOutputPaneContextMenu: (
    paneId: string,
    request: {
      anchorX: number;
      anchorY: number;
      isContentHit: boolean;
      position: {
        lineNumber: number;
        column: number;
      } | null;
      hasSelection: boolean;
    },
    value: string,
    paneDocumentLanguage: OutputLanguageId,
  ) => void;
  onDismissOutputContextMenu: () => void;
  onTriggerOutputContextPrettify: () => void;
  onViewportInteraction: () => void;
  onCancelFallback: () => void;
  onConfirmFallback: () => void;
  onSelectFallbackAgent: (agentId: string) => void;
};

/**
 * Top-level renderer controller. It composes persisted preferences, document
 * session state, renderer runtimes, and window-level actions so `App` can stay
 * composition-only.
 */
export const useAppController = ({
  initialOpenFile,
  inputEditorRef,
}: UseAppControllerOptions): UseAppControllerResult => {
  const latestIndentSizeRequestIdRef = useRef(0);
  const paneMode = useDocumentSession(selectPaneMode);
  const themeMode = useDocumentSession(selectThemeMode);
  const indentSize = useDocumentSession(selectIndentSize);
  const inputText = useDocumentSession(selectInputText);
  const fileSource = useDocumentSession(selectFileSource);
  const ingestNotice = useDocumentSession(selectIngestNotice);
  const reset = useDocumentSession((state) => state.reset);
  const setPaneMode = useDocumentSession((state) => state.setPaneMode);
  const setThemeMode = useDocumentSession((state) => state.setThemeMode);
  const setIndentSize = useDocumentSession((state) => state.setIndentSize);
  const setInputText = useDocumentSession((state) => state.setInputText);
  const setIngestNotice = useDocumentSession((state) => state.setIngestNotice);
  const latestRefreshRequestIdRef = useRef(0);
  const isRefreshingFileRef = useRef(false);
  const pendingViewportRestoreRef = useRef<RefreshRequestSnapshot | null>(null);
  const viewportInteractionVersionRef = useRef(0);
  const [isRefreshingFile, setIsRefreshingFile] = useState(false);
  const [viewportRestoreRequestId, setViewportRestoreRequestId] = useState(0);
  const [dirtyRefreshPrompt, setDirtyRefreshPrompt] = useState<DirtyRefreshPrompt | null>(null);
  const {
    fallbackModalState,
    requestFallbackConfirmation,
    requestFallbackAgentSelection,
    cancelPendingFallbackPrompts,
    settleFallbackConfirmation,
    settleFallbackAgentSelection,
  } = useFallbackModalRuntime();

  const logTelemetry = useCallback(
    async (name: TelemetryEventName, meta: TelemetryMeta): Promise<void> => {
      const api = getWindowApi();
      if (!api) {
        return;
      }

      try {
        await api.telemetry.log({ name, meta });
      } catch (error) {
        reportRendererError('Failed to emit telemetry event', error);
      }
    },
    [],
  );

  const {
    fallbackAgentId,
    fallbackAgentOptions,
    fallbackWarningLineThreshold,
    invalidateHydratedPreferences,
    persistThemeMode,
    persistFallbackAgentId,
  } = usePreferencesFlow({
    themeMode,
    setThemeMode,
    setIndentSize,
    getWindowApi,
  });

  const {
    outputText,
    outputLanguageOverride,
    isLlmRunning,
    fallbackWaitState,
    ingestRejectionPrompt: activeIngestRejectionPrompt,
    cancelActiveFallback,
    runPrettifier,
    runPrettifierRequest,
    ingestInputText,
    openReadableIngestSlice,
    dismissIngestRejection,
    resetPrettifierState,
    isInputAlreadyPrettified,
    reindentOutputIfPrettified,
    restoreOutputFromSnapshot,
    alignOutputIndentAfterPersist,
  } = usePrettifierFlow({
    indentSize,
    fallbackWarningLineThreshold,
    fallbackAgentId,
    fallbackAgentOptions,
    getWindowApi,
    requestFallbackConfirmation,
    requestFallbackAgentSelection,
    logTelemetry,
  });
  const {
    outputDocumentId,
    outputPanes,
    activeOutputPaneId,
    leftVisiblePaneIndex: outputLeftVisiblePaneIndex,
    visibleOutputPanePosition: rawVisibleOutputPanePosition,
    hasDerivedOutputPane: hasVisibleDerivedOutputPane,
    canNavigateOutputPaneLeft,
    canNavigateOutputPaneRight,
    outputPaneFocusRequest,
    getActiveOutputPaneHandle,
    getOutputPaneHandle,
    onOpenOutputPane,
    onToggleExtractedSourcePane,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  } = useOutputPaneController({
    paneMode,
    outputText,
    rootOutputLanguageOverride: outputLanguageOverride,
  });
  const [outputContextMenuState, setOutputContextMenuState] =
    useState<OutputContextMenuState | null>(null);
  const hasContent = inputText.trim().length > 0;
  const isOutputMode = paneMode === 'output';
  const canRefreshFile =
    fileSource !== null &&
    !isRefreshingFile &&
    fallbackWaitState === null &&
    fallbackModalState === null &&
    activeIngestRejectionPrompt === null &&
    dirtyRefreshPrompt === null;

  const openFile = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    const file = await api.dialog.openFile();
    if (file) {
      void ingestInputText(file.content, 'open-file', {
        fileSource: {
          sourceToken: file.sourceToken,
          path: file.path,
          sourceKind: file.sourceKind,
          baselineText: file.content,
        },
      });
    }
  }, [ingestInputText]);

  const saveOutput = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api || !outputText) {
      return;
    }

    await api.file.save(outputText);
  }, [outputText]);

  const copyOutput = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api || !outputText) {
      return;
    }

    await api.clipboard.copy(outputText);
  }, [outputText]);

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

  const isRefreshAvailableForSource = useCallback(
    (source: DocumentFileSource | null, options: { ignoreDirtyPrompt?: boolean } = {}): boolean =>
      source !== null &&
      !isRefreshingFileRef.current &&
      fallbackWaitState === null &&
      fallbackModalState === null &&
      activeIngestRejectionPrompt === null &&
      (options.ignoreDirtyPrompt === true || dirtyRefreshPrompt === null),
    [activeIngestRejectionPrompt, dirtyRefreshPrompt, fallbackModalState, fallbackWaitState],
  );

  const hasLiveRefreshBlocker = useCallback(
    (options: { ignoreDirtyPrompt?: boolean } = {}): boolean => {
      const state = useDocumentSession.getState();
      return (
        state.fallbackWaitState !== null ||
        state.fallbackModalState !== null ||
        state.ingestRejectionPrompt !== null ||
        (options.ignoreDirtyPrompt !== true && dirtyRefreshPrompt !== null)
      );
    },
    [dirtyRefreshPrompt],
  );

  const captureActiveViewportSnapshot = useCallback(
    (mode: PaneMode): EditorViewportSnapshot | null => {
      if (mode === 'input') {
        return inputEditorRef.current?.captureViewportSnapshot() ?? null;
      }

      const outputSnapshot = getActiveOutputPaneHandle()?.captureViewportSnapshot() ?? null;
      const rootSnapshot =
        activeOutputPaneId === ROOT_OUTPUT_PANE_ID
          ? null
          : (getOutputPaneHandle(ROOT_OUTPUT_PANE_ID)?.captureViewportSnapshot() ?? null);
      return mapOutputPaneViewportSnapshotToRoot(
        useDocumentSession.getState().outputPaneChainState,
        activeOutputPaneId,
        outputSnapshot,
        rootSnapshot,
      );
    },
    [activeOutputPaneId, getActiveOutputPaneHandle, getOutputPaneHandle, inputEditorRef],
  );

  const tryRestoreViewportSnapshot = useCallback(
    (snapshot: RefreshRequestSnapshot): boolean => {
      if (latestRefreshRequestIdRef.current !== snapshot.requestId) {
        return true;
      }

      if (snapshot.paneMode === 'input') {
        const inputEditorHandle = inputEditorRef.current;
        if (!inputEditorHandle) {
          return false;
        }

        inputEditorHandle.restoreViewportSnapshot(snapshot.viewportSnapshot);
        return true;
      }

      const rootOutputHandle = getOutputPaneHandle(ROOT_OUTPUT_PANE_ID);
      if (!rootOutputHandle) {
        return false;
      }

      rootOutputHandle.restoreViewportSnapshot(snapshot.viewportSnapshot);
      return true;
    },
    [getOutputPaneHandle, inputEditorRef],
  );

  const restoreActiveViewportSnapshot = useCallback((snapshot: RefreshRequestSnapshot): void => {
    pendingViewportRestoreRef.current = snapshot;
    setViewportRestoreRequestId((requestId) => requestId + 1);
  }, []);

  useEffect(() => {
    const pendingRestore = pendingViewportRestoreRef.current;
    if (!pendingRestore || !tryRestoreViewportSnapshot(pendingRestore)) {
      return;
    }

    pendingViewportRestoreRef.current = null;
  }, [outputPanes, tryRestoreViewportSnapshot, viewportRestoreRequestId]);

  const handleOutputPaneHandleChange = useCallback(
    (paneId: string, handle: OutputEditorHandle | null): void => {
      registerOutputPaneHandle(paneId, handle);
      if (paneId !== ROOT_OUTPUT_PANE_ID || !handle) {
        return;
      }

      const pendingRestore = pendingViewportRestoreRef.current;
      if (!pendingRestore || !tryRestoreViewportSnapshot(pendingRestore)) {
        return;
      }

      pendingViewportRestoreRef.current = null;
    },
    [registerOutputPaneHandle, tryRestoreViewportSnapshot],
  );

  const createRefreshSnapshot = useCallback(
    (source: DocumentFileSource, requestId: number): RefreshRequestSnapshot => ({
      requestId,
      fileSource: source,
      inputText: useDocumentSession.getState().inputText,
      paneMode: useDocumentSession.getState().paneMode,
      viewportSnapshot: captureActiveViewportSnapshot(useDocumentSession.getState().paneMode),
      viewportInteractionVersion: viewportInteractionVersionRef.current,
    }),
    [captureActiveViewportSnapshot],
  );

  const isRefreshSnapshotCurrent = useCallback(
    (snapshot: RefreshRequestSnapshot): boolean => {
      const state = useDocumentSession.getState();
      return (
        latestRefreshRequestIdRef.current === snapshot.requestId &&
        state.paneMode === snapshot.paneMode &&
        state.inputText === snapshot.inputText &&
        areFileSourcesEqual(state.fileSource, snapshot.fileSource)
      );
    },
    [areFileSourcesEqual],
  );

  const isRefreshPostIngestFileCurrent = useCallback(
    (snapshot: RefreshRequestSnapshot, refreshedFile: RefreshableOpenTextFile): boolean => {
      const state = useDocumentSession.getState();
      return (
        latestRefreshRequestIdRef.current === snapshot.requestId &&
        state.inputText === refreshedFile.content &&
        areFileSourcesEqual(state.fileSource, {
          sourceToken: refreshedFile.sourceToken,
          path: refreshedFile.path,
          sourceKind: refreshedFile.sourceKind,
          lastLoadedText: refreshedFile.content,
        })
      );
    },
    [areFileSourcesEqual],
  );

  const runRefreshFromSnapshot = useCallback(
    async (snapshot: RefreshRequestSnapshot): Promise<void> => {
      const api = getWindowApi();
      if (!api || !isRefreshAvailableForSource(snapshot.fileSource, { ignoreDirtyPrompt: true })) {
        return;
      }

      isRefreshingFileRef.current = true;
      setIsRefreshingFile(true);

      try {
        const refreshedFile = await api.file.refreshOpenFile({
          path: snapshot.fileSource.path,
          sourceToken: snapshot.fileSource.sourceToken,
        });

        if (!isRefreshSnapshotCurrent(snapshot)) {
          void api.file
            .clearOpenFileSource({
              sourceToken: refreshedFile.sourceToken,
              path: refreshedFile.path,
              scope: 'pending',
            })
            .catch((error) => {
              reportRendererError('Failed to clear stale refreshed file source', error);
            });
          return;
        }

        if (hasLiveRefreshBlocker({ ignoreDirtyPrompt: true })) {
          void api.file
            .clearOpenFileSource({
              sourceToken: refreshedFile.sourceToken,
              path: refreshedFile.path,
              scope: 'pending',
            })
            .catch((error) => {
              reportRendererError('Failed to clear blocked refreshed file source', error);
            });
          return;
        }

        const ingestResult = await ingestInputText(refreshedFile.content, 'refresh-file', {
          fileSource: {
            sourceToken: refreshedFile.sourceToken,
            path: refreshedFile.path,
            sourceKind: refreshedFile.sourceKind,
            baselineText: refreshedFile.content,
          },
          switchToOutputOnComplete: snapshot.paneMode === 'output',
          awaitPrettifierCompletion: true,
          isCurrent: () =>
            isRefreshSnapshotCurrent(snapshot) &&
            !hasLiveRefreshBlocker({ ignoreDirtyPrompt: true }),
        });
        if (ingestResult !== 'accepted') {
          return;
        }

        if (!isRefreshPostIngestFileCurrent(snapshot, refreshedFile)) {
          return;
        }

        setOutputContextMenuState(null);
        resetOutputPanes();
        if (
          useDocumentSession.getState().paneMode === snapshot.paneMode &&
          viewportInteractionVersionRef.current === snapshot.viewportInteractionVersion
        ) {
          restoreActiveViewportSnapshot(snapshot);
        }
      } catch (error) {
        if (
          isRefreshSnapshotCurrent(snapshot) &&
          !hasLiveRefreshBlocker({ ignoreDirtyPrompt: true })
        ) {
          setIngestNotice('Unable to refresh file.');
          reportRendererError('Failed to refresh file', error);
        }
      } finally {
        if (latestRefreshRequestIdRef.current === snapshot.requestId) {
          isRefreshingFileRef.current = false;
          setIsRefreshingFile(false);
        }
      }
    },
    [
      ingestInputText,
      hasLiveRefreshBlocker,
      isRefreshAvailableForSource,
      isRefreshPostIngestFileCurrent,
      isRefreshSnapshotCurrent,
      resetOutputPanes,
      restoreActiveViewportSnapshot,
      setIngestNotice,
    ],
  );

  const refreshCurrentFile = useCallback((): void => {
    const currentState = useDocumentSession.getState();
    const currentFileSource = currentState.fileSource;
    if (!currentFileSource || !isRefreshAvailableForSource(currentFileSource)) {
      return;
    }

    if (currentState.inputText !== currentFileSource.lastLoadedText) {
      setDirtyRefreshPrompt({
        fileSource: currentFileSource,
        inputText: currentState.inputText,
      });
      return;
    }

    const requestId = latestRefreshRequestIdRef.current + 1;
    latestRefreshRequestIdRef.current = requestId;
    void runRefreshFromSnapshot(createRefreshSnapshot(currentFileSource, requestId));
  }, [createRefreshSnapshot, isRefreshAvailableForSource, runRefreshFromSnapshot]);

  const cancelDirtyRefresh = useCallback((): void => {
    setDirtyRefreshPrompt(null);
  }, []);

  const confirmDirtyRefresh = useCallback((): void => {
    const prompt = dirtyRefreshPrompt;
    if (!prompt) {
      return;
    }

    setDirtyRefreshPrompt(null);
    const currentState = useDocumentSession.getState();
    if (
      currentState.inputText !== prompt.inputText ||
      !areFileSourcesEqual(currentState.fileSource, prompt.fileSource) ||
      !isRefreshAvailableForSource(currentState.fileSource, { ignoreDirtyPrompt: true })
    ) {
      return;
    }

    const requestId = latestRefreshRequestIdRef.current + 1;
    latestRefreshRequestIdRef.current = requestId;
    void runRefreshFromSnapshot(createRefreshSnapshot(prompt.fileSource, requestId));
  }, [
    areFileSourcesEqual,
    createRefreshSnapshot,
    dirtyRefreshPrompt,
    isRefreshAvailableForSource,
    runRefreshFromSnapshot,
  ]);

  const isResetDocumentSnapshotCurrent = useCallback(
    (snapshot: ResetDocumentSnapshot): boolean => {
      const state = useDocumentSession.getState();
      return (
        state.paneMode === snapshot.paneMode &&
        state.inputText === snapshot.inputText &&
        areFileSourcesEqual(state.fileSource, snapshot.fileSource) &&
        state.ingestNotice === snapshot.ingestNotice &&
        state.ingestRejectionPrompt === snapshot.ingestRejectionPrompt &&
        state.outputText === snapshot.outputText &&
        state.outputLanguageOverride === snapshot.outputLanguageOverride &&
        state.outputFormattingState === snapshot.outputFormattingState &&
        state.fallbackWaitState === snapshot.fallbackWaitState &&
        state.fallbackModalState === snapshot.fallbackModalState &&
        state.lastPrettifiedInput === snapshot.lastPrettifiedInput &&
        state.outputPaneChainState === snapshot.outputPaneChainState
      );
    },
    [areFileSourcesEqual],
  );

  const resetCurrentWindow = useCallback((): void => {
    const runReset = async (): Promise<void> => {
      latestRefreshRequestIdRef.current += 1;
      isRefreshingFileRef.current = false;
      pendingViewportRestoreRef.current = null;
      setIsRefreshingFile(false);
      setDirtyRefreshPrompt(null);
      const resetSnapshot = captureResetDocumentSnapshot(useDocumentSession.getState());
      const sourceToClear = resetSnapshot.fileSource;

      if (sourceToClear) {
        const api = getWindowApi();
        if (!api) {
          setIngestNotice('Unable to refresh file.');
          return;
        }

        try {
          await api.file.clearOpenFileSource({
            sourceToken: sourceToClear.sourceToken,
            path: sourceToClear.path,
            scope: 'committed',
          });
        } catch (error) {
          setIngestNotice('Unable to refresh file.');
          reportRendererError('Failed to clear file source before reset', error);
          return;
        }

        if (!isResetDocumentSnapshotCurrent(resetSnapshot)) {
          if (areFileSourcesEqual(useDocumentSession.getState().fileSource, sourceToClear)) {
            useDocumentSession.getState().setFileSource(null);
          }
          return;
        }
      }

      cancelPendingFallbackPrompts();
      setOutputContextMenuState(null);
      resetPrettifierState();
      resetOutputPanes();
      reset();
    };

    void runReset();
  }, [
    areFileSourcesEqual,
    cancelPendingFallbackPrompts,
    isResetDocumentSnapshotCurrent,
    reset,
    resetOutputPanes,
    resetPrettifierState,
    setIngestNotice,
  ]);

  const openNewWindow = useCallback((): void => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    void api.app.openWindow().catch((error) => {
      reportRendererError('Failed to open new window', error);
    });
  }, []);

  const persistIndentSize = useCallback(
    async (nextIndentSize: IndentSize): Promise<void> => {
      const previousIndentSize = indentSize;
      if (nextIndentSize === previousIndentSize) {
        return;
      }

      const reindentSnapshot = reindentOutputIfPrettified({
        paneMode,
        inputText,
        nextIndentSize,
      });

      invalidateHydratedPreferences();
      setIndentSize(nextIndentSize);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = latestIndentSizeRequestIdRef.current + 1;
      latestIndentSizeRequestIdRef.current = requestId;

      try {
        const updatedPreferences = await api.preferences.update({ indentSize: nextIndentSize });

        // Persisted indent size may differ if main normalizes/clamps values, so
        // the output editor realigns to the actual saved preference.
        if (requestId === latestIndentSizeRequestIdRef.current) {
          setIndentSize(updatedPreferences.indentSize);
          if (reindentSnapshot) {
            alignOutputIndentAfterPersist(nextIndentSize, updatedPreferences.indentSize);
          }
        }
      } catch (error) {
        if (requestId === latestIndentSizeRequestIdRef.current) {
          setIndentSize(previousIndentSize);
          restoreOutputFromSnapshot(reindentSnapshot);
        }

        reportRendererError('Failed to persist indentation preferences', error);
      }
    },
    [
      alignOutputIndentAfterPersist,
      indentSize,
      inputText,
      paneMode,
      reindentOutputIfPrettified,
      restoreOutputFromSnapshot,
      setIndentSize,
      invalidateHydratedPreferences,
    ],
  );

  const handlePaneModeChange = useCallback(
    (nextMode: PaneMode): void => {
      if (isLlmRunning) {
        return;
      }

      if (nextMode === 'input') {
        setPaneMode('input');
        setOutputContextMenuState(null);
        return;
      }

      if (!hasContent) {
        return;
      }

      setPaneMode('output');
      void logTelemetry('renderer.output.mode-switch', {
        fromMode: paneMode,
        toMode: 'output',
        inputLength: inputText.length,
      });

      if (isInputAlreadyPrettified(inputText)) {
        return;
      }

      void runPrettifier(inputText, 'switch-output', {
        switchToOutputOnComplete: false,
      });
    },
    [
      hasContent,
      inputText,
      isInputAlreadyPrettified,
      isLlmRunning,
      logTelemetry,
      paneMode,
      runPrettifier,
      setPaneMode,
    ],
  );

  const collapseActiveEditor = useCallback((): void => {
    if (paneMode === 'input') {
      inputEditorRef.current?.collapseAll();
      return;
    }

    getActiveOutputPaneHandle()?.collapseAll();
  }, [getActiveOutputPaneHandle, inputEditorRef, paneMode]);

  const expandActiveEditor = useCallback((): void => {
    if (paneMode === 'input') {
      inputEditorRef.current?.expandAll();
      return;
    }

    getActiveOutputPaneHandle()?.expandAll();
  }, [getActiveOutputPaneHandle, inputEditorRef, paneMode]);

  const dismissOutputContextMenu = useCallback((): void => {
    setOutputContextMenuState(null);
  }, []);

  const handleOutputPaneContextMenu = useCallback(
    (
      paneId: string,
      request: {
        anchorX: number;
        anchorY: number;
        isContentHit: boolean;
        position: {
          lineNumber: number;
          column: number;
        } | null;
        hasSelection: boolean;
      },
      value: string,
      paneDocumentLanguage: OutputLanguageId,
    ): void => {
      const target =
        request.hasSelection || !request.isContentHit || request.position === null
          ? null
          : resolveContextPrettifyTarget(paneDocumentLanguage, value, request.position);

      setOutputContextMenuState({
        paneId,
        anchorX: request.anchorX,
        anchorY: request.anchorY,
        target,
      });
    },
    [],
  );

  const triggerOutputContextPrettify = useCallback(async (): Promise<void> => {
    const contextMenuState = outputContextMenuState;
    if (!contextMenuState?.target) {
      dismissOutputContextMenu();
      return;
    }

    dismissOutputContextMenu();
    const response = await runPrettifierRequest(
      contextMenuState.target.decodedText,
      'context-pane-prettify',
    );
    if (!response) {
      return;
    }

    onOpenOutputPane(contextMenuState.paneId, {
      kind: 'independent-text',
      value: response.outputText,
      languageOverride: getLocalResultOutputLanguageOverride(
        response.localResult,
        response.outputText,
      ),
    });
  }, [dismissOutputContextMenu, onOpenOutputPane, outputContextMenuState, runPrettifierRequest]);

  const recordViewportInteraction = useCallback((): void => {
    viewportInteractionVersionRef.current += 1;
  }, []);

  useEffect(() => {
    if (!dirtyRefreshPrompt) {
      return;
    }

    const state = useDocumentSession.getState();
    if (
      state.inputText !== dirtyRefreshPrompt.inputText ||
      !areFileSourcesEqual(state.fileSource, dirtyRefreshPrompt.fileSource)
    ) {
      setDirtyRefreshPrompt(null);
    }
  }, [areFileSourcesEqual, dirtyRefreshPrompt, fileSource, inputText]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    return () => {
      cancelPendingFallbackPrompts();
    };
  }, [cancelPendingFallbackPrompts]);

  useEffect(() => {
    if (!initialOpenFile || consumedInitialOpenFilePaths.has(initialOpenFile.path)) {
      return;
    }

    consumedInitialOpenFilePaths.add(initialOpenFile.path);

    queueMicrotask(() => {
      resetCurrentWindow();
      void ingestInputText(initialOpenFile.content, 'open-file', {
        fileSource: {
          sourceToken: initialOpenFile.sourceToken,
          path: initialOpenFile.path,
          sourceKind: initialOpenFile.sourceKind,
          baselineText: initialOpenFile.content,
        },
      });
    });
  }, [initialOpenFile, ingestInputText, resetCurrentWindow]);

  useEffect(() => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    // Main menu actions target the focused window, so each renderer instance owns
    // resetting only its own local/UI state.
    return api.app.onResetCurrentWindow(() => {
      resetCurrentWindow();
    });
  }, [resetCurrentWindow]);

  useEffect(() => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    return api.app.onRefreshCurrentWindow(() => {
      refreshCurrentFile();
    });
  }, [refreshCurrentFile]);

  useKeyboardShortcuts({
    isOutputMode,
    paneMode,
    hasContent,
    canPopOutputPane: hasVisibleDerivedOutputPane,
    openNewWindow,
    resetCurrentWindow,
    handlePaneModeChange,
    saveOutput,
    copyOutput,
    closeOutputPane: closeDerivedOutputPane,
    navigateOutputPaneViewport,
    openFind: () => {
      getActiveOutputPaneHandle()?.openFind();
    },
    refreshCurrentFile,
  });
  useMouseNavigationShortcuts({
    isOutputMode,
    navigateOutputPaneViewport,
  });

  return {
    paneMode,
    themeMode,
    indentSize,
    inputText,
    ingestNotice,
    ingestRejectionPrompt: activeIngestRejectionPrompt,
    outputText,
    outputDocumentId,
    outputPanes,
    activeOutputPaneId,
    outputLeftVisiblePaneIndex,
    visibleOutputPanePosition: isOutputMode && hasContent ? rawVisibleOutputPanePosition : null,
    outputPaneFocusRequest,
    outputContextMenuState,
    fallbackWaitState,
    fallbackWarningLineThreshold,
    fallbackModalState,
    fallbackAgentId,
    fallbackAgentOptions,
    canRefreshFile,
    isRefreshingFile,
    dirtyRefreshPrompt,
    hasContent,
    hasDerivedOutputPane: hasVisibleDerivedOutputPane,
    canNavigateOutputPaneLeft,
    canNavigateOutputPaneRight,
    onCancelActiveFallback: cancelActiveFallback,
    onNew: openNewWindow,
    onPaneModeChange: handlePaneModeChange,
    onCollapseAll: collapseActiveEditor,
    onExpandAll: expandActiveEditor,
    onSave: saveOutput,
    onCopy: copyOutput,
    onRefreshFile: refreshCurrentFile,
    onCancelDirtyRefresh: cancelDirtyRefresh,
    onConfirmDirtyRefresh: confirmDirtyRefresh,
    onCloseSplit: closeDerivedOutputPane,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onNavigateOutputPaneLeft: () => navigateOutputPaneViewport(-1),
    onNavigateOutputPaneRight: () => navigateOutputPaneViewport(1),
    onThemeModeChange: persistThemeMode,
    onIndentSizeChange: persistIndentSize,
    onFallbackAgentIdChange: persistFallbackAgentId,
    onEditInputChange: setInputText,
    onIngestInput: (value, source) => {
      setDirtyRefreshPrompt(null);
      void ingestInputText(value, source);
    },
    onDismissIngestNotice: () => setIngestNotice(null),
    onDismissIngestRejection: dismissIngestRejection,
    onOpenReadableIngestSlice: openReadableIngestSlice,
    onOpenFile: openFile,
    onOutputPaneHandleChange: handleOutputPaneHandleChange,
    onOutputPaneFocus: focusVisibleOutputPane,
    onToggleExtractedSourcePane,
    onOutputPaneContextMenu: handleOutputPaneContextMenu,
    onDismissOutputContextMenu: dismissOutputContextMenu,
    onTriggerOutputContextPrettify: triggerOutputContextPrettify,
    onViewportInteraction: recordViewportInteraction,
    onCancelFallback: () => {
      if (fallbackModalState?.kind === 'agent-selection') {
        settleFallbackAgentSelection(null);
        return;
      }

      settleFallbackConfirmation(false);
    },
    onConfirmFallback: () => settleFallbackConfirmation(true),
    onSelectFallbackAgent: (agentId: string) => settleFallbackAgentSelection(agentId),
  };
};
