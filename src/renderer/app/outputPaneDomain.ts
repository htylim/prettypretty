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
  nextDerivedPaneViewStateId: number;
};

export const createOutputPaneChainState = (): OutputPaneChainState => ({
  activePaneId: ROOT_OUTPUT_PANE_ID,
  derivedPanes: [],
  nextDerivedPaneViewStateId: 1,
});

export const getRootOutputPaneViewStateKey = (documentId: string): string => {
  return `${ROOT_OUTPUT_PANE_ID}:${documentId}`;
};

export const hasDerivedOutputPane = (state: OutputPaneChainState): boolean => {
  return state.derivedPanes.length > 0;
};

export const getLastVisibleOutputPaneId = (
  state: Pick<OutputPaneChainState, 'derivedPanes'>,
): string => {
  return state.derivedPanes.at(-1)?.paneId ?? ROOT_OUTPUT_PANE_ID;
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

const getPaneDepth = (derivedPanes: DerivedOutputPane[], paneId: string): number | null => {
  if (paneId === ROOT_OUTPUT_PANE_ID) {
    return -1;
  }

  const paneIndex = derivedPanes.findIndex((pane) => pane.paneId === paneId);
  return paneIndex === -1 ? null : paneIndex;
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
    : getLastVisibleOutputPaneId({ derivedPanes });
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
  return {
    ...state,
    activePaneId: normalizeActivePaneId(state.activePaneId, nextDerivedPanes),
    derivedPanes: nextDerivedPanes,
  };
};

export const openOrReplaceDerivedOutputPane = (
  state: OutputPaneChainState,
  parentPaneId: string,
  selection: OutputPaneSelection,
): OutputPaneChainState => {
  const parentDepth = getPaneDepth(state.derivedPanes, parentPaneId);
  if (parentDepth === null) {
    return state;
  }

  const childIndex = parentDepth + 1;
  const nextPrefix = state.derivedPanes.slice(0, childIndex);
  const existingChild = state.derivedPanes[childIndex];
  const nextPaneId = existingChild?.paneId ?? createDerivedPaneId(childIndex + 1);
  const nextDerivedPanesWithoutDescendants =
    existingChild === undefined ? nextPrefix : [...nextPrefix, existingChild];
  const hasDescendantsToDrop = state.derivedPanes.length > childIndex + 1;
  const isSameChildSelection =
    existingChild !== undefined &&
    existingChild.parentPaneId === parentPaneId &&
    areSourceRangesEqual(existingChild.sourceRange, selection.sourceRange);

  if (isSameChildSelection) {
    if (!hasDescendantsToDrop) {
      return state;
    }

    return {
      ...state,
      activePaneId: normalizeActivePaneId(state.activePaneId, nextDerivedPanesWithoutDescendants),
      derivedPanes: nextDerivedPanesWithoutDescendants,
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
    activePaneId: normalizeActivePaneId(state.activePaneId, nextDerivedPanes),
    derivedPanes: nextDerivedPanes,
    nextDerivedPaneViewStateId: state.nextDerivedPaneViewStateId + 1,
  };
};

export const getOutputPaneSourceHighlight = (
  state: Pick<OutputPaneChainState, 'derivedPanes'>,
  paneId: string,
): OutputPaneSourceRange | null => {
  const childPane = state.derivedPanes.find((pane) => pane.parentPaneId === paneId) ?? null;
  return childPane?.sourceRange ?? null;
};
