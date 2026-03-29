import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { OutputEditorHandle } from './OutputEditor';
import { OutputEditor } from './OutputEditor';
import { type OutputPaneFocusRequest, type OutputPaneViewModel } from './outputPaneTypes';
import { useOutputPaneViewportRuntime } from './useOutputPaneViewportRuntime';

export type { OutputPaneFocusRequest, OutputPaneViewModel } from './outputPaneTypes';

type OutputPaneStripProps = {
  panes: OutputPaneViewModel[];
  activePaneId: string;
  focusRequest: OutputPaneFocusRequest | null;
  leftVisiblePaneIndex: number;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  onPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onPaneFocus: (paneId: string) => void;
  onNavigatePaneViewport: (stepDelta: number) => void;
};

export const OutputPaneStrip = ({
  panes,
  activePaneId,
  focusRequest,
  leftVisiblePaneIndex,
  themeMode,
  indentSize,
  onPaneHandleChange,
  onPaneFocus,
  onNavigatePaneViewport,
}: OutputPaneStripProps) => {
  const isSplit = panes.length > 1;
  const paneWidth = isSplit ? '50%' : '100%';
  const { stripRef, trackRef, createPaneHandleRef, handleWheelCapture } =
    useOutputPaneViewportRuntime({
      paneCount: panes.length,
      focusRequest,
      leftVisiblePaneIndex,
      onPaneHandleChange,
      onNavigatePaneViewport,
    });

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
      <div
        className="output-pane-strip-track"
        data-testid="output-pane-strip-track"
        ref={trackRef}
        style={{ gridAutoColumns: paneWidth }}
      >
        {panes.map((pane) => (
          <div
            className="output-pane-strip-item"
            data-testid={`output-pane-${pane.paneId}`}
            key={pane.paneId}
          >
            <OutputEditor
              ref={createPaneHandleRef(pane.paneId)}
              documentId={pane.documentId}
              indentSize={indentSize}
              onFocus={() => {
                if (pane.paneId !== activePaneId) {
                  onPaneFocus(pane.paneId);
                }
              }}
              testId={pane.testId}
              themeMode={themeMode}
              value={pane.value}
              viewRange={pane.viewRange}
              viewStateKey={pane.viewStateKey}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
