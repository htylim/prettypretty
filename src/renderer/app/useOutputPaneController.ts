import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { PaneMode } from '../../shared/types';
import type { OutputEditorHandle } from '../components/OutputEditor';
import type { OutputPaneViewModel } from '../components/OutputPaneStrip';
import { getOutputDocumentId } from './appDomain';
import {
  canNavigateOutputPaneViewportLeft,
  canNavigateOutputPaneViewportRight,
  closeRightmostOutputPane,
  createOutputPaneChainState,
  focusOutputPane,
  getOutputPaneViewRange,
  getOutputPaneViewportPosition,
  getRightmostVisibleOutputPaneId,
  getRootOutputPaneViewStateKey,
  hasDerivedOutputPane,
  invalidateOutputPaneDescendants,
  openOrReplaceDerivedOutputPane,
  ROOT_OUTPUT_PANE_ID,
  shiftOutputPaneViewport,
  type OutputPaneContentInput,
} from './outputPaneDomain';

type OutputPaneFocusRequest = {
  paneId: string;
  sequence: number;
};

type OutputPaneControllerState = {
  chainState: ReturnType<typeof createOutputPaneChainState>;
  focusRequest: OutputPaneFocusRequest | null;
};

type OutputPaneControllerAction = {
  type: 'replace';
  nextState: OutputPaneControllerState;
};

const createOutputPaneControllerState = (): OutputPaneControllerState => ({
  chainState: createOutputPaneChainState(),
  focusRequest: null,
});

const outputPaneControllerReducer = (
  _state: OutputPaneControllerState,
  action: OutputPaneControllerAction,
): OutputPaneControllerState => {
  return action.nextState;
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
  visibleOutputPanePosition: {
    current: number;
    total: number;
  };
  hasDerivedOutputPane: boolean;
  canNavigateOutputPaneLeft: boolean;
  canNavigateOutputPaneRight: boolean;
  outputPaneFocusRequest: OutputPaneFocusRequest | null;
  getActiveOutputPaneHandle: () => OutputEditorHandle | null;
  onOutputPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onOutputPaneFocus: (paneId: string) => void;
  onOpenOutputPane: (parentPaneId: string, content: OutputPaneContentInput) => void;
  onInvalidateOutputPaneDescendants: (paneId: string) => void;
  onNavigateOutputPaneViewport: (stepDelta: number) => void;
  onCloseOutputPane: () => void;
  resetOutputPanes: () => void;
};

/**
 * The pane controller owns transient renderer-only concerns: mounted handles
 * and focus requests that should happen after the strip finishes animating into
 * place.
 */
