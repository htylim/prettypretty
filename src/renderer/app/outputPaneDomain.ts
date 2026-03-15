import type { IRange } from 'monaco-editor';

export const ROOT_OUTPUT_PANE_ID = 'output-root-pane';

export type OutputPaneSourceRange = Pick<
  IRange,
  'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'
>;

export type OutputPaneSelection = {
  sourceRange: OutputPaneSourceRange;
};

export type DerivedOutputPane = {
  parentPaneId: string;
  paneId: string;
  sourceRange: OutputPaneSourceRange;
  viewStateKey: string;
};

export type OutputPaneChainState = {
  activePaneId: string;
  derivedPanes: DerivedOutputPane[];
  leftVisiblePaneIndex: number;
  nextDerivedPaneViewStateId: number;
};

export const createOutputPaneChainState = (): OutputPaneChainState => ({
  activePaneId: ROOT_OUTPUT_PANE_ID,
  derivedPanes: [],
  leftVisiblePaneIndex: 0,
  nextDerivedPaneViewStateId: 1,
});

export const getRootOutputPaneViewStateKey = (documentId: string): string => {
  return `${ROOT_OUTPUT_PANE_ID}:${documentId}`;
};

export const hasDerivedOutputPane = (state: OutputPaneChainState): boolean => {
  return state.derivedPanes.length > 0;
};

export const getOutputPaneCount = (state: Pick<OutputPaneChainState, 'derivedPanes'>): number => {
  return state.derivedPanes.length + 1;
};

export const getLastOutputPaneId = (state: Pick<OutputPaneChainState, 'derivedPanes'>): string => {
  return state.derivedPanes.at(-1)?.paneId ?? ROOT_OUTPUT_PANE_ID;
};

const getMaxLeftVisiblePaneIndex = (state: Pick<OutputPaneChainState, 'derivedPanes'>): number => {
  return Math.max(0, getOutputPaneCount(state) - 2);
};

const clampLeftVisiblePaneIndex = (
  leftVisiblePaneIndex: number,
  state: Pick<OutputPaneChainState, 'derivedPanes'>,
): number => {
  return Math.min(Math.max(leftVisiblePaneIndex, 0), getMaxLeftVisiblePaneIndex(state));
};

const getOutputPaneIndex = (derivedPanes: DerivedOutputPane[], paneId: string): number | null => {
  if (paneId === ROOT_OUTPUT_PANE_ID) {
    return 0;
  }

  const paneIndex = derivedPanes.findIndex((pane) => pane.paneId === paneId);
  return paneIndex === -1 ? null : paneIndex + 1;
};

const getOutputPaneIdAtIndex = (
  derivedPanes: DerivedOutputPane[],
  paneIndex: number,
): string | null => {
  if (paneIndex === 0) {
    return ROOT_OUTPUT_PANE_ID;
  }

  return derivedPanes[paneIndex - 1]?.paneId ?? null;
};

export const getRightmostVisibleOutputPaneId = (
  state: Pick<OutputPaneChainState, 'derivedPanes' | 'leftVisiblePaneIndex'>,
): string => {
  const rightmostVisiblePaneIndex = Math.min(
    getOutputPaneCount(state) - 1,
    state.leftVisiblePaneIndex + 1,
  );
  return (
    getOutputPaneIdAtIndex(state.derivedPanes, rightmostVisiblePaneIndex) ?? ROOT_OUTPUT_PANE_ID
  );
};

export const getOutputPaneViewportPosition = (
  state: Pick<OutputPaneChainState, 'derivedPanes' | 'leftVisiblePaneIndex'>,
): {
  current: number;
  total: number;
} => {
  return {
    current: state.leftVisiblePaneIndex + 1,
    total: Math.max(1, getOutputPaneCount(state) - 1),
  };
};

export const canNavigateOutputPaneViewportLeft = (
  state: Pick<OutputPaneChainState, 'derivedPanes' | 'leftVisiblePaneIndex'>,
): boolean => {
  return getOutputPaneCount(state) > 2 && state.leftVisiblePaneIndex > 0;
};

export const canNavigateOutputPaneViewportRight = (
  state: Pick<OutputPaneChainState, 'derivedPanes' | 'leftVisiblePaneIndex'>,
): boolean => {
  return (
    getOutputPaneCount(state) > 2 && state.leftVisiblePaneIndex < getMaxLeftVisiblePaneIndex(state)
  );
};

const areSourceRangesEqual = (
  left: OutputPaneSourceRange,
  right: OutputPaneSourceRange,
): boolean => {
  return (
    left.startLineNumber === right.startLineNumber &&
    left.startColumn === right.startColumn &&
    left.endLineNumber === right.endLineNumber &&
    left.endColumn === right.endColumn
  );
};

const createDerivedPaneId = (depth: number): string => {
  return `output-pane-${depth}`;
};

const createDerivedPaneViewStateKey = (paneId: string, sequence: number): string => {
  return `${paneId}:selection-${sequence}`;
};

const normalizeActivePaneId = (activePaneId: string, derivedPanes: DerivedOutputPane[]): string => {
  if (activePaneId === ROOT_OUTPUT_PANE_ID) {
    return ROOT_OUTPUT_PANE_ID;
  }

  return derivedPanes.some((pane) => pane.paneId === activePaneId)
    ? activePaneId
    : getLastOutputPaneId({ derivedPanes });
};

