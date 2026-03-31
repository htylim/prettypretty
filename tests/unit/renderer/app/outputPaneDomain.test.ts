import { describe, expect, it } from 'vitest';
import {
  canNavigateOutputPaneViewportLeft,
  canNavigateOutputPaneViewportRight,
  closeRightmostOutputPane,
  createOutputPaneChainState,
  getOutputPaneDescendantIds,
  getOutputPaneViewRange,
  getOutputPaneViewportPosition,
  invalidateOutputPaneDescendants,
  openOrReplaceDerivedOutputPane,
  shiftOutputPaneViewport,
  toggleExtractedSourceOutputPane,
} from '../../../../src/renderer/app/outputPaneDomain';

const rootContent = {
  kind: 'source-range' as const,
  documentId: 'root-doc',
  value: '{\n  "root": true,\n  "nested": {\n    "leaf": 1\n  }\n}',
  sourceRange: {
    startLineNumber: 2,
    startColumn: 1,
    endLineNumber: 6,
    endColumn: 2,
  },
};

const childContent = {
  kind: 'independent-text' as const,
  value: '{\n  "leaf": 1\n}',
};

const grandchildContent = {
  kind: 'independent-text' as const,
  value: '{\n  "id": 1\n}',
};

const replacementChildContent = {
  kind: 'independent-text' as const,
  value: '{\n  "leaf": 2\n}',
};

const extractedSourceContent = {
  kind: 'extracted-source' as const,
  value: '{\n  "leaf": 1\n}',
  sourceRange: {
    startLineNumber: 3,
    startColumn: 1,
    endLineNumber: 5,
    endColumn: 2,
  },
  lineNumberStart: 3,
};

const createRecursiveChain = () => {
  const withChild = openOrReplaceDerivedOutputPane(
    createOutputPaneChainState(),
    'output-root-pane',
    rootContent,
  );
  const withGrandchild = openOrReplaceDerivedOutputPane(withChild, 'output-pane-1', childContent);
  return openOrReplaceDerivedOutputPane(withGrandchild, 'output-pane-2', grandchildContent);
};

