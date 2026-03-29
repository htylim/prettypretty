import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { OutputPaneStrip } from '../../../../src/renderer/components/OutputPaneStrip';

const focusMocksByTestId = new Map<string, ReturnType<typeof vi.fn>>();
let nextAnimationFrameId = 1;
const animationFrameCallbacks = new Map<number, FrameRequestCallback>();

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get() {
    return 600;
  },
});

const flushAnimationFrames = (timestamp = 16): void => {
  const callbacks = [...animationFrameCallbacks.values()];
  animationFrameCallbacks.clear();
  for (const callback of callbacks) {
    callback(timestamp);
  }
};

const readTrackOffsetPx = (): number => {
  const track = screen.getByTestId('output-pane-strip-track');
  const transformMatch = track.getAttribute('style')?.match(/translate3d\((-?\d+(?:\.\d+)?)px/u);
  if (!transformMatch?.[1]) {
    return 0;
  }

  return Math.abs(Number(transformMatch[1]));
};

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const animationFrameId = nextAnimationFrameId++;
    animationFrameCallbacks.set(animationFrameId, callback);
    return animationFrameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (animationFrameId: number) => {
    animationFrameCallbacks.delete(animationFrameId);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
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
          onContextMenu?: (request: unknown) => void;
        },
        ref: React.ForwardedRef<unknown>,
      ) => {
        const testId = props.testId ?? 'output-editor';
        const focusMockRef = React.useRef<ReturnType<typeof vi.fn> | null>(
          focusMocksByTestId.get(testId) ?? vi.fn(),
        );
        React.useImperativeHandle(ref, () => ({
          collapseAll: vi.fn(),
          expandAll: vi.fn(),
          focus: focusMockRef.current ?? vi.fn(),
          openFind: vi.fn(),
        }));
        React.useEffect(() => {
          if (focusMockRef.current) {
            focusMocksByTestId.set(testId, focusMockRef.current);
          }
          return () => {
            focusMocksByTestId.delete(testId);
          };
        }, [testId]);
        return React.createElement(
          'div',
          {
            'data-testid': testId,
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
      testId: 'output-editor',
    },
  ] as const;

describe('OutputPaneStrip', () => {
  const paneItemPattern = /^output-pane-(?!strip)/u;

  beforeEach(() => {
    focusMocksByTestId.clear();
    animationFrameCallbacks.clear();
  });

  it('renders a single full-width root output pane', () => {
    render(
      <OutputPaneStrip
        activePaneId="output-root-pane"
        focusRequest={null}
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={vi.fn()}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
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
    expect(screen.getByTestId('output-pane-strip-track')).toHaveStyle({
      gridAutoColumns: '100%',
    });
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(1);
    expect(screen.getByTestId('output-editor')).toHaveTextContent('"root": true');
  });

  it('renders split panes at a fixed 50/50 width and keeps every pane mounted', () => {
    render(
      <OutputPaneStrip
        activePaneId="output-pane-2"
        focusRequest={null}
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={vi.fn()}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
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
    expect(screen.getByTestId('output-pane-strip-track')).toHaveStyle({
      gridAutoColumns: '50%',
    });
    expect(screen.getAllByTestId(paneItemPattern)).toHaveLength(3);
    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-start', '3');
    expect(screen.getByTestId('output-editor-pane-2')).toHaveAttribute('data-view-start', '7');
  });

  it('renders independent pane content without a shared source-range view filter', () => {
    render(
      <OutputPaneStrip
        activePaneId="output-pane-1"
        focusRequest={null}
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={vi.fn()}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
        panes={[
          ...createPanes(),
          {
            paneId: 'output-pane-1',
            documentId: 'output-pane-1:document-1',
            viewStateKey: 'output-pane-1:content-1',
            value: '{\n  "pretty": true\n}',
            viewRange: null,
            testId: 'output-editor-pane-1',
          },
        ]}
        themeMode="dark"
      />,
    );

    expect(screen.getByTestId('output-editor-pane-1')).toHaveTextContent('"pretty": true');
    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-start', '');
    expect(screen.getByTestId('output-editor-pane-1')).toHaveAttribute('data-view-end', '');
  });

  it('controls the viewport target from the pane index and supports ctrl-wheel navigation', () => {
    const onNavigatePaneViewport = vi.fn();
    const { rerender } = render(
      <OutputPaneStrip
        activePaneId="output-root-pane"
        focusRequest={null}
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={onNavigatePaneViewport}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
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
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="light"
      />,
    );

    expect(readTrackOffsetPx()).toBe(0);

    rerender(
      <OutputPaneStrip
        activePaneId="output-pane-2"
        focusRequest={null}
        indentSize={2}
        leftVisiblePaneIndex={1}
        onNavigatePaneViewport={onNavigatePaneViewport}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
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
            testId: 'output-editor-pane-2',
          },
        ]}
        themeMode="light"
      />,
    );

    expect(readTrackOffsetPx()).toBe(0);

    act(() => {
      flushAnimationFrames(0);
    });
    expect(readTrackOffsetPx()).toBe(300);

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

  it('waits for the pane strip to reach the requested viewport before focusing the target pane', () => {
    const panes = [
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
        testId: 'output-editor-pane-2',
      },
    ] as const;
    const { rerender } = render(
      <OutputPaneStrip
        activePaneId="output-pane-1"
        focusRequest={null}
        indentSize={2}
        leftVisiblePaneIndex={0}
        onNavigatePaneViewport={vi.fn()}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
        panes={[...panes]}
        themeMode="light"
      />,
    );

    expect(readTrackOffsetPx()).toBe(0);
    expect(focusMocksByTestId.get('output-editor-pane-2')).toHaveBeenCalledTimes(0);

    rerender(
      <OutputPaneStrip
        activePaneId="output-pane-2"
        focusRequest={{ paneId: 'output-pane-2', sequence: 1 }}
        indentSize={2}
        leftVisiblePaneIndex={1}
        onNavigatePaneViewport={vi.fn()}
        onPaneFocus={vi.fn()}
        onPaneContextMenu={vi.fn()}
        onPaneHandleChange={vi.fn()}
        panes={[...panes]}
        themeMode="light"
      />,
    );

    expect(readTrackOffsetPx()).toBe(0);
    expect(focusMocksByTestId.get('output-editor-pane-2')).toHaveBeenCalledTimes(0);

    act(() => {
      flushAnimationFrames(0);
    });
    expect(focusMocksByTestId.get('output-editor-pane-2')).toHaveBeenCalledTimes(0);

    act(() => {
      fireEvent.transitionEnd(screen.getByTestId('output-pane-strip-track'), {
        propertyName: 'transform',
      });
      flushAnimationFrames(16);
    });
    expect(readTrackOffsetPx()).toBe(300);
    expect(focusMocksByTestId.get('output-editor-pane-2')).toHaveBeenCalledTimes(1);
  });
});
