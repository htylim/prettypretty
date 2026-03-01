import type { ClipboardEventHandler, DragEventHandler, RefObject } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PaneMode, ThemeMode } from '../../shared/types';
import { InputEditor, type InputEditorHandle } from './InputEditor';
import { OutputEditor, type OutputEditorHandle } from './OutputEditor';

type EditorShellProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  inputText: string;
  outputText: string;
  outputDocumentId: string;
  ingestNotice: string | null;
  fallbackWaitState: {
    requestId: number;
    formatLabel: string;
    agentName: string;
    progressLine: string | null;
  } | null;
  inputEditorRef: RefObject<InputEditorHandle | null>;
  outputEditorRef: RefObject<OutputEditorHandle | null>;
  onEditInputChange: (value: string) => void;
  onIngestInput: (value: string, source: 'open-file' | 'drop' | 'paste') => void;
  onDismissIngestNotice: () => void;
  onOpenFile: () => Promise<void>;
};

export const EditorShell = ({
  paneMode,
  themeMode,
  indentSize,
  inputText,
  outputText,
  outputDocumentId,
  ingestNotice,
  fallbackWaitState,
  inputEditorRef,
  outputEditorRef,
  onEditInputChange,
  onIngestInput,
  onDismissIngestNotice,
  onOpenFile,
}: EditorShellProps) => {
  const hasContent = inputText.trim().length > 0;
  const fallbackWaitMessage = fallbackWaitState ? (
    <>
      Malformed {fallbackWaitState.formatLabel}
      <br />
      Calling {fallbackWaitState.agentName}
    </>
  ) : null;
  const fallbackProgressLine = fallbackWaitState?.progressLine ?? 'Waiting for agent output...';

  const handleDrop: DragEventHandler<HTMLDivElement> = async (event) => {
    event.preventDefault();
    const [file] = Array.from(event.dataTransfer.files);

    if (!file) {
      return;
    }

    const fileText = await file.text();
    onIngestInput(fileText, 'drop');
  };

  const handlePaste: ClipboardEventHandler<HTMLDivElement> = (event) => {
    const pastedText = event.clipboardData.getData('text');
    onIngestInput(pastedText, 'paste');
  };

  return (
    <section
      className="editor-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePaste}
      data-testid="editor-shell"
    >
      {ingestNotice ? (
        <div className="ingest-notice" data-testid="ingest-notice" role="status">
          <span>{ingestNotice}</span>
          <button
            aria-label="Dismiss notice"
            className="ingest-notice-dismiss"
            onClick={onDismissIngestNotice}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {fallbackWaitState ? (
        <div
          aria-live="polite"
          className="fallback-wait-screen"
          data-testid="fallback-wait-screen"
          role="status"
        >
          <p className="fallback-wait-message" data-testid="fallback-wait-message">
            {fallbackWaitMessage}
          </p>
          <div className="fallback-wait-progress">
            <span aria-hidden="true" className="fallback-wait-spinner" />
            <span className="fallback-wait-progress-label">Processing...</span>
          </div>
          <p className="fallback-wait-line" data-testid="fallback-wait-line">
            {fallbackProgressLine}
          </p>
        </div>
      ) : !hasContent ? (
        <div className="empty-state">
          <p className="empty-state-cta" data-testid="empty-state-cta">
            Paste, Drop or{' '}
            <button className="empty-state-link" onClick={() => void onOpenFile()} type="button">
              Click
            </button>
          </p>
        </div>
      ) : paneMode === 'input' ? (
        <InputEditor
          ref={inputEditorRef}
          value={inputText}
          themeMode={themeMode}
          indentSize={indentSize}
          onChange={onEditInputChange}
        />
      ) : (
        <div className="output-pane">
          <OutputEditor
            ref={outputEditorRef}
            documentId={outputDocumentId}
            themeMode={themeMode}
            indentSize={indentSize}
            value={outputText}
          />
        </div>
      )}
    </section>
  );
};
