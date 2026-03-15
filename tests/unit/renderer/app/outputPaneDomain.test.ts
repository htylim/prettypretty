import { describe, expect, it } from 'vitest';
import {
  canNavigateOutputPaneViewportLeft,
  canNavigateOutputPaneViewportRight,
  closeRightmostOutputPane,
  createOutputPaneChainState,
  getOutputPaneViewportPosition,
  getOutputPaneSourceHighlight,
  openOrReplaceDerivedOutputPane,
  shiftOutputPaneViewport,
} from '../../../../src/renderer/app/outputPaneDomain';

const rootSelection = {
  sourceRange: {
    startLineNumber: 2,
    startColumn: 1,
    endLineNumber: 12,
    endColumn: 2,
  },
};

const childSelection = {
  sourceRange: {
    startLineNumber: 3,
    startColumn: 1,
    endLineNumber: 9,
    endColumn: 2,
  },
};

const grandchildSelection = {
  sourceRange: {
    startLineNumber: 4,
    startColumn: 1,
    endLineNumber: 6,
    endColumn: 2,
  },
};

const replacementSelection = {
  sourceRange: {
    startLineNumber: 7,
    startColumn: 1,
    endLineNumber: 10,
    endColumn: 2,
  },
};

const createRecursiveChain = () => {
  const withChild = openOrReplaceDerivedOutputPane(
    createOutputPaneChainState(),
    'output-root-pane',
    rootSelection,
  );
  const withGrandchild = openOrReplaceDerivedOutputPane(withChild, 'output-pane-1', childSelection);
  return openOrReplaceDerivedOutputPane(withGrandchild, 'output-pane-2', grandchildSelection);
};

describe('outputPaneDomain', () => {
  it('reports snapped viewport positions for toolbar split labels', () => {
    const rootOnly = createOutputPaneChainState();
    expect(getOutputPaneViewportPosition(rootOnly)).toEqual({
      current: 1,
      total: 1,
    });

    const withChild = openOrReplaceDerivedOutputPane(rootOnly, 'output-root-pane', rootSelection);
    expect(getOutputPaneViewportPosition(withChild)).toEqual({
      current: 1,
      total: 1,
    });

    const withGrandchild = openOrReplaceDerivedOutputPane(
      withChild,
      'output-pane-1',
      childSelection,
    );
    expect(getOutputPaneViewportPosition(withGrandchild)).toEqual({
      current: 2,
      total: 2,
    });

    const navigatedLeft = shiftOutputPaneViewport(withGrandchild, -1);
    expect(getOutputPaneViewportPosition(navigatedLeft)).toEqual({
      current: 1,
      total: 2,
    });
  });

  it('opens recursive child panes and targets the parent-child viewport pair', () => {
    const withChild = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      rootSelection,
    );

    expect(withChild.derivedPanes).toHaveLength(1);
    expect(withChild.derivedPanes[0]).toMatchObject({
      parentPaneId: 'output-root-pane',
      paneId: 'output-pane-1',
      sourceRange: rootSelection.sourceRange,
      viewStateKey: 'output-pane-1:selection-1',
    });
    expect(withChild.activePaneId).toBe('output-pane-1');
    expect(withChild.leftVisiblePaneIndex).toBe(0);

    const withGrandchild = openOrReplaceDerivedOutputPane(
      withChild,
      'output-pane-1',
      childSelection,
    );

    expect(withGrandchild.derivedPanes).toHaveLength(2);
    expect(withGrandchild.derivedPanes[1]).toMatchObject({
      parentPaneId: 'output-pane-1',
      paneId: 'output-pane-2',
      sourceRange: childSelection.sourceRange,
      viewStateKey: 'output-pane-2:selection-2',
    });
    expect(withGrandchild.activePaneId).toBe('output-pane-2');
    expect(withGrandchild.leftVisiblePaneIndex).toBe(1);
  });

  it('truncates descendants on upstream reselection and preserves identical child identity', () => {
    const recursiveChain = createRecursiveChain();

    const trimmed = openOrReplaceDerivedOutputPane(
      recursiveChain,
      'output-root-pane',
      rootSelection,
    );
    expect(trimmed.derivedPanes).toHaveLength(1);
    expect(trimmed.derivedPanes[0]?.paneId).toBe('output-pane-1');
    expect(trimmed.derivedPanes[0]?.viewStateKey).toBe('output-pane-1:selection-1');
    expect(trimmed.activePaneId).toBe('output-pane-1');
    expect(trimmed.leftVisiblePaneIndex).toBe(0);

    const replaced = openOrReplaceDerivedOutputPane(
      recursiveChain,
      'output-pane-1',
      replacementSelection,
    );
    expect(replaced.derivedPanes).toHaveLength(2);
    expect(replaced.derivedPanes[1]).toMatchObject({
      parentPaneId: 'output-pane-1',
      paneId: 'output-pane-2',
      sourceRange: replacementSelection.sourceRange,
      viewStateKey: 'output-pane-2:selection-4',
    });
    expect(replaced.activePaneId).toBe('output-pane-2');
    expect(replaced.leftVisiblePaneIndex).toBe(1);
  });

  it('pops the rightmost pane, keeps source highlights, and navigates the snapped viewport', () => {
    const recursiveChain = createRecursiveChain();

    expect(getOutputPaneSourceHighlight(recursiveChain, 'output-root-pane')).toEqual(
      rootSelection.sourceRange,
    );
    expect(getOutputPaneSourceHighlight(recursiveChain, 'output-pane-1')).toEqual(
      childSelection.sourceRange,
    );
    expect(getOutputPaneSourceHighlight(recursiveChain, 'output-pane-2')).toEqual(
      grandchildSelection.sourceRange,
    );

    const navigatedLeft = shiftOutputPaneViewport(recursiveChain, -1);
    expect(navigatedLeft.leftVisiblePaneIndex).toBe(1);
    expect(navigatedLeft.activePaneId).toBe('output-pane-1');
    expect(canNavigateOutputPaneViewportLeft(navigatedLeft)).toBe(true);
    expect(canNavigateOutputPaneViewportRight(navigatedLeft)).toBe(true);

    const navigatedFarLeft = shiftOutputPaneViewport(navigatedLeft, -1);
    expect(navigatedFarLeft.leftVisiblePaneIndex).toBe(0);
    expect(navigatedFarLeft.activePaneId).toBe('output-root-pane');
    expect(canNavigateOutputPaneViewportLeft(navigatedFarLeft)).toBe(false);
    expect(canNavigateOutputPaneViewportRight(navigatedFarLeft)).toBe(true);

    const closed = closeRightmostOutputPane(recursiveChain);
    expect(closed.derivedPanes).toHaveLength(2);
    expect(closed.leftVisiblePaneIndex).toBe(1);
    expect(closed.activePaneId).toBe('output-pane-2');

    const closedAgain = closeRightmostOutputPane(closed);
    expect(closedAgain.derivedPanes).toHaveLength(1);
    expect(closedAgain.leftVisiblePaneIndex).toBe(0);
    expect(closedAgain.activePaneId).toBe('output-pane-1');
    expect(canNavigateOutputPaneViewportRight(closedAgain)).toBe(false);
  });
});
