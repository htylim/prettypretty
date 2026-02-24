import type { ClipboardEventHandler, DragEventHandler, RefObject } from 'react';
import type { PaneMode, ThemeMode } from '../../shared/types';
import { InputEditor, type InputEditorHandle } from './InputEditor';
import { OutputEditor, type OutputEditorHandle } from './OutputEditor';

type EditorShellProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  inputText: string;
  outputText: string;
  outputDocumentId: string;
  inputEditorRef: RefObject<InputEditorHandle | null>;
  outputEditorRef: RefObject<OutputEditorHandle | null>;
  onEditInputChange: (value: string) => void;
  onIngestInput: (value: string) => void;
  onOpenFile: () => Promise<void>;
};

export const EditorShell = ({
  paneMode,
  themeMode,
  inputText,
  outputText,
  outputDocumentId,
  inputEditorRef,
  outputEditorRef,
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
        <InputEditor
          ref={inputEditorRef}
          value={inputText}
          themeMode={themeMode}
          onChange={onEditInputChange}
        />
      ) : (
        <OutputEditor
          ref={outputEditorRef}
          documentId={outputDocumentId}
          themeMode={themeMode}
          value={outputText}
        />
      )}
    </section>
  );
};
