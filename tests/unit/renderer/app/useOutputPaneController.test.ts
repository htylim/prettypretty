import { act, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { describe, expect, it } from 'vitest';
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
  collapseAll: () => undefined,
  expandAll: () => undefined,
  openFind: () => undefined,
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
  });

  it('keeps the full derived-pane chain instead of truncating after one child', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true,\n  "nested": {\n    "leaf": 1\n  }\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOutputPaneSplitSelection('output-root-pane', {
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 2,
        },
      });
      ref.current?.getController().onOutputPaneSplitSelection('output-pane-1', {
        sourceRange: {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 4,
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
  });

  it('routes active-pane lookup through the focused pane handle', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
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
          endLineNumber: 4,
          endColumn: 2,
        },
      });
      ref.current?.getController().onOutputPaneHandleChange('output-pane-1', childHandle);
      ref.current?.getController().onOutputPaneSplitSelection('output-pane-1', {
        sourceRange: {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 2,
        },
      });
      ref.current?.getController().onOutputPaneHandleChange('output-pane-2', grandchildHandle);
    });

    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(grandchildHandle);

    act(() => {
      ref.current?.getController().onOutputPaneFocus('output-pane-1');
    });

    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(childHandle);
  });
});
