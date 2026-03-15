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
  it('returns the root pane by default and resets on output invalidation', () => {
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      paneId: 'output-root-pane',
      testId: 'output-editor',
    });
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);

    act(() => {
      ref.current?.getController().onOutputPaneSplitSelection('output-root-pane', {
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 2,
        },
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().hasDerivedOutputPane).toBe(false);
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
  });

  it('keeps the recursive derived-pane chain and exposes viewport navigation state', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText:
          '{\n  "root": true,\n  "nested": {\n    "leaf": {\n      "value": 1\n    }\n  }\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOutputPaneSplitSelection('output-root-pane', {
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 7,
          endColumn: 2,
        },
      });
      ref.current?.getController().onOutputPaneSplitSelection('output-pane-1', {
        sourceRange: {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(3);
    expect(ref.current?.getController().outputPanes.map((pane) => pane.testId)).toEqual([
      'output-editor',
      'output-editor-pane-1',
      'output-editor-pane-2',
    ]);
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(1);
    expect(ref.current?.getController().canNavigateOutputPaneLeft).toBe(true);
    expect(ref.current?.getController().canNavigateOutputPaneRight).toBe(false);

    act(() => {
      ref.current?.getController().onNavigateOutputPaneViewport(-1);
    });

    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
    expect(ref.current?.getController().canNavigateOutputPaneLeft).toBe(false);
    expect(ref.current?.getController().canNavigateOutputPaneRight).toBe(true);
  });

  it('routes active-pane lookup through the focused pane handle and focuses navigated panes', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText:
          '{\n  "root": true,\n  "nested": {\n    "leaf": {\n      "value": 1\n    }\n  }\n}',
        paneMode: 'output',
        ref,
      }),
    );

    const rootHandle = createOutputEditorHandle();
    const childHandle = createOutputEditorHandle();
    const grandchildHandle = createOutputEditorHandle();

    ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);

    act(() => {
      ref.current?.getController().onOutputPaneSplitSelection('output-root-pane', {
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 7,
          endColumn: 2,
        },
      });
    });

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-pane-1', childHandle);
    });

    expect(childHandle.focus).toHaveBeenCalledTimes(1);

    act(() => {
      ref.current?.getController().onOutputPaneSplitSelection('output-pane-1', {
        sourceRange: {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
      });
    });

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-pane-2', grandchildHandle);
    });

    expect(grandchildHandle.focus).toHaveBeenCalledTimes(1);
    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(grandchildHandle);

    act(() => {
      ref.current?.getController().onNavigateOutputPaneViewport(-1);
    });

    expect(rootHandle.focus).toHaveBeenCalledTimes(1);
    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(rootHandle);

    act(() => {
      ref.current?.getController().onOutputPaneFocus('output-root-pane');
    });

    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(rootHandle);
  });
});
