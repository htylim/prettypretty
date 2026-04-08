import { areOutputPaneSourceRangesEqual, type OutputPaneSourceRange } from '../output/outputRange';
import type { OutputLanguageId } from '../output/detectOutputLanguage';

export type { OutputPaneSourceRange } from '../output/outputRange';

export const ROOT_OUTPUT_PANE_ID = 'output-root-pane';

export type SourceRangeOutputPaneContent = {
  kind: 'source-range';
  documentId: string;
  value: string;
  sourceRange: OutputPaneSourceRange;
};

export type IndependentTextOutputPaneContent = {
  kind: 'independent-text';
  documentId: string;
  value: string;
  languageOverride?: OutputLanguageId | null;
};

export type ExtractedSourceOutputPaneContent = {
  kind: 'extracted-source';
  documentId: string;
  value: string;
  sourceRange: OutputPaneSourceRange;
  lineNumberStart: number;
};

export type OutputPaneContent =
  | SourceRangeOutputPaneContent
  | IndependentTextOutputPaneContent
  | ExtractedSourceOutputPaneContent;

export type OutputPaneContentInput =
  | SourceRangeOutputPaneContent
  | {
      kind: 'extracted-source';
      value: string;
      sourceRange: OutputPaneSourceRange;
      lineNumberStart: number;
    }
  | {
      kind: 'independent-text';
      value: string;
      languageOverride?: OutputLanguageId | null;
    };

export type DerivedOutputPane = {
  parentPaneId: string;
  paneId: string;
  content: OutputPaneContent;
  viewStateKey: string;
};

export type OutputPaneDescriptor = {
  paneId: string;
  parentPaneId: string | null;
  documentId: string;
  value: string;
  lineNumberStart: number | null;
  viewRange: OutputPaneSourceRange | null;
  viewStateKey: string;
};

export type OutputPaneChainState = {
  activePaneId: string;
  derivedPanes: DerivedOutputPane[];
  leftVisiblePaneIndex: number;
  nextDerivedPaneSequence: number;
};

export const createOutputPaneChainState = (): OutputPaneChainState => ({
  activePaneId: ROOT_OUTPUT_PANE_ID,
  derivedPanes: [],
  leftVisiblePaneIndex: 0,
  nextDerivedPaneSequence: 1,
});

export const getRootOutputPaneViewStateKey = (documentId: string): string => {
  return `${ROOT_OUTPUT_PANE_ID}:${documentId}`;
};

export const createRootOutputPaneDescriptor = (
  documentId: string,
  value: string,
): OutputPaneDescriptor => ({
  paneId: ROOT_OUTPUT_PANE_ID,
  parentPaneId: null,
  documentId,
  value,
  lineNumberStart: null,
  viewRange: null,
  viewStateKey: getRootOutputPaneViewStateKey(documentId),
});

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

export const getOutputPaneViewRange = (
  content: OutputPaneContent,
): OutputPaneSourceRange | null => {
  return content.kind === 'source-range' ? content.sourceRange : null;
};

export const getOutputPaneLineNumberStart = (content: OutputPaneContent): number | null => {
  return content.kind === 'extracted-source' ? content.lineNumberStart : null;
};

export const toOutputPaneDescriptor = (
  pane: Pick<DerivedOutputPane, 'paneId' | 'parentPaneId' | 'content' | 'viewStateKey'>,
): OutputPaneDescriptor => ({
  paneId: pane.paneId,
  parentPaneId: pane.parentPaneId,
  documentId: pane.content.documentId,
  value: pane.content.value,
  lineNumberStart: getOutputPaneLineNumberStart(pane.content),
  viewRange: getOutputPaneViewRange(pane.content),
  viewStateKey: pane.viewStateKey,
});

const areOutputPaneContentsEqual = (
  left: OutputPaneContent,
  right: OutputPaneContentInput,
): boolean => {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'source-range' && right.kind === 'source-range') {
    return (
      left.documentId === right.documentId &&
      left.value === right.value &&
      areOutputPaneSourceRangesEqual(left.sourceRange, right.sourceRange)
    );
  }

  if (left.kind === 'extracted-source' && right.kind === 'extracted-source') {
    return (
      left.value === right.value &&
      left.lineNumberStart === right.lineNumberStart &&
      areOutputPaneSourceRangesEqual(left.sourceRange, right.sourceRange)
    );
  }

  return left.kind === 'independent-text' && right.kind === 'independent-text'
    ? left.value === right.value && left.languageOverride === (right.languageOverride ?? null)
    : false;
};

const createDerivedPaneId = (depth: number): string => {
  return `output-pane-${depth}`;
};

const createDerivedPaneViewStateKey = (paneId: string, sequence: number): string => {
  return `${paneId}:content-${sequence}`;
};

const createDerivedPaneDocumentId = (paneId: string, sequence: number): string => {
  return `${paneId}:document-${sequence}`;
};

const createOutputPaneContent = (
  paneId: string,
  sequence: number,
  content: OutputPaneContentInput,
): OutputPaneContent => {
  if (content.kind === 'source-range') {
    return content;
  }

  if (content.kind === 'extracted-source') {
    return {
      kind: 'extracted-source',
      documentId: createDerivedPaneDocumentId(paneId, sequence),
      value: content.value,
      sourceRange: content.sourceRange,
      lineNumberStart: content.lineNumberStart,
    };
  }

  return {
    kind: 'independent-text',
    documentId: createDerivedPaneDocumentId(paneId, sequence),
    value: content.value,
    languageOverride: content.languageOverride ?? null,
  };
};

