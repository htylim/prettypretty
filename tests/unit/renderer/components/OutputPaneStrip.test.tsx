import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutputPaneStrip } from '../../../../src/renderer/components/OutputPaneStrip';

vi.mock('../../../../src/renderer/components/OutputEditor', async () => {
  const React = await import('react');

  return {
    OutputEditor: React.forwardRef(
      (
        props: {
          testId?: string;
          value: string;
          viewRange?: { startLineNumber: number; endLineNumber: number } | null;
        },
        ref: React.ForwardedRef<unknown>,
      ) => {
        void ref;
        return React.createElement(
          'div',
          {
            'data-testid': props.testId,
            'data-view-start': props.viewRange?.startLineNumber ?? '',
            'data-view-end': props.viewRange?.endLineNumber ?? '',
          },
          props.value,
        );
      },
    ),
  };
});

const createPanes = () =>
  [
    {
      paneId: 'output-root-pane',
      documentId: 'root-doc',
      viewStateKey: 'output-root-pane:root-doc',
      value: '{\n  "root": true\n}',
      viewRange: null,
      sourceHighlightRange: null,
      isSplitSelectionEnabled: true,
      testId: 'output-editor',
    },
  ] as const;

describe('OutputPaneStrip', () => {
  const paneItemPattern = /^output-pane-(?!strip)/u;

  it('renders a single full-width root output pane', () => {
    render(
      <OutputPaneStrip
        indentSize={2}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[...createPanes()]}
        themeMode="light"
      />,
    );

    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-split', 'false');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-pane-count', '1');
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(1);
    expect(screen.getByTestId('output-pane-output-root-pane')).toHaveStyle({ flexBasis: '100%' });
    expect(screen.getByTestId('output-editor')).toHaveTextContent('"root": true');
  });

  it('renders a two-pane 50/50 split when a derived pane is present', () => {
    render(
      <OutputPaneStrip
        indentSize={2}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[
          ...createPanes(),
          {
            paneId: 'output-pane-1',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-1:selection-1',
            value: '{\n  "root": true,\n  "leaf": 1\n}',
            viewRange: {
              startLineNumber: 3,
              startColumn: 1,
              endLineNumber: 5,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: false,
            testId: 'output-editor-pane-1',
          },
        ]}
        themeMode="dark"
      />,
    );

    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-split', 'true');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-pane-count', '2');
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(2);
    expect(screen.getByTestId('output-pane-output-root-pane')).toHaveStyle({ flexBasis: '50%' });
    expect(screen.getByTestId('output-pane-output-pane-1')).toHaveStyle({ flexBasis: '50%' });
    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-start', '3');
    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-end', '5');
  });

  it('keeps every derived pane mounted in the horizontal strip and removes them cleanly', () => {
    const { rerender } = render(
      <OutputPaneStrip
        indentSize={2}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[
          ...createPanes(),
          {
            paneId: 'output-pane-1',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-1:selection-1',
            value: '{\n  "root": true,\n  "leaf": 1\n}',
            viewRange: {
              startLineNumber: 3,
              startColumn: 1,
              endLineNumber: 5,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: false,
            testId: 'output-editor-pane-1',
          },
          {
            paneId: 'output-pane-2',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-2:selection-1',
            value: '{\n  "root": true,\n  "grandchild": true\n}',
            viewRange: {
              startLineNumber: 7,
              startColumn: 1,
              endLineNumber: 9,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: false,
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="light"
      />,
    );

    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-start', '3');
    expect(screen.getByTestId('output-editor-pane-2')).toHaveAttribute('data-view-start', '7');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-overflowing', 'true');

    rerender(
      <OutputPaneStrip
        indentSize={2}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[
          ...createPanes(),
          {
            paneId: 'output-pane-1',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-1:selection-2',
            value: '{\n  "root": true,\n  "replacement": true\n}',
            viewRange: {
              startLineNumber: 7,
              startColumn: 1,
              endLineNumber: 9,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: false,
            testId: 'output-editor-pane-1',
          },
          {
            paneId: 'output-pane-2',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-2:selection-2',
            value: '{\n  "root": true,\n  "grandchild-replacement": true\n}',
            viewRange: {
              startLineNumber: 11,
              startColumn: 1,
              endLineNumber: 13,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: false,
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="light"
      />,
    );

    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-start', '7');
    expect(screen.getByTestId('output-editor-pane-2')).toHaveAttribute('data-view-start', '11');

    rerender(
      <OutputPaneStrip
        indentSize={2}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[...createPanes()]}
        themeMode="light"
      />,
    );

    expect(screen.queryByTestId('output-editor-pane-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('output-editor-pane-2')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(1);
  });
});
