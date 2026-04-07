import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode, ThemeMode } from '../../shared/types';
import type { InputEditorHandle } from '../components/InputEditor';
import type {
  FallbackAgentOption,
  FallbackWaitState,
  IngestRejectionPrompt,
  IngestSource,
} from './appDomain';
import { reportRendererError } from './reportRendererError';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import {
  resolveContextPrettifyTarget,
  type ContextPrettifyTarget,
} from '../output/contextPrettifyTarget';
import {
  selectIndentSize,
  selectIngestNotice,
  selectInputText,
  selectPaneMode,
  selectThemeMode,
} from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useMouseNavigationShortcuts } from './useMouseNavigationShortcuts';
import { useOutputPaneController } from './useOutputPaneController';
import { usePreferencesFlow } from './usePreferencesFlow';
import { useFallbackModalRuntime } from './session/useFallbackModalRuntime';
import { usePrettifierFlow } from './usePrettifierFlow';
import type { FallbackModalState } from './session/prettifierSessionDomain';
import { getWindowApi } from './windowApi';

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UseAppControllerOptions = {
  inputEditorRef: RefObject<InputEditorHandle | null>;
};

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
  ) => void;
  onDismissOutputContextMenu: () => void;
  onTriggerOutputContextPrettify: () => void;
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
  inputEditorRef,
}: UseAppControllerOptions): UseAppControllerResult => {
  const latestIndentSizeRequestIdRef = useRef(0);
  const paneMode = useDocumentSession(selectPaneMode);
  const themeMode = useDocumentSession(selectThemeMode);
  const indentSize = useDocumentSession(selectIndentSize);
  const inputText = useDocumentSession(selectInputText);
  const ingestNotice = useDocumentSession(selectIngestNotice);
  const reset = useDocumentSession((state) => state.reset);
  const setPaneMode = useDocumentSession((state) => state.setPaneMode);
  const setThemeMode = useDocumentSession((state) => state.setThemeMode);
  const setIndentSize = useDocumentSession((state) => state.setIndentSize);
  const setInputText = useDocumentSession((state) => state.setInputText);
  const setIngestNotice = useDocumentSession((state) => state.setIngestNotice);
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
  });
  const [outputContextMenuState, setOutputContextMenuState] =
    useState<OutputContextMenuState | null>(null);
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
    setOutputContextMenuState(null);
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
    ): void => {
      const paneDocumentLanguage = detectOutputLanguage(value);
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
    });
  }, [dismissOutputContextMenu, onOpenOutputPane, outputContextMenuState, runPrettifierRequest]);

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
    onDismissIngestRejection: dismissIngestRejection,
    onOpenReadableIngestSlice: openReadableIngestSlice,
    onOpenFile: openFile,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onToggleExtractedSourcePane,
    onOutputPaneContextMenu: handleOutputPaneContextMenu,
    onDismissOutputContextMenu: dismissOutputContextMenu,
    onTriggerOutputContextPrettify: triggerOutputContextPrettify,
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
