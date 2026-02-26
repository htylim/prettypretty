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
  isLlmRunning: boolean;
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
  isLlmRunning,
  inputEditorRef,
  outputEditorRef,
  onEditInputChange,
  onIngestInput,
  onDismissIngestNotice,
  onOpenFile,
}: EditorShellProps) => {
  const hasContent = inputText.trim().length > 0;

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
      {!hasContent ? (
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
          {isLlmRunning ? (
            <div
              aria-live="polite"
              className="llm-loading-indicator"
              data-testid="llm-loading-indicator"
              role="status"
            >
              <span className="llm-loading-spinner" aria-hidden="true" />
              <span>Running LLM fallback...</span>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};
