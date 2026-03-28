import { act, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';
import { useOutputPaneController } from '../../../../src/renderer/app/useOutputPaneController';

type HarnessHandle = {
  getController: () => ReturnType<typeof useOutputPaneController>;
};

type HarnessProps = {
  outputText: string;
  paneMode: 'input' | 'output';
};

const OutputPaneHarness = forwardRef<HarnessHandle, HarnessProps>((props, ref) => {
  const controller = useOutputPaneController(props);

  useImperativeHandle(
    ref,
    () => ({
      getController: () => controller,
    }),
    [controller],
  );

  return null;
});

OutputPaneHarness.displayName = 'OutputPaneHarness';

const createOutputEditorHandle = (): OutputEditorHandle => ({
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  focus: vi.fn(),
  openFind: vi.fn(),
});

describe('useOutputPaneController', () => {
  it('returns the root pane by default and never opens panes from embedded highlights', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": "{\\"nested\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      paneId: 'output-root-pane',
      testId: 'output-editor',
      embeddedCandidate: null,
    });
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);

    act(() => {
      ref.current?.getController().onOutputPaneEmbeddedCandidateChange('output-root-pane', {
        payload: '{"nested":true}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 11,
          endLineNumber: 2,
          endColumn: 31,
        },
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[0]?.embeddedCandidate).toMatchObject({
      sourceRange: {
        startLineNumber: 2,
        startColumn: 11,
        endLineNumber: 2,
        endColumn: 31,
      },
    });
    expect(ref.current?.getController().activeOutputEmbeddedCandidate?.payload).toBe(
      '{"nested":true}',
    );
    expect(ref.current?.getController().hasDerivedOutputPane).toBe(false);
  });

  it('opens independent output panes and resets stale candidate state for replaced children', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": "{\\"nested\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      documentId: 'output-pane-1:document-1',
      value: '{\n  "nested": true\n}',
      viewRange: null,
      testId: 'output-editor-pane-1',
    });
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-pane-1');
    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-pane-1',
      sequence: 1,
    });

    act(() => {
      ref.current?.getController().onOutputPaneEmbeddedCandidateChange('output-pane-1', {
        payload: '{"leaf":true}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 3,
          endLineNumber: 2,
          endColumn: 17,
        },
      });
      ref.current?.getController().onOpenOutputPane('output-pane-1', {
        kind: 'independent-text',
        value: '{\n  "leaf": true\n}',
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(3);
    expect(ref.current?.getController().outputPanes[2]).toMatchObject({
      paneId: 'output-pane-2',
      documentId: 'output-pane-2:document-2',
      value: '{\n  "leaf": true\n}',
      viewRange: null,
    });

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "replacement": true\n}',
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      documentId: 'output-pane-1:document-3',
      value: '{\n  "replacement": true\n}',
      viewRange: null,
      embeddedCandidate: null,
    });
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-pane-1');
    expect(ref.current?.getController().activeOutputEmbeddedCandidate).toBeNull();
  });

  it('explicitly invalidates descendant panes when an upstream pane changes', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": "{\\"nested\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": "{\\"leaf\\":true}"\n}',
      });
      ref.current?.getController().onOpenOutputPane('output-pane-1', {
        kind: 'independent-text',
        value: '{\n  "leaf": true\n}',
      });
      ref.current?.getController().onOutputPaneEmbeddedCandidateChange('output-pane-2', {
        payload: '{"leaf":true}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 3,
          endLineNumber: 2,
          endColumn: 17,
        },
      });
      ref.current?.getController().onNavigateOutputPaneViewport(-1);
    });

    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-root-pane');

    act(() => {
      ref.current?.getController().onInvalidateOutputPaneDescendants('output-pane-1');
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "nested": "{\\"leaf\\":true}"\n}',
    });
    expect(ref.current?.getController().activeOutputEmbeddedCandidate).toBeNull();
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-root-pane');
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-root-pane',
      sequence: 4,
    });
  });

  it('clears embedded highlight state on output invalidation and when leaving output mode', () => {
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": "{\\"nested\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOutputPaneEmbeddedCandidateChange('output-root-pane', {
        payload: '{"nested":true}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 11,
          endLineNumber: 2,
          endColumn: 31,
        },
      });
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
    });

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": "{\\"next\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[0]?.embeddedCandidate).toBeNull();
    expect(ref.current?.getController().activeOutputEmbeddedCandidate).toBeNull();

    act(() => {
      ref.current?.getController().onOutputPaneEmbeddedCandidateChange('output-root-pane', {
        payload: '{"next":true}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 14,
          endLineNumber: 2,
          endColumn: 31,
        },
      });
    });

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": "{\\"next\\":true}"\n}',
        paneMode: 'input',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes[0]?.embeddedCandidate).toBeNull();
    expect(ref.current?.getController().activeOutputEmbeddedCandidate).toBeNull();

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": "{\\"next\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes[0]?.embeddedCandidate).toBeNull();
    expect(ref.current?.getController().activeOutputEmbeddedCandidate).toBeNull();
  });

  it('routes active-pane lookup through the focused pane handle and emits focus requests for pane opens', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": "{\\"nested\\":true}"\n}',
        paneMode: 'output',
        ref,
      }),
    );

    const rootHandle = createOutputEditorHandle();
    const childHandle = createOutputEditorHandle();
    const grandchildHandle = createOutputEditorHandle();

    ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
    });

    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-pane-1',
      sequence: 1,
    });

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-pane-1', childHandle);
      ref.current?.getController().onOpenOutputPane('output-pane-1', {
        kind: 'independent-text',
        value: '{\n  "leaf": true\n}',
      });
    });

    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-pane-2',
      sequence: 2,
    });

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-pane-2', grandchildHandle);
    });

    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(grandchildHandle);

    act(() => {
      ref.current?.getController().onNavigateOutputPaneViewport(-1);
    });

    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-root-pane',
      sequence: 3,
    });
    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(rootHandle);
    expect(rootHandle.focus).not.toHaveBeenCalled();
    expect(childHandle.focus).not.toHaveBeenCalled();
    expect(grandchildHandle.focus).not.toHaveBeenCalled();
  });
});
