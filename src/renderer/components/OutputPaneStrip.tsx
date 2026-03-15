import type { RefCallback } from 'react';
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
  themeMode: ThemeMode;
  indentSize: IndentSize;
  onPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onPaneFocus: (paneId: string) => void;
  onPaneSplitSelection: (paneId: string, selection: OutputPaneSelection) => void;
};

export const OutputPaneStrip = ({
  panes,
  themeMode,
  indentSize,
  onPaneHandleChange,
  onPaneFocus,
  onPaneSplitSelection,
}: OutputPaneStripProps) => {
  const isSplit = panes.length > 1;
  const paneWidth = isSplit ? '50%' : '100%';

  const createHandleRef = (paneId: string): RefCallback<OutputEditorHandle> => {
    return (handle) => {
      onPaneHandleChange(paneId, handle);
    };
  };

  return (
    <div
      className="output-pane-strip"
      data-overflowing={panes.length > 2 ? 'true' : 'false'}
      data-pane-count={String(panes.length)}
      data-testid="output-pane-strip"
      data-split={isSplit ? 'true' : 'false'}
    >
      {panes.map((pane) => (
        <div
          className="output-pane-strip-item"
          data-testid={`output-pane-${pane.paneId}`}
          key={pane.paneId}
          style={{ flexBasis: paneWidth }}
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