export const getDirectChildExtractedSourceRange = (
  state: Pick<OutputPaneChainState, 'derivedPanes'>,
  parentPaneId: string,
): OutputPaneSourceRange | null => {
  const parentPaneIndex = getOutputPaneIndex(state.derivedPanes, parentPaneId);
  if (parentPaneIndex === null) {
    return null;
  }

  const directChild = state.derivedPanes[parentPaneIndex];
  return directChild?.content.kind === 'extracted-source' ? directChild.content.sourceRange : null;
};

export const toggleExtractedSourceOutputPane = (
  state: OutputPaneChainState,
  parentPaneId: string,
  content: Extract<OutputPaneContentInput, { kind: 'extracted-source' }>,
): OutputPaneChainState => {
  const directChildRange = getDirectChildExtractedSourceRange(state, parentPaneId);
  if (directChildRange && areOutputPaneSourceRangesEqual(directChildRange, content.sourceRange)) {
    return invalidateOutputPaneDescendants(state, parentPaneId);
  }

  return openOrReplaceDerivedOutputPane(state, parentPaneId, content);
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

/**
 * Every pane depends on the pane immediately to its left. When a pane changes,
 * all panes to the right become invalid and must be removed from the chain.
 */
export const invalidateOutputPaneDescendants = (
  state: OutputPaneChainState,
  paneId: string,
): OutputPaneChainState => {
  const paneIndex = getOutputPaneIndex(state.derivedPanes, paneId);
  if (paneIndex === null) {
    return state;
  }

  const nextDerivedPanes = state.derivedPanes.slice(0, paneIndex);
  if (nextDerivedPanes.length === state.derivedPanes.length) {
    return state;
  }

  return {
    ...state,
    activePaneId: normalizeActivePaneId(state.activePaneId, nextDerivedPanes),
    derivedPanes: nextDerivedPanes,
    leftVisiblePaneIndex: clampLeftVisiblePaneIndex(state.leftVisiblePaneIndex, {
      derivedPanes: nextDerivedPanes,
    }),
  };
};

/**
 * The pane strip is a linear dependency chain. Every pane to the right depends
 * on the pane immediately to its left, so reopening a parent trims its child
 * and every descendant before the replacement content is inserted.
 */
export const openOrReplaceDerivedOutputPane = (
  state: OutputPaneChainState,
  parentPaneId: string,
  content: OutputPaneContentInput,
): OutputPaneChainState => {
  const parentPaneIndex = getOutputPaneIndex(state.derivedPanes, parentPaneId);
  if (parentPaneIndex === null) {
    return state;
  }

  const childDerivedPaneIndex = parentPaneIndex;
  const nextPrefix = state.derivedPanes.slice(0, childDerivedPaneIndex);
  const existingChild = state.derivedPanes[childDerivedPaneIndex];
  const nextPaneId = existingChild?.paneId ?? createDerivedPaneId(childDerivedPaneIndex + 1);
  const stateWithoutDescendants =
    existingChild === undefined
      ? state
      : invalidateOutputPaneDescendants(state, existingChild.paneId);
  const nextLeftVisiblePaneIndex = clampLeftVisiblePaneIndex(parentPaneIndex, {
    derivedPanes: existingChild ? [...nextPrefix, existingChild] : nextPrefix,
  });
  const isSameChildContent =
    existingChild !== undefined &&
    existingChild.parentPaneId === parentPaneId &&
    areOutputPaneContentsEqual(existingChild.content, content);

  if (isSameChildContent) {
    if (
      stateWithoutDescendants === state &&
      state.activePaneId === existingChild.paneId &&
      state.leftVisiblePaneIndex === nextLeftVisiblePaneIndex
    ) {
      return state;
    }

    return {
      ...stateWithoutDescendants,
      activePaneId: existingChild.paneId,
      leftVisiblePaneIndex: nextLeftVisiblePaneIndex,
    };
  }

  const sequence = state.nextDerivedPaneSequence;
  const nextDerivedPane: DerivedOutputPane = {
    parentPaneId,
    paneId: nextPaneId,
    content: createOutputPaneContent(nextPaneId, sequence, content),
    viewStateKey: createDerivedPaneViewStateKey(nextPaneId, sequence),
  };

  const nextDerivedPanes = [...nextPrefix, nextDerivedPane];
  return {
    ...stateWithoutDescendants,
    activePaneId: nextDerivedPane.paneId,
    derivedPanes: nextDerivedPanes,
    leftVisiblePaneIndex: parentPaneIndex,
    nextDerivedPaneSequence: sequence + 1,
  };
};

export const getOutputPaneDescendantIds = (
  state: Pick<OutputPaneChainState, 'derivedPanes'>,
  paneId: string,
): string[] => {
  const paneIndex = getOutputPaneIndex(state.derivedPanes, paneId);
  if (paneIndex === null) {
    return [];
  }

  return state.derivedPanes.slice(paneIndex).map((pane) => pane.paneId);
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
