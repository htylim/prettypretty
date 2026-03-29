import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefCallback, RefObject, WheelEvent as ReactWheelEvent } from 'react';
import type { OutputEditorHandle } from './OutputEditor';
import type { OutputPaneFocusRequest } from './outputPaneTypes';

type UseOutputPaneViewportRuntimeOptions = {
  paneCount: number;
  focusRequest: OutputPaneFocusRequest | null;
  leftVisiblePaneIndex: number;
  onPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onNavigatePaneViewport: (stepDelta: number) => void;
};

type UseOutputPaneViewportRuntimeResult = {
  stripRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
  createPaneHandleRef: (paneId: string) => RefCallback<OutputEditorHandle>;
  handleWheelCapture: (event: ReactWheelEvent<HTMLDivElement>) => void;
};

const SPLIT_WHEEL_STEP_THRESHOLD_PX = 96;
const PANE_STRIP_SCROLL_BEHAVIOR: ScrollBehavior = 'smooth';
const PANE_STRIP_SCROLL_DURATION_MS = 220;
const PANE_STRIP_FOCUS_WAIT_TIMEOUT_MS = 500;

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

const getSinglePaneWidth = (stripElement: HTMLDivElement, paneCount: number): number | null => {
  const isSplit = paneCount > 1;
  const singlePaneWidth = isSplit ? stripElement.clientWidth / 2 : stripElement.clientWidth;
  return singlePaneWidth > 0 ? singlePaneWidth : null;
};

