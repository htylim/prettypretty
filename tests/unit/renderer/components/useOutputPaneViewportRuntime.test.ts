import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';
import type { OutputPaneFocusRequest } from '../../../../src/renderer/components/outputPaneTypes';
import { useOutputPaneViewportRuntime } from '../../../../src/renderer/components/useOutputPaneViewportRuntime';

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

const createOutputEditorHandle = (testId: string): OutputEditorHandle => ({
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  focus: (focusMocksByTestId.get(testId) ?? vi.fn()) as () => void,
  openFind: vi.fn(),
  captureViewportSnapshot: vi.fn().mockReturnValue(null),
  restoreViewportSnapshot: vi.fn(),
});

const MockPane = forwardRef<OutputEditorHandle, { paneId: string; testId: string }>(
  ({ paneId, testId }, ref) => {
    useImperativeHandle(ref, () => createOutputEditorHandle(testId), [testId]);

    return createElement('div', { 'data-pane-id': paneId, 'data-testid': testId });
  },
);

MockPane.displayName = 'MockPane';

type HarnessProps = {
  paneCount: number;
  focusRequest: OutputPaneFocusRequest | null;
  leftVisiblePaneIndex: number;
  onNavigatePaneViewport: (stepDelta: number) => void;
  panes: Array<{ paneId: string; testId: string }>;
};

const ViewportHarness = forwardRef<unknown, HarnessProps>(
  ({ paneCount, focusRequest, leftVisiblePaneIndex, onNavigatePaneViewport, panes }, ref) => {
    const runtime = useOutputPaneViewportRuntime({
      paneCount,
      focusRequest,
      leftVisiblePaneIndex,
      onPaneHandleChange: vi.fn(),
      onNavigatePaneViewport,
    });

    useImperativeHandle(ref, () => runtime, [runtime]);

    return createElement(
      'div',
      {
        'data-testid': 'output-pane-strip',
        onWheelCapture: runtime.handleWheelCapture,
        ref: runtime.stripRef,
      },
      createElement(
        'div',
        {
          'data-testid': 'output-pane-strip-track',
          ref: runtime.trackRef,
        },
        panes.map((pane) =>
          createElement(MockPane, {
            key: pane.paneId,
            paneId: pane.paneId,
            ref: runtime.createPaneHandleRef(pane.paneId),
            testId: pane.testId,
          }),
        ),
      ),
    );
  },
);

ViewportHarness.displayName = 'ViewportHarness';

describe('useOutputPaneViewportRuntime', () => {
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

  beforeEach(() => {
    focusMocksByTestId.clear();
    animationFrameCallbacks.clear();
  });

  it('syncs viewport offsets and turns ctrl-wheel input into navigation steps', () => {
    const onNavigatePaneViewport = vi.fn();
    const { rerender } = render(
      createElement(ViewportHarness, {
        paneCount: 3,
        focusRequest: null,
        leftVisiblePaneIndex: 0,
        onNavigatePaneViewport,
        panes: [
          { paneId: 'output-root-pane', testId: 'output-editor' },
          { paneId: 'output-pane-1', testId: 'output-pane-1' },
          { paneId: 'output-pane-2', testId: 'output-pane-2' },
        ],
      }),
    );

    expect(readTrackOffsetPx()).toBe(0);

    rerender(
      createElement(ViewportHarness, {
        paneCount: 3,
        focusRequest: null,
        leftVisiblePaneIndex: 1,
        onNavigatePaneViewport,
        panes: [
          { paneId: 'output-root-pane', testId: 'output-editor' },
          { paneId: 'output-pane-1', testId: 'output-pane-1' },
          { paneId: 'output-pane-2', testId: 'output-pane-2' },
        ],
      }),
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

  it('waits for viewport alignment before focusing the requested pane', () => {
    const focusPane2 = vi.fn();
    focusMocksByTestId.set('output-pane-2', focusPane2);
    const panes = [
      { paneId: 'output-root-pane', testId: 'output-editor' },
      { paneId: 'output-pane-1', testId: 'output-pane-1' },
      { paneId: 'output-pane-2', testId: 'output-pane-2' },
    ];
    const { rerender } = render(
      createElement(ViewportHarness, {
        paneCount: 3,
        focusRequest: null,
        leftVisiblePaneIndex: 0,
        onNavigatePaneViewport: vi.fn(),
        panes,
      }),
    );

    expect(readTrackOffsetPx()).toBe(0);
    expect(focusPane2).toHaveBeenCalledTimes(0);

    rerender(
      createElement(ViewportHarness, {
        paneCount: 3,
        focusRequest: {
          paneId: 'output-pane-2',
          sequence: 1,
        },
        leftVisiblePaneIndex: 1,
        onNavigatePaneViewport: vi.fn(),
        panes,
      }),
    );

    expect(readTrackOffsetPx()).toBe(0);
    expect(focusPane2).toHaveBeenCalledTimes(0);

    act(() => {
      flushAnimationFrames(0);
    });
    expect(focusPane2).toHaveBeenCalledTimes(0);

    act(() => {
      fireEvent.transitionEnd(screen.getByTestId('output-pane-strip-track'), {
        propertyName: 'transform',
      });
      flushAnimationFrames(16);
    });
    expect(readTrackOffsetPx()).toBe(300);
    expect(focusPane2).toHaveBeenCalledTimes(1);
  });
});
