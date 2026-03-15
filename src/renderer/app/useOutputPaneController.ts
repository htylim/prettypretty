import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  activeOutputPaneId: string;
  leftVisiblePaneIndex: number;
  hasDerivedOutputPane: boolean;
  canNavigateOutputPaneLeft: boolean;
  canNavigateOutputPaneRight: boolean;
  outputPaneFocusRequest: {
    paneId: string;
    sequence: number;
  } | null;
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
  const nextFocusRequestSequenceRef = useRef(1);
  const [outputPaneChainSnapshot, dispatchOutputPaneChain] = useReducer(outputPaneChainReducer, {
    scopeKey: 'hidden:initial',
    chainState: createOutputPaneChainState(),
  });
  const [outputPaneFocusRequest, setOutputPaneFocusRequest] = useState<{
    paneId: string;
    sequence: number;
  } | null>(null);

  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const isOutputMode = paneMode === 'output';
  const outputPaneScopeKey = isOutputMode
    ? `output:${outputDocumentId}`
    : `hidden:${outputDocumentId}`;
  const outputPaneChainState =
    isOutputMode && outputPaneChainSnapshot.scopeKey === outputPaneScopeKey
      ? outputPaneChainSnapshot.chainState
      : createOutputPaneChainState();
  const outputPaneChainStateRef = useRef(outputPaneChainState);

  useEffect(() => {
    outputPaneChainStateRef.current = outputPaneChainState;
  }, [outputPaneChainState]);

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
      const currentState = outputPaneChainStateRef.current;
      const nextState = mutator(currentState);
      if (nextState === currentState) {
        return;
      }

      outputPaneChainStateRef.current = nextState;
      dispatchOutputPaneChain({
        type: 'replace',
        scopeKey: outputPaneScopeKey,
        chainState: nextState,
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
      const currentState = outputPaneChainStateRef.current;
      const nextState = openOrReplaceDerivedOutputPane(currentState, paneId, selection);
      if (nextState === currentState) {
        return;
      }

      outputPaneChainStateRef.current = nextState;
      dispatchOutputPaneChain({
        type: 'replace',
        scopeKey: outputPaneScopeKey,
        chainState: nextState,
      });
      setOutputPaneFocusRequest({
        paneId: nextState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [outputPaneScopeKey],
  );

  const closeDerivedOutputPane = useCallback((): void => {
    const currentState = outputPaneChainStateRef.current;
    const nextState = closeRightmostOutputPane(currentState);
    if (nextState === currentState) {
      return;
    }

    outputPaneChainStateRef.current = nextState;
    dispatchOutputPaneChain({
      type: 'replace',
      scopeKey: outputPaneScopeKey,
      chainState: nextState,
    });
    setOutputPaneFocusRequest({
      paneId: nextState.activePaneId,
      sequence: nextFocusRequestSequenceRef.current++,
    });
  }, [outputPaneScopeKey]);

  const navigateOutputPaneViewport = useCallback(
    (stepDelta: number): void => {
      const currentState = outputPaneChainStateRef.current;
      const nextState = shiftOutputPaneViewport(currentState, stepDelta);
      if (nextState === currentState) {
        return;
      }

      outputPaneChainStateRef.current = nextState;
      dispatchOutputPaneChain({
        type: 'replace',
        scopeKey: outputPaneScopeKey,
        chainState: nextState,
      });
      setOutputPaneFocusRequest({
        paneId: nextState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [outputPaneScopeKey],
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
    outputPaneHandlesRef.current.clear();
    setOutputPaneFocusRequest(null);
    const nextState = createOutputPaneChainState();
    outputPaneChainStateRef.current = nextState;
    dispatchOutputPaneChain({
      type: 'replace',
      scopeKey: outputPaneScopeKey,
      chainState: nextState,
    });
  }, [outputPaneScopeKey]);

  return {
    outputDocumentId,
    outputPanes,
    activeOutputPaneId: outputPaneChainState.activePaneId,
    leftVisiblePaneIndex: outputPaneChainState.leftVisiblePaneIndex,
    hasDerivedOutputPane: hasDerivedOutputPane(outputPaneChainState),
    canNavigateOutputPaneLeft: canNavigateOutputPaneViewportLeft(outputPaneChainState),
    canNavigateOutputPaneRight: canNavigateOutputPaneViewportRight(outputPaneChainState),
    outputPaneFocusRequest,
    getActiveOutputPaneHandle,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOutputPaneSplitSelection: openDerivedOutputPane,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  };
};