export const useOutputPaneController = ({
  paneMode,
  outputText,
}: UseOutputPaneControllerOptions): UseOutputPaneControllerResult => {
  const outputPaneHandlesRef = useRef(new Map<string, OutputEditorHandle>());
  const nextFocusRequestSequenceRef = useRef(1);
  const [outputPaneControllerState, dispatchOutputPaneController] = useReducer(
    outputPaneControllerReducer,
    undefined,
    createOutputPaneControllerState,
  );

  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const outputPaneResetScopeKey = `${paneMode}:${outputDocumentId}`;
  const outputPaneChainState = outputPaneControllerState.chainState;
  const outputPaneControllerStateRef = useRef(outputPaneControllerState);

  useEffect(() => {
    outputPaneControllerStateRef.current = outputPaneControllerState;
  }, [outputPaneControllerState]);

  useEffect(() => {
    outputPaneHandlesRef.current.clear();
    const nextState = createOutputPaneControllerState();
    outputPaneControllerStateRef.current = nextState;
    dispatchOutputPaneController({
      type: 'replace',
      nextState,
    });
  }, [outputPaneResetScopeKey]);

  const updateOutputPaneControllerState = useCallback(
    (nextState: OutputPaneControllerState): void => {
      outputPaneControllerStateRef.current = nextState;
      dispatchOutputPaneController({
        type: 'replace',
        nextState,
      });
    },
    [],
  );

  const outputPanes = useMemo<OutputPaneViewModel[]>(() => {
    const rootPane: OutputPaneViewModel = {
      paneId: ROOT_OUTPUT_PANE_ID,
      documentId: outputDocumentId,
      viewStateKey: getRootOutputPaneViewStateKey(outputDocumentId),
      value: outputText,
      viewRange: null,
      testId: 'output-editor',
    };

    return [
      rootPane,
      ...outputPaneChainState.derivedPanes.map((pane, index) => ({
        paneId: pane.paneId,
        documentId: pane.content.documentId,
        viewStateKey: pane.viewStateKey,
        value: pane.content.value,
        viewRange: getOutputPaneViewRange(pane.content),
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
      focusRequest: OutputPaneFocusRequest | null = outputPaneControllerStateRef.current
        .focusRequest,
    ): void => {
      const currentState = outputPaneControllerStateRef.current;
      const nextChainState = mutator(currentState.chainState);
      if (
        nextChainState === currentState.chainState &&
        focusRequest === currentState.focusRequest
      ) {
        return;
      }

      updateOutputPaneControllerState({
        ...currentState,
        chainState: nextChainState,
        focusRequest,
      });
    },
    [updateOutputPaneControllerState],
  );

  const applyOutputPaneChainState = useCallback(
    (
      nextChainState: ReturnType<typeof createOutputPaneChainState>,
      focusRequest: OutputPaneFocusRequest | null = outputPaneControllerStateRef.current
        .focusRequest,
    ): void => {
      const currentState = outputPaneControllerStateRef.current;
      if (
        nextChainState === currentState.chainState &&
        focusRequest === currentState.focusRequest
      ) {
        return;
      }

      updateOutputPaneControllerState({
        ...currentState,
        chainState: nextChainState,
        focusRequest,
      });
    },
    [updateOutputPaneControllerState],
  );

  const focusVisibleOutputPane = useCallback(
    (paneId: string): void => {
      mutateOutputPaneChain((state) => focusOutputPane(state, paneId));
    },
    [mutateOutputPaneChain],
  );

  const openOutputPane = useCallback(
    (parentPaneId: string, content: OutputPaneContentInput): void => {
      const currentState = outputPaneControllerStateRef.current;
      const nextChainState = openOrReplaceDerivedOutputPane(
        currentState.chainState,
        parentPaneId,
        content,
      );
      if (nextChainState === currentState.chainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
  );

  const invalidateDescendantOutputPanes = useCallback(
    (paneId: string): void => {
      const currentState = outputPaneControllerStateRef.current;
      const nextChainState = invalidateOutputPaneDescendants(currentState.chainState, paneId);
      if (nextChainState === currentState.chainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
  );

  const closeDerivedOutputPane = useCallback((): void => {
    const currentState = outputPaneControllerStateRef.current;
    const nextChainState = closeRightmostOutputPane(currentState.chainState);
    if (nextChainState === currentState.chainState) {
      return;
    }

    applyOutputPaneChainState(nextChainState, {
      paneId: nextChainState.activePaneId,
      sequence: nextFocusRequestSequenceRef.current++,
    });
  }, [applyOutputPaneChainState]);

  const navigateOutputPaneViewport = useCallback(
    (stepDelta: number): void => {
      const currentState = outputPaneControllerStateRef.current;
      const nextChainState = shiftOutputPaneViewport(currentState.chainState, stepDelta);
      if (nextChainState === currentState.chainState) {
        return;
      }

      applyOutputPaneChainState(nextChainState, {
        paneId: nextChainState.activePaneId,
        sequence: nextFocusRequestSequenceRef.current++,
      });
    },
    [applyOutputPaneChainState],
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
    updateOutputPaneControllerState(createOutputPaneControllerState());
  }, [updateOutputPaneControllerState]);

  return {
    outputDocumentId,
    outputPanes,
    activeOutputPaneId: outputPaneChainState.activePaneId,
    leftVisiblePaneIndex: outputPaneChainState.leftVisiblePaneIndex,
    visibleOutputPanePosition: getOutputPaneViewportPosition(outputPaneChainState),
    hasDerivedOutputPane: hasDerivedOutputPane(outputPaneChainState),
    canNavigateOutputPaneLeft: canNavigateOutputPaneViewportLeft(outputPaneChainState),
    canNavigateOutputPaneRight: canNavigateOutputPaneViewportRight(outputPaneChainState),
    outputPaneFocusRequest: outputPaneControllerState.focusRequest,
    getActiveOutputPaneHandle,
    onOutputPaneHandleChange: registerOutputPaneHandle,
    onOutputPaneFocus: focusVisibleOutputPane,
    onOpenOutputPane: openOutputPane,
    onInvalidateOutputPaneDescendants: invalidateDescendantOutputPanes,
    onNavigateOutputPaneViewport: navigateOutputPaneViewport,
    onCloseOutputPane: closeDerivedOutputPane,
    resetOutputPanes,
  };
};
