import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefCallback, WheelEvent as ReactWheelEvent } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { OutputPaneSelection, OutputPaneSourceRange } from '../app/outputPaneDomain';
import { OutputEditor, type OutputEditorHandle } from './OutputEditor';

export type OutputPaneViewModel = {
  paneId: string;
  documentId: string;
  viewStateKey: string;
  value: string;
  viewRange: OutputPaneSourceRange | null;
  sourceHighlightRange: OutputPaneSourceRange | null;
  isSplitSelectionEnabled: boolean;
  testId: string;
};

type OutputPaneStripProps = {
  panes: OutputPaneViewModel[];
  leftVisiblePaneIndex: number;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  onPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onPaneFocus: (paneId: string) => void;
  onPaneSplitSelection: (paneId: string, selection: OutputPaneSelection) => void;
  onNavigatePaneViewport: (stepDelta: number) => void;
};

const SPLIT_WHEEL_STEP_THRESHOLD_PX = 96;
const PANE_STRIP_SCROLL_BEHAVIOR: ScrollBehavior = 'smooth';

const normalizeWheelDelta = (event: ReactWheelEvent<HTMLDivElement>): number => {
  const dominantDelta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
  if (dominantDelta === 0) {
    return 0;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return dominantDelta * 16;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return dominantDelta * event.currentTarget.clientWidth;
  }

  return dominantDelta;
};

export const OutputPaneStrip = ({
  panes,
  leftVisiblePaneIndex,
  themeMode,
  indentSize,
  onPaneHandleChange,
  onPaneFocus,
  onPaneSplitSelection,
  onNavigatePaneViewport,
}: OutputPaneStripProps) => {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaAccumulatorRef = useRef(0);
  const hasAppliedInitialViewportRef = useRef(false);
  const lastScrollTargetRef = useRef<number | null>(null);
  const isSplit = panes.length > 1;
  const paneWidth = isSplit ? '50%' : '100%';

  const syncViewportScroll = useCallback(
    (behavior: ScrollBehavior): void => {
      const stripElement = stripRef.current;
      if (!stripElement) {
        return;
      }

      const singlePaneWidth = isSplit ? stripElement.clientWidth / 2 : stripElement.clientWidth;
      if (singlePaneWidth <= 0) {
        return;
      }

      const targetScrollLeft = isSplit ? leftVisiblePaneIndex * singlePaneWidth : 0;
      if (
        lastScrollTargetRef.current === targetScrollLeft &&
        Math.abs(stripElement.scrollLeft - targetScrollLeft) < 1
      ) {
        return;
      }

      lastScrollTargetRef.current = targetScrollLeft;
      if (typeof stripElement.scrollTo === 'function') {
        stripElement.scrollTo({
          left: targetScrollLeft,
          behavior,
        });
        return;
      }

      stripElement.scrollLeft = targetScrollLeft;
    },
    [isSplit, leftVisiblePaneIndex],
  );

  useLayoutEffect(() => {
    syncViewportScroll(hasAppliedInitialViewportRef.current ? PANE_STRIP_SCROLL_BEHAVIOR : 'auto');
    hasAppliedInitialViewportRef.current = true;
  }, [syncViewportScroll]);

  useEffect(() => {
    const stripElement = stripRef.current;
    if (!stripElement) {
      return;
    }

    const handleResize = (): void => {
      syncViewportScroll('auto');
    };

    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(stripElement);
      return () => {
        resizeObserver.disconnect();
      };
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [syncViewportScroll]);

  useEffect(() => {
    wheelDeltaAccumulatorRef.current = 0;
  }, [leftVisiblePaneIndex, panes.length]);

  const createHandleRef = (paneId: string): RefCallback<OutputEditorHandle> => {
    return (handle) => {
      onPaneHandleChange(paneId, handle);
    };
  };

  const handleWheelCapture = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (!event.ctrlKey || !isSplit) {
      return;
    }

    const normalizedDelta = normalizeWheelDelta(event);
    if (normalizedDelta === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    wheelDeltaAccumulatorRef.current += normalizedDelta;
    const magnitude = Math.abs(wheelDeltaAccumulatorRef.current);
    if (magnitude < SPLIT_WHEEL_STEP_THRESHOLD_PX) {
      return;
    }

    const direction = Math.sign(wheelDeltaAccumulatorRef.current);
    const stepCount = Math.trunc(magnitude / SPLIT_WHEEL_STEP_THRESHOLD_PX);
    wheelDeltaAccumulatorRef.current -= direction * stepCount * SPLIT_WHEEL_STEP_THRESHOLD_PX;
    onNavigatePaneViewport(direction * stepCount);
  };

  return (
    <div
      className="output-pane-strip output-pane-strip-hide-scrollbar"
      data-overflowing={panes.length > 2 ? 'true' : 'false'}
      data-left-visible-pane-index={String(leftVisiblePaneIndex)}
      data-pane-count={String(panes.length)}
      data-testid="output-pane-strip"
      data-split={isSplit ? 'true' : 'false'}
      onWheelCapture={handleWheelCapture}
      ref={stripRef}
    >
      {panes.map((pane) => (
        <div
          className="output-pane-strip-item"
          data-testid={`output-pane-${pane.paneId}`}
          key={pane.paneId}
          style={{ flexBasis: paneWidth, width: paneWidth }}
        >
          <OutputEditor
            ref={createHandleRef(pane.paneId)}
            documentId={pane.documentId}
            highlightRange={pane.sourceHighlightRange}
            indentSize={indentSize}
            onFocus={() => onPaneFocus(pane.paneId)}
            onSplitSelection={
              pane.isSplitSelectionEnabled
                ? (selection) => onPaneSplitSelection(pane.paneId, selection)
                : undefined
            }
            testId={pane.testId}
            themeMode={themeMode}
            value={pane.value}
            viewRange={pane.viewRange}
            viewStateKey={pane.viewStateKey}
          />
        </div>
      ))}
    </div>
  );
};
