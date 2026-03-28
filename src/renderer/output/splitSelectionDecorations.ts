import type { editor as MonacoEditor } from 'monaco-editor';
import type { OutputPaneSourceRange } from '../app/outputPaneDomain';

export const OUTPUT_EMBEDDED_HIGHLIGHT_RANGE_CLASS = 'output-embedded-highlight-range';
export const OUTPUT_EMBEDDED_HIGHLIGHT_ANCHOR_CLASS = 'output-embedded-highlight-anchor';

export type OutputEmbeddedHighlightDecorationsController = {
  update: (sourceRange: OutputPaneSourceRange | null) => void;
  dispose: () => void;
};

const toDecorations = (
  sourceRange: OutputPaneSourceRange,
): MonacoEditor.IModelDeltaDecoration[] => {
  return [
    {
      range: sourceRange,
      options: {
        className: OUTPUT_EMBEDDED_HIGHLIGHT_RANGE_CLASS,
        isWholeLine: true,
      },
    },
    {
      range: {
        startLineNumber: sourceRange.startLineNumber,
        startColumn: 1,
        endLineNumber: sourceRange.startLineNumber,
        endColumn: 1,
      },
      options: {
        className: OUTPUT_EMBEDDED_HIGHLIGHT_ANCHOR_CLASS,
        isWholeLine: true,
      },
    },
  ];
};

export const createOutputEmbeddedHighlightDecorations = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): OutputEmbeddedHighlightDecorationsController => {
  const decorations = editor.createDecorationsCollection();

  return {
    update: (sourceRange) => {
      decorations.set(sourceRange ? toDecorations(sourceRange) : []);
    },
    dispose: () => {
      decorations.clear();
    },
  };
};
