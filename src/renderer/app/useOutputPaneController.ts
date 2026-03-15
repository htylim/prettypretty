import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { PaneMode } from '../../shared/types';
import type { OutputPaneViewModel } from '../components/OutputPaneStrip';
import type { OutputEditorHandle } from '../components/OutputEditor';
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
  hasDerivedOutputPane: boolean;
  getActiveOutputPaneHandle: () => OutputEditorHandle | null;
  onOutputPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onOutputPaneFocus: (paneId: string) => void;
  onOutputPaneSplitSelection: (paneId: string, selection: OutputPaneSelection) => void;
  onCloseOutputPane: () => void;
  resetOutputPanes: () => void;
};

export const useOutputPaneController = ({
  paneMode,
  outputText,
}: UseOutputPaneControllerOptions): UseOutputPaneControllerResult => {
  const outputPaneHandlesRef = useRef(new Map<string, OutputEditorHandle>());
  const activeOutputPaneIdRef = useRef(ROOT_OUTPUT_PANE_ID);
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
        isSplitSelectionEnabled: false,
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
    mutateOutputPaneChain((state) => {
      const nextState = closeRightmostOutputPane(state);
      activeOutputPaneIdRef.current = nextState.activePaneId;
      return nextState;
    });
  }, [mutateOutputPaneChain]);

  const getActiveOutputPaneHandle = useCallback((): OutputEditorHandle | null => {
    const activeHandle = outputPaneHandlesRef.current.get(activeOutputPaneIdRef.current) ?? null;
    if (activeHandle) {
      return activeHandle;
    }

    const lastVisiblePaneId = getLastVisibleOutputPaneId(outputPaneChainState);
    return outputPaneHandlesRef.current.get(lastVisiblePaneId) ?? null;
  }, [outputPaneChainState]);

  const resetOutputPanes = useCallback((): void => {
    activeOutputPaneIdRef.current = ROOT_OUTPUT_PANE_ID;
    outputPaneHandlesRef.current.clear();
    dispatchOutputPaneChain({
      type: 'replace',
      scopeKey: outputPaneScopeKey,
      chainState: createOutputPaneChainState(),
    });
  }, [outputPaneScopeKey]);

  useEffect(() => {
    activeOutputPaneIdRef.current = outputPaneChainState.activePaneId;
  }, [outputPaneChainState.activePaneId]);

  useEffect(() => {
    resetOutputPanes();
  }, [resetOutputPanes]);

  return {
    outputDocumentId,
    outputPanes,
    hasDerivedOutputPane: hasDerivedOutputPane(outputPaneChainState),
    getActiveOutputPaneHandle,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOutputPaneSplitSelection: openDerivedOutputPane,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  };
};
