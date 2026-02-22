import type { ClipboardEventHandler, DragEventHandler } from 'react';
import type { PaneMode } from '../../shared/types';

type EditorShellProps = {
  paneMode: PaneMode;
  inputText: string;
  outputText: string;
  searchQuery: string;
  onInputChange: (value: string) => void;
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
  onInputChange,
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
    onInputChange(fileText);
  };

  const handlePaste: ClipboardEventHandler<HTMLDivElement> = (event) => {
    const pastedText = event.clipboardData.getData('text');

    if (pastedText) {
      onInputChange(pastedText);
    }
  };

  const displayOutput = highlightQuery(outputText, searchQuery);

  return (
    <section
      className="mt-3 flex flex-1 overflow-hidden rounded-2xl border border-stone-300 bg-white"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePaste}
      data-testid="editor-shell"
    >
      {!hasContent ? (
        <div className="flex h-full w-full items-center justify-center text-center">
          <p
            className="inline-flex items-baseline gap-2 text-4xl font-medium tracking-tight text-stone-800"
            data-testid="empty-state-cta"
          >
            Paste, Drop or{' '}
            <button
              className="font-semibold text-amber-700 underline decoration-amber-500 underline-offset-4"
              onClick={() => void onOpenFile()}
              type="button"
            >
              Click
            </button>
          </p>
        </div>
      ) : paneMode === 'input' ? (
        <textarea
          className="h-full w-full resize-none border-0 bg-white p-4 font-mono text-sm leading-6 text-stone-900 outline-none"
          value={inputText}
          onChange={(event) => onInputChange(event.target.value)}
          spellCheck={false}
          data-testid="input-editor"
        />
      ) : (
        <pre
          className="h-full w-full overflow-auto bg-stone-900 p-4 font-mono text-sm leading-6 text-cyan-200"
          data-testid="output-editor"
        >
          {displayOutput}
        </pre>
      )}
    </section>
  );
};
