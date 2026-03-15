import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode, ThemeMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import type { InputEditorHandle } from '../components/InputEditor';
import { useUiStore } from '../state/uiStore';
import type { FallbackAgentOption, FallbackWaitState, IngestSource } from './appDomain';
import { reportRendererError } from './reportRendererError';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useOutputPaneController } from './useOutputPaneController';
import { usePreferencesFlow } from './usePreferencesFlow';
import { usePrettifierFlow } from './usePrettifierFlow';

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UseAppControllerOptions = {
  inputEditorRef: RefObject<InputEditorHandle | null>;
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
  outputPanes: ReturnType<typeof useOutputPaneController>['outputPanes'];
  outputLeftVisiblePaneIndex: number;
  fallbackWaitState: FallbackWaitState | null;
  fallbackWarningLineThreshold: number;
  fallbackModalState: FallbackModalState | null;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
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
  onOpenFile: () => Promise<void>;
  onOutputPaneHandleChange: ReturnType<typeof useOutputPaneController>['onOutputPaneHandleChange'];
  onOutputPaneFocus: (paneId: string) => void;
  onOutputPaneSplitSelection: ReturnType<
    typeof useOutputPaneController
  >['onOutputPaneSplitSelection'];
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
  const {
    outputDocumentId,
    outputPanes,
    leftVisiblePaneIndex: outputLeftVisiblePaneIndex,
    hasDerivedOutputPane: hasVisibleDerivedOutputPane,
    canNavigateOutputPaneLeft,
    canNavigateOutputPaneRight,
    getActiveOutputPaneHandle,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOutputPaneSplitSelection: openDerivedOutputPane,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  } = useOutputPaneController({
    paneMode,
    outputText,
  });
  const hasContent = inputText.trim().length > 0;
  const isOutputMode = paneMode === 'output';

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
    resetOutputPanes();
    reset();
  }, [cancelPendingFallbackPrompts, reset, resetOutputPanes, resetPrettifierState]);

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
    outputLeftVisiblePaneIndex,
    fallbackWaitState,
    fallbackWarningLineThreshold,
    fallbackModalState,
    fallbackAgentId,
    fallbackAgentOptions,
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
    onCloseSplit: closeDerivedOutputPane,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onNavigateOutputPaneLeft: () => navigateOutputPaneViewport(-1),
    onNavigateOutputPaneRight: () => navigateOutputPaneViewport(1),
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