export const focusOutputPane = (
  state: OutputPaneChainState,
  paneId: string,
): OutputPaneChainState => {
  const nextActivePaneId = normalizeActivePaneId(paneId, state.derivedPanes);
  if (nextActivePaneId === state.activePaneId) {
    return state;
  }

  return {
    ...state,
    activePaneId: nextActivePaneId,
  };
};

export const closeRightmostOutputPane = (state: OutputPaneChainState): OutputPaneChainState => {
  if (!hasDerivedOutputPane(state)) {
    return state;
  }

  const nextDerivedPanes = state.derivedPanes.slice(0, -1);
  const nextLeftVisiblePaneIndex = clampLeftVisiblePaneIndex(
    getOutputPaneCount({ derivedPanes: nextDerivedPanes }) - 2,
    {
      derivedPanes: nextDerivedPanes,
    },
  );
  const nextActivePaneId = getRightmostVisibleOutputPaneId({
    derivedPanes: nextDerivedPanes,
    leftVisiblePaneIndex: nextLeftVisiblePaneIndex,
  });
  return {
    ...state,
    activePaneId: normalizeActivePaneId(nextActivePaneId, nextDerivedPanes),
    derivedPanes: nextDerivedPanes,
    leftVisiblePaneIndex: nextLeftVisiblePaneIndex,
  };
};

export const openOrReplaceDerivedOutputPane = (
  state: OutputPaneChainState,
  parentPaneId: string,
  selection: OutputPaneSelection,
): OutputPaneChainState => {
  const parentPaneIndex = getOutputPaneIndex(state.derivedPanes, parentPaneId);
  if (parentPaneIndex === null) {
    return state;
  }

  const childDerivedPaneIndex = parentPaneIndex;
  const nextPrefix = state.derivedPanes.slice(0, childDerivedPaneIndex);
  const existingChild = state.derivedPanes[childDerivedPaneIndex];
  const nextPaneId = existingChild?.paneId ?? createDerivedPaneId(childDerivedPaneIndex + 1);
  const nextLeftVisiblePaneIndex = clampLeftVisiblePaneIndex(parentPaneIndex, {
    derivedPanes: existingChild ? [...nextPrefix, existingChild] : nextPrefix,
  });
  const nextDerivedPanesWithoutDescendants =
    existingChild === undefined ? nextPrefix : [...nextPrefix, existingChild];
  const hasDescendantsToDrop = state.derivedPanes.length > childDerivedPaneIndex + 1;
  const isSameChildSelection =
    existingChild !== undefined &&
    existingChild.parentPaneId === parentPaneId &&
    areSourceRangesEqual(existingChild.sourceRange, selection.sourceRange);

  if (isSameChildSelection) {
    if (
      !hasDescendantsToDrop &&
      state.activePaneId === existingChild.paneId &&
      state.leftVisiblePaneIndex === nextLeftVisiblePaneIndex
    ) {
      return state;
    }

    return {
      ...state,
      activePaneId: existingChild.paneId,
      derivedPanes: nextDerivedPanesWithoutDescendants,
      leftVisiblePaneIndex: nextLeftVisiblePaneIndex,
    };
  }

  const nextDerivedPane: DerivedOutputPane = {
    parentPaneId,
    paneId: nextPaneId,
    sourceRange: selection.sourceRange,
    viewStateKey: createDerivedPaneViewStateKey(nextPaneId, state.nextDerivedPaneViewStateId),
  };

  const nextDerivedPanes = [...nextPrefix, nextDerivedPane];
  return {
    activePaneId: nextDerivedPane.paneId,
    derivedPanes: nextDerivedPanes,
    leftVisiblePaneIndex: parentPaneIndex,
    nextDerivedPaneViewStateId: state.nextDerivedPaneViewStateId + 1,
  };
};

export const shiftOutputPaneViewport = (
  state: OutputPaneChainState,
  stepDelta: number,
): OutputPaneChainState => {
  if (stepDelta === 0 || getOutputPaneCount(state) < 3) {
    return state;
  }

  const nextLeftVisiblePaneIndex = clampLeftVisiblePaneIndex(
    state.leftVisiblePaneIndex + stepDelta,
    state,
  );
  if (nextLeftVisiblePaneIndex === state.leftVisiblePaneIndex) {
    return state;
  }

  const nextActivePaneIndex =
    stepDelta > 0 ? nextLeftVisiblePaneIndex + 1 : nextLeftVisiblePaneIndex;
  const nextActivePaneId =
    getOutputPaneIdAtIndex(state.derivedPanes, nextActivePaneIndex) ?? ROOT_OUTPUT_PANE_ID;

  return {
    ...state,
    activePaneId: nextActivePaneId,
    leftVisiblePaneIndex: nextLeftVisiblePaneIndex,
  };
};

export const getOutputPaneSourceHighlight = (
  state: Pick<OutputPaneChainState, 'derivedPanes'>,
  paneId: string,
): OutputPaneSourceRange | null => {
  const childPane = state.derivedPanes.find((pane) => pane.parentPaneId === paneId) ?? null;
  return childPane?.sourceRange ?? null;
};