export const useOutputPaneViewportRuntime = ({
  paneCount,
  focusRequest,
  leftVisiblePaneIndex,
  onPaneHandleChange,
  onNavigatePaneViewport,
}: UseOutputPaneViewportRuntimeOptions): UseOutputPaneViewportRuntimeResult => {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const paneHandlesRef = useRef(new Map<string, OutputEditorHandle>());
  const wheelDeltaAccumulatorRef = useRef(0);
  const hasAppliedInitialViewportRef = useRef(false);
  const currentViewportOffsetRef = useRef(0);
  const lastViewportTargetRef = useRef<number | null>(null);
  const pendingViewportTransitionFrameRef = useRef<number | null>(null);
  const isViewportTransitioningRef = useRef(false);
  const pendingFocusAnimationFrameRef = useRef<number | null>(null);
  const pendingFocusWaitStartedAtRef = useRef<number>(0);
  const isSplit = paneCount > 1;
  const currentScopeKey = `${paneCount}:${leftVisiblePaneIndex}`;

  const applyViewportOffset = useCallback((offsetPx: number): void => {
    currentViewportOffsetRef.current = offsetPx;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-offsetPx}px, 0px, 0px)`;
    }
  }, []);

  const getTargetViewportOffset = useCallback((): number | null => {
    const stripElement = stripRef.current;
    if (!stripElement) {
      return null;
    }

    const singlePaneWidth = getSinglePaneWidth(stripElement, paneCount);
    if (singlePaneWidth === null) {
      return null;
    }

    return isSplit ? leftVisiblePaneIndex * singlePaneWidth : 0;
  }, [isSplit, leftVisiblePaneIndex, paneCount]);

  const syncViewportScroll = useCallback(
    (behavior: ScrollBehavior): void => {
      const targetViewportOffset = getTargetViewportOffset();
      if (targetViewportOffset === null) {
        return;
      }

      if (
        lastViewportTargetRef.current === targetViewportOffset &&
        Math.abs(currentViewportOffsetRef.current - targetViewportOffset) < 1
      ) {
        return;
      }

      lastViewportTargetRef.current = targetViewportOffset;
      if (behavior !== PANE_STRIP_SCROLL_BEHAVIOR) {
        if (pendingViewportTransitionFrameRef.current !== null) {
          window.cancelAnimationFrame(pendingViewportTransitionFrameRef.current);
          pendingViewportTransitionFrameRef.current = null;
        }
        isViewportTransitioningRef.current = false;
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
        }
        applyViewportOffset(targetViewportOffset);
        return;
      }

      if (pendingViewportTransitionFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingViewportTransitionFrameRef.current);
        pendingViewportTransitionFrameRef.current = null;
      }
      const trackElement = trackRef.current;
      if (!trackElement) {
        return;
      }

      if (Math.abs(currentViewportOffsetRef.current - targetViewportOffset) < 1) {
        isViewportTransitioningRef.current = false;
        trackElement.style.transition = 'none';
        applyViewportOffset(targetViewportOffset);
        return;
      }

      isViewportTransitioningRef.current = true;
      trackElement.style.transition = 'none';
      applyViewportOffset(currentViewportOffsetRef.current);
      void trackElement.offsetWidth;
      trackElement.style.transition = `transform ${PANE_STRIP_SCROLL_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      pendingViewportTransitionFrameRef.current = window.requestAnimationFrame(() => {
        applyViewportOffset(targetViewportOffset);
        pendingViewportTransitionFrameRef.current = null;
      });
    },
    [applyViewportOffset, getTargetViewportOffset],
  );

  useLayoutEffect(() => {
    if (hasAppliedInitialViewportRef.current) {
      return;
    }

    syncViewportScroll('auto');
    hasAppliedInitialViewportRef.current = true;
  }, [syncViewportScroll]);

  useEffect(() => {
    if (!hasAppliedInitialViewportRef.current) {
      return;
    }

    syncViewportScroll(PANE_STRIP_SCROLL_BEHAVIOR);
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
  }, [currentScopeKey]);

  const clearPendingFocusWait = useCallback((): void => {
    if (pendingFocusAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingFocusAnimationFrameRef.current);
      pendingFocusAnimationFrameRef.current = null;
    }
  }, []);

  const focusPane = useCallback((paneId: string): boolean => {
    const handle = paneHandlesRef.current.get(paneId);
    if (!handle) {
      return false;
    }

    handle.focus();
    return true;
  }, []);

  useEffect(() => {
    const trackElement = trackRef.current;
    if (!trackElement) {
      return;
    }

    const handleTransitionFinish = (event: TransitionEvent): void => {
      if (event.propertyName !== 'transform') {
        return;
      }

      isViewportTransitioningRef.current = false;
    };

    trackElement.addEventListener('transitionend', handleTransitionFinish);
    trackElement.addEventListener('transitioncancel', handleTransitionFinish);
    return () => {
      trackElement.removeEventListener('transitionend', handleTransitionFinish);
      trackElement.removeEventListener('transitioncancel', handleTransitionFinish);
    };
  }, [paneCount]);

  useEffect(() => {
    const trackElement = trackRef.current;
    return () => {
      if (pendingViewportTransitionFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingViewportTransitionFrameRef.current);
        pendingViewportTransitionFrameRef.current = null;
      }
      isViewportTransitioningRef.current = false;
      if (trackElement) {
        trackElement.style.transition = 'none';
      }
      clearPendingFocusWait();
    };
  }, [clearPendingFocusWait]);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    clearPendingFocusWait();

    const targetViewportOffset = getTargetViewportOffset();
    if (targetViewportOffset === null) {
      focusPane(focusRequest.paneId);
      return;
    }

    if (Math.abs(currentViewportOffsetRef.current - targetViewportOffset) < 1) {
      focusPane(focusRequest.paneId);
      return;
    }

    pendingFocusWaitStartedAtRef.current = performance.now();
    const waitForViewportAlignment = (): void => {
      const currentStripElement = stripRef.current;
      if (!currentStripElement) {
        pendingFocusAnimationFrameRef.current = null;
        return;
      }

      const elapsedMs = performance.now() - pendingFocusWaitStartedAtRef.current;
      const isAligned = !isViewportTransitioningRef.current;
      if (isAligned || elapsedMs >= PANE_STRIP_FOCUS_WAIT_TIMEOUT_MS) {
        pendingFocusAnimationFrameRef.current = null;
        focusPane(focusRequest.paneId);
        return;
      }

      pendingFocusAnimationFrameRef.current =
        window.requestAnimationFrame(waitForViewportAlignment);
    };

    pendingFocusAnimationFrameRef.current = window.requestAnimationFrame(waitForViewportAlignment);
    return () => {
      clearPendingFocusWait();
    };
  }, [clearPendingFocusWait, focusPane, focusRequest, getTargetViewportOffset]);

  const createPaneHandleRef = useCallback(
    (paneId: string): RefCallback<OutputEditorHandle> => {
      return (handle) => {
        if (handle) {
          paneHandlesRef.current.set(paneId, handle);
        } else {
          paneHandlesRef.current.delete(paneId);
        }

        onPaneHandleChange(paneId, handle);
      };
    },
    [onPaneHandleChange],
  );

  const handleWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>): void => {
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
    },
    [isSplit, onNavigatePaneViewport],
  );

  return {
    stripRef,
    trackRef,
    createPaneHandleRef,
    handleWheelCapture,
  };
};
