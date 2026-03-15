import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { PaneMode } from '../../shared/types';
import type { OutputPaneViewModel } from '../components/OutputPaneStrip';
import type { OutputEditorHandle } from '../components/OutputEditor';
import { getOutputDocumentId } from './appDomain';
import {
  canNavigateOutputPaneViewportLeft,
  canNavigateOutputPaneViewportRight,
  closeRightmostOutputPane,
  createOutputPaneChainState,
  focusOutputPane,
  getOutputPaneSourceHighlight,
  getRightmostVisibleOutputPaneId,
  getRootOutputPaneViewStateKey,
  hasDerivedOutputPane,
  openOrReplaceDerivedOutputPane,
  ROOT_OUTPUT_PANE_ID,
  shiftOutputPaneViewport,
  type OutputPaneSelection,
} from './outputPaneDomain';

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

type UseOutputPaneControllerOptions = {
  paneMode: PaneMode;
  outputText: string;
};

export type UseOutputPaneControllerResult = {
  outputDocumentId: string;
  outputPanes: OutputPaneViewModel[];
  leftVisiblePaneIndex: number;
  hasDerivedOutputPane: boolean;
  canNavigateOutputPaneLeft: boolean;
  canNavigateOutputPaneRight: boolean;
  getActiveOutputPaneHandle: () => OutputEditorHandle | null;
  onOutputPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onOutputPaneFocus: (paneId: string) => void;
  onOutputPaneSplitSelection: (paneId: string, selection: OutputPaneSelection) => void;
  onNavigateOutputPaneViewport: (stepDelta: number) => void;
  onCloseOutputPane: () => void;
  resetOutputPanes: () => void;
};

export const useOutputPaneController = ({
  paneMode,
  outputText,
}: UseOutputPaneControllerOptions): UseOutputPaneControllerResult => {
  const outputPaneHandlesRef = useRef(new Map<string, OutputEditorHandle>());
  const pendingFocusPaneIdRef = useRef<string | null>(null);
  const [outputPaneChainSnapshot, dispatchOutputPaneChain] = useReducer(outputPaneChainReducer, {
    scopeKey: 'hidden:initial',
    chainState: createOutputPaneChainState(),
  });

  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const isOutputMode = paneMode === 'output';
  const outputPaneScopeKey = isOutputMode
    ? `output:${outputDocumentId}`
    : `hidden:${outputDocumentId}`;
  const outputPaneChainState =
    isOutputMode && outputPaneChainSnapshot.scopeKey === outputPaneScopeKey
      ? outputPaneChainSnapshot.chainState
      : createOutputPaneChainState();

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
      ...outputPaneChainState.derivedPanes.map((pane, index) => ({
        paneId: pane.paneId,
        documentId: outputDocumentId,
        viewStateKey: pane.viewStateKey,
        value: outputText,
        viewRange: pane.sourceRange,
        sourceHighlightRange: getOutputPaneSourceHighlight(outputPaneChainState, pane.paneId),
        isSplitSelectionEnabled: true,
        testId: `output-editor-pane-${index + 1}`,
      })),
    ];
  }, [outputDocumentId, outputPaneChainState, outputText]);

  const registerOutputPaneHandle = useCallback(
    (paneId: string, handle: OutputEditorHandle | null): void => {
      if (handle) {
        outputPaneHandlesRef.current.set(paneId, handle);
        if (pendingFocusPaneIdRef.current === paneId) {
          handle.focus();
          pendingFocusPaneIdRef.current = null;
        }
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
      mutateOutputPaneChain((state) => focusOutputPane(state, paneId));
    },
    [mutateOutputPaneChain],
  );

  const openDerivedOutputPane = useCallback(
    (paneId: string, selection: OutputPaneSelection): void => {
      mutateOutputPaneChain((state) => {
        const nextState = openOrReplaceDerivedOutputPane(state, paneId, selection);
        if (nextState !== state) {
          pendingFocusPaneIdRef.current = nextState.activePaneId;
        }
        return nextState;
      });
    },
    [mutateOutputPaneChain],
  );

  const closeDerivedOutputPane = useCallback((): void => {
    mutateOutputPaneChain((state) => {
      const nextState = closeRightmostOutputPane(state);
      if (nextState !== state) {
        pendingFocusPaneIdRef.current = nextState.activePaneId;
      }
      return nextState;
    });
  }, [mutateOutputPaneChain]);

  const navigateOutputPaneViewport = useCallback(
    (stepDelta: number): void => {
      mutateOutputPaneChain((state) => {
        const nextState = shiftOutputPaneViewport(state, stepDelta);
        if (nextState !== state) {
          pendingFocusPaneIdRef.current = nextState.activePaneId;
        }
        return nextState;
      });
    },
    [mutateOutputPaneChain],
  );

  const getActiveOutputPaneHandle = useCallback((): OutputEditorHandle | null => {
    const activeHandle =
      outputPaneHandlesRef.current.get(outputPaneChainState.activePaneId) ?? null;
    if (activeHandle) {
      return activeHandle;
    }

    const fallbackPaneId = getRightmostVisibleOutputPaneId(outputPaneChainState);
    return outputPaneHandlesRef.current.get(fallbackPaneId) ?? null;
  }, [outputPaneChainState]);

  const resetOutputPanes = useCallback((): void => {
    pendingFocusPaneIdRef.current = null;
    outputPaneHandlesRef.current.clear();
    dispatchOutputPaneChain({
      type: 'replace',
      scopeKey: outputPaneScopeKey,
      chainState: createOutputPaneChainState(),
    });
  }, [outputPaneScopeKey]);

  useEffect(() => {
    const pendingFocusPaneId = pendingFocusPaneIdRef.current;
    if (!pendingFocusPaneId || pendingFocusPaneId !== outputPaneChainState.activePaneId) {
      return;
    }

    const handle = outputPaneHandlesRef.current.get(pendingFocusPaneId);
    if (!handle) {
      return;
    }

    handle.focus();
    pendingFocusPaneIdRef.current = null;
  }, [outputPaneChainState.activePaneId, outputPanes]);

  useEffect(() => {
    resetOutputPanes();
  }, [resetOutputPanes]);

  return {
    outputDocumentId,
    outputPanes,
    leftVisiblePaneIndex: outputPaneChainState.leftVisiblePaneIndex,
    hasDerivedOutputPane: hasDerivedOutputPane(outputPaneChainState),
    canNavigateOutputPaneLeft: canNavigateOutputPaneViewportLeft(outputPaneChainState),
    canNavigateOutputPaneRight: canNavigateOutputPaneViewportRight(outputPaneChainState),
    getActiveOutputPaneHandle,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOutputPaneSplitSelection: openDerivedOutputPane,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  };
};