describe('outputPaneDomain', () => {
  it('reports snapped viewport positions for toolbar split labels', () => {
    const rootOnly = createOutputPaneChainState();
    expect(getOutputPaneViewportPosition(rootOnly)).toEqual({
      current: 1,
      total: 1,
    });

    const withChild = openOrReplaceDerivedOutputPane(rootOnly, 'output-root-pane', rootContent);
    expect(getOutputPaneViewportPosition(withChild)).toEqual({
      current: 1,
      total: 1,
    });

    const withGrandchild = openOrReplaceDerivedOutputPane(withChild, 'output-pane-1', childContent);
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

  it('preserves source-range panes and assigns unique model identities to independent panes', () => {
    const withChild = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      rootContent,
    );

    expect(withChild.derivedPanes).toHaveLength(1);
    expect(withChild.derivedPanes[0]).toMatchObject({
      parentPaneId: 'output-root-pane',
      paneId: 'output-pane-1',
      viewStateKey: 'output-pane-1:content-1',
      content: rootContent,
    });
    expect(getOutputPaneViewRange(withChild.derivedPanes[0]!.content)).toEqual(
      rootContent.sourceRange,
    );

    const withGrandchild = openOrReplaceDerivedOutputPane(withChild, 'output-pane-1', childContent);
    expect(withGrandchild.derivedPanes).toHaveLength(2);
    expect(withGrandchild.derivedPanes[1]).toMatchObject({
      parentPaneId: 'output-pane-1',
      paneId: 'output-pane-2',
      viewStateKey: 'output-pane-2:content-2',
      content: {
        kind: 'independent-text',
        value: '{\n  "leaf": 1\n}',
      },
    });
    expect(withGrandchild.derivedPanes[1]?.content.documentId).toBe('output-pane-2:document-2');
    expect(getOutputPaneViewRange(withGrandchild.derivedPanes[1]!.content)).toBeNull();
    expect(withGrandchild.activePaneId).toBe('output-pane-2');
    expect(withGrandchild.leftVisiblePaneIndex).toBe(1);
  });

  it('trims descendants on upstream reselection and preserves identical child identity', () => {
    const recursiveChain = createRecursiveChain();

    const trimmed = openOrReplaceDerivedOutputPane(recursiveChain, 'output-root-pane', rootContent);
    expect(trimmed.derivedPanes).toHaveLength(1);
    expect(trimmed.derivedPanes[0]?.paneId).toBe('output-pane-1');
    expect(trimmed.derivedPanes[0]?.viewStateKey).toBe('output-pane-1:content-1');
    expect(trimmed.activePaneId).toBe('output-pane-1');
    expect(trimmed.leftVisiblePaneIndex).toBe(0);

    const replaced = openOrReplaceDerivedOutputPane(
      recursiveChain,
      'output-pane-1',
      replacementChildContent,
    );
    expect(replaced.derivedPanes).toHaveLength(2);
    expect(replaced.derivedPanes[1]).toMatchObject({
      parentPaneId: 'output-pane-1',
      paneId: 'output-pane-2',
      viewStateKey: 'output-pane-2:content-4',
      content: {
        kind: 'independent-text',
        value: '{\n  "leaf": 2\n}',
      },
    });
    expect(replaced.derivedPanes[1]?.content.documentId).toBe('output-pane-2:document-4');
    expect(replaced.activePaneId).toBe('output-pane-2');
    expect(replaced.leftVisiblePaneIndex).toBe(1);
  });

  it('explicitly invalidates pane descendants and normalizes active pane plus viewport', () => {
    const recursiveChain = createRecursiveChain();
    const invalidated = invalidateOutputPaneDescendants(recursiveChain, 'output-pane-1');

    expect(invalidated.derivedPanes).toHaveLength(1);
    expect(invalidated.derivedPanes[0]?.paneId).toBe('output-pane-1');
    expect(invalidated.activePaneId).toBe('output-pane-1');
    expect(invalidated.leftVisiblePaneIndex).toBe(0);

    const rootInvalidated = invalidateOutputPaneDescendants(recursiveChain, 'output-root-pane');
    expect(rootInvalidated.derivedPanes).toHaveLength(0);
    expect(rootInvalidated.activePaneId).toBe('output-root-pane');
    expect(rootInvalidated.leftVisiblePaneIndex).toBe(0);

    expect(invalidateOutputPaneDescendants(rootInvalidated, 'missing-pane')).toBe(rootInvalidated);
  });

  it('reports descendant pane ids, pops the rightmost pane, and navigates the snapped viewport', () => {
    const recursiveChain = createRecursiveChain();

    expect(getOutputPaneDescendantIds(recursiveChain, 'output-root-pane')).toEqual([
      'output-pane-1',
      'output-pane-2',
      'output-pane-3',
    ]);
    expect(getOutputPaneDescendantIds(recursiveChain, 'output-pane-1')).toEqual([
      'output-pane-2',
      'output-pane-3',
    ]);

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

  it('toggles extracted-source panes by parent slot instead of preserving identical child identity', () => {
    const rootState = createOutputPaneChainState();
    const opened = toggleExtractedSourceOutputPane(
      rootState,
      'output-root-pane',
      extractedSourceContent,
    );

    expect(opened.derivedPanes).toHaveLength(1);
    expect(opened.derivedPanes[0]).toMatchObject({
      paneId: 'output-pane-1',
      parentPaneId: 'output-root-pane',
      content: {
        kind: 'extracted-source',
        value: '{\n  "leaf": 1\n}',
        sourceRange: extractedSourceContent.sourceRange,
        lineNumberStart: 3,
      },
    });
    expect(getOutputPaneViewRange(opened.derivedPanes[0]!.content)).toBeNull();
    expect(opened.derivedPanes[0]?.content.documentId).toBe('output-pane-1:document-1');

    const withDescendant = openOrReplaceDerivedOutputPane(opened, 'output-pane-1', childContent);
    const closed = toggleExtractedSourceOutputPane(
      withDescendant,
      'output-root-pane',
      extractedSourceContent,
    );

    expect(closed.derivedPanes).toHaveLength(0);
    expect(closed.activePaneId).toBe('output-root-pane');
    expect(closed.leftVisiblePaneIndex).toBe(0);
  });
});
