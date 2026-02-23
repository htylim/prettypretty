import type { ClipboardEventHandler, DragEventHandler } from 'react';
import type { PaneMode } from '../../shared/types';

type EditorShellProps = {
  paneMode: PaneMode;
  inputText: string;
  outputText: string;
  searchQuery: string;
  onEditInputChange: (value: string) => void;
  onIngestInput: (value: string) => void;
  onOpenFile: () => Promise<void>;
};

const highlightQuery = (value: string, query: string): string => {
  if (!query) {
    return value;
  }

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(escaped, 'gi'), (match) => `<<${match}>>`);
};

export const EditorShell = ({
  paneMode,
  inputText,
  outputText,
  searchQuery,
  onEditInputChange,
  onIngestInput,
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
    onIngestInput(fileText);
  };

  const handlePaste: ClipboardEventHandler<HTMLDivElement> = (event) => {
    const pastedText = event.clipboardData.getData('text');
    onIngestInput(pastedText);
  };

  const displayOutput = highlightQuery(outputText, searchQuery);

  return (
    <section
      className="editor-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePaste}
      data-testid="editor-shell"
    >
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
        <textarea
          className="input-editor"
          value={inputText}
          onChange={(event) => onEditInputChange(event.target.value)}
          spellCheck={false}
          data-testid="input-editor"
        />
      ) : (
        <pre className="output-editor" data-testid="output-editor">
          {displayOutput}
        </pre>
      )}
    </section>
  );
};
