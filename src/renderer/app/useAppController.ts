import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode, ThemeMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import type { OutputPaneViewModel } from '../components/OutputPaneStrip';
import type { InputEditorHandle } from '../components/InputEditor';
import type { OutputEditorHandle } from '../components/OutputEditor';
import { useUiStore } from '../state/uiStore';
import type { FallbackAgentOption, FallbackWaitState, IngestSource } from './appDomain';
import { getOutputDocumentId } from './appDomain';
import {
  closeRightmostOutputPane,
  createOutputPaneChainState,
  focusOutputPane,
  getLastVisibleOutputPaneId,
  getOutputPaneSourceHighlight,
  getRootOutputPaneViewStateKey,
  hasDerivedOutputPane,
  openOrReplaceDerivedOutputPane,
  ROOT_OUTPUT_PANE_ID,
  type OutputPaneSelection,
} from './outputPaneDomain';
import { reportRendererError } from './reportRendererError';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { usePreferencesFlow } from './usePreferencesFlow';
import { usePrettifierFlow } from './usePrettifierFlow';

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UseAppControllerOptions = {
  inputEditorRef: RefObject<InputEditorHandle | null>;
};

type OutputPaneChainSnapshot = {
  scopeKey: string;
  chainState: ReturnType<typeof createOutputPaneChainState>;
};

type OutputPaneChainAction =
  | {
      type: 'mutate';
      scopeKey: string;
      mutator: (
        state: ReturnType<typeof createOutputPaneChainState>,
      ) => ReturnType<typeof createOutputPaneChainState>;
    }
  | {
      type: 'replace';
      scopeKey: string;
      chainState: ReturnType<typeof createOutputPaneChainState>;
    };

const outputPaneChainReducer = (
  snapshot: OutputPaneChainSnapshot,
  action: OutputPaneChainAction,
): OutputPaneChainSnapshot => {
  if (action.type === 'replace') {
    return {
      scopeKey: action.scopeKey,
      chainState: action.chainState,
    };
  }

  const baseState =
    snapshot.scopeKey === action.scopeKey ? snapshot.chainState : createOutputPaneChainState();

  return {
    scopeKey: action.scopeKey,
    chainState: action.mutator(baseState),
  };
};

export type FallbackModalState =
  | {
      kind: 'large-content';
      lineCount: number;
    }
  | {
      kind: 'agent-selection';
    };

export type UseAppControllerResult = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  inputText: string;
  ingestNotice: string | null;
  outputText: string;
  outputDocumentId: string;
  outputPanes: OutputPaneViewModel[];
  fallbackWaitState: FallbackWaitState | null;
  fallbackWarningLineThreshold: number;
  fallbackModalState: FallbackModalState | null;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  hasContent: boolean;
  hasDerivedOutputPane: boolean;
  onCancelActiveFallback: () => Promise<void>;
  onNew: () => void;
  onPaneModeChange: (mode: PaneMode) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSave: () => Promise<void>;
  onCopy: () => Promise<void>;
  onCloseSplit: () => void;
  onThemeModeChange: (mode: ThemeMode) => Promise<void>;
  onIndentSizeChange: (size: IndentSize) => Promise<void>;
  onFallbackAgentIdChange: (agentId: string | null) => Promise<void>;
  onEditInputChange: (value: string) => void;
  onIngestInput: (value: string, source: IngestSource) => void;
  onDismissIngestNotice: () => void;
  onOpenFile: () => Promise<void>;
  onOutputPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onOutputPaneFocus: (paneId: string) => void;
  onOutputPaneSplitSelection: (paneId: string, selection: OutputPaneSelection) => void;
  onCancelFallback: () => void;
  onConfirmFallback: () => void;
  onSelectFallbackAgent: (agentId: string) => void;
};

const getWindowApi = (): WindowApi | null => {
  const candidate = (window as Window & { prettypretty?: WindowApi }).prettypretty;
  return candidate ?? null;
};

/**
 * Top-level renderer controller. It wires together persisted preferences, UI
 * store state, prettifier orchestration, modal prompts, and window-level actions
 * so `App` can stay composition-only.
 */
