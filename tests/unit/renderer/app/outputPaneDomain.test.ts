import { describe, expect, it } from 'vitest';
import {
  closeRightmostOutputPane,
  createOutputPaneChainState,
  focusOutputPane,
  getOutputPaneSourceHighlight,
  openOrReplaceDerivedOutputPane,
} from '../../../../src/renderer/app/outputPaneDomain';

const rootSelection = {
  sourceRange: {
    startLineNumber: 2,
    startColumn: 1,
    endLineNumber: 5,
    endColumn: 2,
  },
};

const childSelection = {
  sourceRange: {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 3,
    endColumn: 2,
  },
};

describe('outputPaneDomain', () => {
  it('opens and replaces a derived pane without changing its pane identity', () => {
    const opened = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      rootSelection,
    );

    expect(opened.derivedPanes).toHaveLength(1);
    expect(opened.derivedPanes[0]).toMatchObject({
      parentPaneId: 'output-root-pane',
      paneId: 'output-pane-1',
      sourceRange: rootSelection.sourceRange,
      viewStateKey: 'output-pane-1:selection-1',
    });

    const replaced = openOrReplaceDerivedOutputPane(opened, 'output-root-pane', {
      ...rootSelection,
      sourceRange: {
        startLineNumber: 7,
        startColumn: 1,
        endLineNumber: 9,
        endColumn: 2,
      },
    });

    expect(replaced.derivedPanes).toHaveLength(1);
    expect(replaced.derivedPanes[0]?.paneId).toBe('output-pane-1');
    expect(replaced.derivedPanes[0]?.viewStateKey).toBe('output-pane-1:selection-2');
    expect(replaced.nextDerivedPaneViewStateId).toBe(3);
  });

  it('treats identical reselection as a no-op unless descendants must be dropped', () => {
    const withChild = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      rootSelection,
    );
    const withGrandchild = openOrReplaceDerivedOutputPane(
      focusOutputPane(withChild, 'output-pane-1'),
      'output-pane-1',
      childSelection,
    );

    const trimmed = openOrReplaceDerivedOutputPane(
      withGrandchild,
      'output-root-pane',
      rootSelection,
    );

    expect(trimmed.derivedPanes).toHaveLength(1);
    expect(trimmed.derivedPanes[0]?.viewStateKey).toBe(withChild.derivedPanes[0]?.viewStateKey);
    expect(trimmed.activePaneId).toBe('output-pane-1');
    expect(openOrReplaceDerivedOutputPane(withChild, 'output-root-pane', rootSelection)).toBe(
      withChild,
    );
  });

  it('closes the rightmost pane and exposes parent highlights', () => {
    const withChild = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      rootSelection,
    );

    expect(getOutputPaneSourceHighlight(withChild, 'output-root-pane')).toEqual(
      rootSelection.sourceRange,
    );
    expect(getOutputPaneSourceHighlight(withChild, 'output-pane-1')).toBeNull();

    const closed = closeRightmostOutputPane(focusOutputPane(withChild, 'output-pane-1'));
    expect(closed.derivedPanes).toHaveLength(0);
    expect(closed.activePaneId).toBe('output-root-pane');
  });
});
