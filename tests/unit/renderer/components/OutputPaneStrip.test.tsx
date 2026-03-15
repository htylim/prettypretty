import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OutputPaneStrip } from '../../../../src/renderer/components/OutputPaneStrip';

const scrollToMock = vi.fn(function scrollTo(
  this: HTMLElement,
  options: ScrollToOptions | number,
): void {
  this.scrollLeft = typeof options === 'number' ? options : (options.left ?? 0);
});

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return 600;
  },
});

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: scrollToMock,
});

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

  beforeEach(() => {
    scrollToMock.mockClear();
  });

  it('renders a single full-width root output pane', () => {
    render(
      <OutputPaneStrip
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={vi.fn()}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[...createPanes()]}
        themeMode="light"
      />,
    );

    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-split', 'false');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-pane-count', '1');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute(
      'data-left-visible-pane-index',
      '0',
    );
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(1);
    expect(screen.getByTestId('output-pane-output-root-pane')).toHaveStyle({ flexBasis: '100%' });
    expect(screen.getByTestId('output-editor')).toHaveTextContent('"root": true');
  });

  it('renders split panes at a fixed 50/50 width and keeps every pane mounted', () => {
    render(
      <OutputPaneStrip
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={vi.fn()}
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
            isSplitSelectionEnabled: true,
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
            isSplitSelectionEnabled: true,
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="dark"
      />,
    );

    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-split', 'true');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-pane-count', '3');
    expect(screen.getByTestId('output-pane-strip')).toHaveAttribute('data-overflowing', 'true');
    expect(screen.getByTestId('output-pane-strip').className).toMatch(
      /\boutput-pane-strip-hide-scrollbar\b/u,
    );
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(3);
    expect(screen.getByTestId('output-pane-output-root-pane')).toHaveStyle({ flexBasis: '50%' });
    expect(screen.getByTestId('output-pane-output-pane-1')).toHaveStyle({ flexBasis: '50%' });
    expect(screen.getByTestId('output-pane-output-pane-2')).toHaveStyle({ flexBasis: '50%' });
    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-start', '3');
    expect(screen.getByTestId('output-editor-pane-2')).toHaveAttribute('data-view-start', '7');
  });

  it('controls the scroll target from the viewport index and supports ctrl-wheel navigation', () => {
    const onNavigatePaneViewport = vi.fn();
    const { rerender } = render(
      <OutputPaneStrip
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={onNavigatePaneViewport}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[
          ...createPanes(),
          {
            paneId: 'output-pane-1',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-1:selection-1',
            value: '{\n  "first": true\n}',
            viewRange: {
              startLineNumber: 2,
              startColumn: 1,
              endLineNumber: 4,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: true,
            testId: 'output-editor-pane-1',
          },
          {
            paneId: 'output-pane-2',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-2:selection-1',
            value: '{\n  "second": true\n}',
            viewRange: {
              startLineNumber: 5,
              startColumn: 1,
              endLineNumber: 7,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: true,
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="light"
      />,
    );

    expect(scrollToMock).toHaveBeenLastCalledWith({
      behavior: 'auto',
      left: 0,
    });

    rerender(
      <OutputPaneStrip
        indentSize={2}
        leftVisiblePaneIndex={1}
        onNavigatePaneViewport={onNavigatePaneViewport}
        onPaneFocus={vi.fn()}
        onPaneHandleChange={vi.fn()}
        onPaneSplitSelection={vi.fn()}
        panes={[
          ...createPanes(),
          {
            paneId: 'output-pane-1',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-1:selection-1',
            value: '{\n  "first": true\n}',
            viewRange: {
              startLineNumber: 2,
              startColumn: 1,
              endLineNumber: 4,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: true,
            testId: 'output-editor-pane-1',
          },
          {
            paneId: 'output-pane-2',
            documentId: 'root-doc',
            viewStateKey: 'output-pane-2:selection-1',
            value: '{\n  "second": true\n}',
            viewRange: {
              startLineNumber: 5,
              startColumn: 1,
              endLineNumber: 7,
              endColumn: 2,
            },
            sourceHighlightRange: null,
            isSplitSelectionEnabled: true,
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="light"
      />,
    );

    expect(scrollToMock).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      left: 300,
    });

    fireEvent.wheel(screen.getByTestId('output-pane-strip'), {
      ctrlKey: true,
      deltaY: 110,
    });
    expect(onNavigatePaneViewport).toHaveBeenCalledWith(1);

    fireEvent.wheel(screen.getByTestId('output-pane-strip'), {
      ctrlKey: true,
      deltaX: -210,
    });
    expect(onNavigatePaneViewport).toHaveBeenLastCalledWith(-2);
  });
});