export const useAppController = ({
  inputEditorRef,
}: UseAppControllerOptions): UseAppControllerResult => {
  const latestIndentSizeRequestIdRef = useRef(0);
  const fallbackConfirmationResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const fallbackAgentSelectionResolverRef = useRef<((agentId: string | null) => void) | null>(null);
  const outputPaneHandlesRef = useRef(new Map<string, OutputEditorHandle>());
  const activeOutputPaneIdRef = useRef(ROOT_OUTPUT_PANE_ID);
  const paneMode = useUiStore((state) => state.paneMode);
  const themeMode = useUiStore((state) => state.themeMode);
  const indentSize = useUiStore((state) => state.indentSize);
  const inputText = useUiStore((state) => state.inputText);
  const ingestNotice = useUiStore((state) => state.ingestNotice);
  const reset = useUiStore((state) => state.reset);
  const setPaneMode = useUiStore((state) => state.setPaneMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setIndentSize = useUiStore((state) => state.setIndentSize);
  const setInputText = useUiStore((state) => state.setInputText);
  const setIngestNotice = useUiStore((state) => state.setIngestNotice);
  const [fallbackModalState, setFallbackModalState] = useState<FallbackModalState | null>(null);
  const [outputPaneChainSnapshot, dispatchOutputPaneChain] = useReducer(outputPaneChainReducer, {
    scopeKey: 'hidden:initial',
    chainState: createOutputPaneChainState(),
  });

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
    persistThemeMode,
    persistFallbackAgentId,
  } = usePreferencesFlow({
    themeMode,
    setThemeMode,
    setIndentSize,
    getWindowApi,
  });

  // Only one fallback prompt may be unresolved at a time. New prompts cancel the
  // old resolver first so stale modals cannot settle a newer request.
  const cancelPendingFallbackPrompts = useCallback((): void => {
    if (fallbackConfirmationResolverRef.current) {
      fallbackConfirmationResolverRef.current(false);
      fallbackConfirmationResolverRef.current = null;
    }

    if (fallbackAgentSelectionResolverRef.current) {
      fallbackAgentSelectionResolverRef.current(null);
      fallbackAgentSelectionResolverRef.current = null;
    }

    setFallbackModalState(null);
  }, []);

  const requestFallbackConfirmation = useCallback(
    (lineCount: number): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        cancelPendingFallbackPrompts();
        fallbackConfirmationResolverRef.current = resolve;
        setFallbackModalState({
          kind: 'large-content',
          lineCount,
        });
      });
    },
    [cancelPendingFallbackPrompts],
  );

  const settleFallbackConfirmation = useCallback((accepted: boolean): void => {
    const resolver = fallbackConfirmationResolverRef.current;
    fallbackConfirmationResolverRef.current = null;
    setFallbackModalState(null);
    resolver?.(accepted);
  }, []);

  const requestFallbackAgentSelection = useCallback((): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      cancelPendingFallbackPrompts();
      fallbackAgentSelectionResolverRef.current = resolve;
      setFallbackModalState({
        kind: 'agent-selection',
      });
    });
  }, [cancelPendingFallbackPrompts]);

  const settleFallbackAgentSelection = useCallback((agentId: string | null): void => {
    const resolver = fallbackAgentSelectionResolverRef.current;
    fallbackAgentSelectionResolverRef.current = null;
    setFallbackModalState(null);
    resolver?.(agentId);
  }, []);

  const {
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
  } = usePrettifierFlow({
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
  });

  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const hasContent = inputText.trim().length > 0;
  const isOutputMode = paneMode === 'output';
  const outputPaneScopeKey = isOutputMode
    ? `output:${outputDocumentId}`
    : `hidden:${outputDocumentId}`;
  const outputPaneChainState =
    isOutputMode && outputPaneChainSnapshot.scopeKey === outputPaneScopeKey
      ? outputPaneChainSnapshot.chainState
      : createOutputPaneChainState();
  const hasVisibleDerivedOutputPane = hasDerivedOutputPane(outputPaneChainState);
  const activeOutputPaneId = outputPaneChainState.activePaneId;
  const outputPanes = useMemo<OutputPaneViewModel[]>(() => {
    const rootPane: OutputPaneViewModel = {
      paneId: ROOT_OUTPUT_PANE_ID,
      documentId: outputDocumentId,
      viewStateKey: getRootOutputPaneViewStateKey(outputDocumentId),
      value: outputText,
      viewRange: null,
      sourceHighlightRange: getOutputPaneSourceHighlight(outputPaneChainState, ROOT_OUTPUT_PANE_ID),
      isSplitSelectionEnabled: true,
      testId: 'output-editor',
    };

    return [
      rootPane,
      ...outputPaneChainState.derivedPanes.slice(0, 1).map((pane, index) => ({
        paneId: pane.paneId,
        documentId: outputDocumentId,
        viewStateKey: pane.viewStateKey,
        value: outputText,
        viewRange: pane.sourceRange,
        sourceHighlightRange: getOutputPaneSourceHighlight(outputPaneChainState, pane.paneId),
        isSplitSelectionEnabled: false,
        testId: `output-editor-pane-${index + 1}`,
      })),
    ];
  }, [outputDocumentId, outputPaneChainState, outputText]);

  const getActiveOutputPaneHandle = useCallback((): OutputEditorHandle | null => {
    const activeHandle = outputPaneHandlesRef.current.get(activeOutputPaneIdRef.current) ?? null;
    if (activeHandle) {
      return activeHandle;
    }

    const lastVisiblePaneId = getLastVisibleOutputPaneId(outputPaneChainState);
    return outputPaneHandlesRef.current.get(lastVisiblePaneId) ?? null;
  }, [outputPaneChainState]);

  const registerOutputPaneHandle = useCallback(
    (paneId: string, handle: OutputEditorHandle | null): void => {
      if (handle) {
        outputPaneHandlesRef.current.set(paneId, handle);
        return;
      }

      outputPaneHandlesRef.current.delete(paneId);
    },
    [],
  );

  const mutateOutputPaneChain = useCallback(
    (
      mutator: (
        state: ReturnType<typeof createOutputPaneChainState>,
      ) => ReturnType<typeof createOutputPaneChainState>,
    ): void => {
      dispatchOutputPaneChain({
        type: 'mutate',
        scopeKey: outputPaneScopeKey,
        mutator,
      });
    },
    [outputPaneScopeKey],
  );

  const focusVisibleOutputPane = useCallback(
    (paneId: string): void => {
      activeOutputPaneIdRef.current = paneId;
      mutateOutputPaneChain((state) => focusOutputPane(state, paneId));
    },
    [mutateOutputPaneChain],
  );

  const openDerivedOutputPane = useCallback(
    (paneId: string, selection: OutputPaneSelection): void => {
      mutateOutputPaneChain((state) => {
        const nextState = openOrReplaceDerivedOutputPane(state, paneId, selection);
        const nextActivePaneId = getLastVisibleOutputPaneId(nextState);
        activeOutputPaneIdRef.current = nextActivePaneId;
        return focusOutputPane(nextState, nextActivePaneId);
      });
    },
    [mutateOutputPaneChain],
  );

  const closeDerivedOutputPane = useCallback((): void => {
    mutateOutputPaneChain((state) => closeRightmostOutputPane(state));
  }, [mutateOutputPaneChain]);

  const openFile = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    const file = await api.dialog.openFile();
    if (file) {
      ingestInputText(file.content, 'open-file');
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

  const resetCurrentWindow = useCallback((): void => {
    cancelPendingFallbackPrompts();
    resetPrettifierState();
    outputPaneHandlesRef.current.clear();
    dispatchOutputPaneChain({
      type: 'replace',
      scopeKey: outputPaneScopeKey,
      chainState: createOutputPaneChainState(),
    });
    reset();
  }, [cancelPendingFallbackPrompts, outputPaneScopeKey, reset, resetPrettifierState]);

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
    ],
  );

  const handlePaneModeChange = useCallback(
    (nextMode: PaneMode): void => {
      if (isLlmRunning) {
        return;
      }

      if (nextMode === 'input') {
        setPaneMode('input');
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

  useEffect(() => {
    activeOutputPaneIdRef.current = activeOutputPaneId;
  }, [activeOutputPaneId]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    return () => {
      cancelPendingFallbackPrompts();
    };
  }, [cancelPendingFallbackPrompts]);

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
    dispatchOutputPaneChain({
      type: 'replace',
      scopeKey: outputPaneScopeKey,
      chainState: createOutputPaneChainState(),
    });
  }, [outputPaneScopeKey]);

  useKeyboardShortcuts({
    isOutputMode,
    paneMode,
    hasContent,
    openNewWindow,
    resetCurrentWindow,
    handlePaneModeChange,
    saveOutput,
    copyOutput,
    openFind: () => {
      getActiveOutputPaneHandle()?.openFind();
    },
  });

  return {
    paneMode,
    themeMode,
    indentSize,
    inputText,
    ingestNotice,
    outputText,
    outputDocumentId,
    outputPanes,
    fallbackWaitState,
    fallbackWarningLineThreshold,
    fallbackModalState,
    fallbackAgentId,
    fallbackAgentOptions,
    hasContent,
    hasDerivedOutputPane: hasVisibleDerivedOutputPane,
    onCancelActiveFallback: cancelActiveFallback,
    onNew: openNewWindow,
    onPaneModeChange: handlePaneModeChange,
    onCollapseAll: collapseActiveEditor,
    onExpandAll: expandActiveEditor,
    onSave: saveOutput,
    onCopy: copyOutput,
    onCloseSplit: closeDerivedOutputPane,
    onThemeModeChange: persistThemeMode,
    onIndentSizeChange: persistIndentSize,
    onFallbackAgentIdChange: persistFallbackAgentId,
    onEditInputChange: setInputText,
    onIngestInput: ingestInputText,
    onDismissIngestNotice: () => setIngestNotice(null),
    onOpenFile: openFile,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOutputPaneSplitSelection: openDerivedOutputPane,
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
