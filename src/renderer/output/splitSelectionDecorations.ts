import type { editor as MonacoEditor } from 'monaco-editor';
import type { OutputPaneSourceRange } from '../app/outputPaneDomain';

export const OUTPUT_SPLIT_SELECTION_RANGE_CLASS = 'output-split-selection-range';
export const OUTPUT_SPLIT_SELECTION_ANCHOR_CLASS = 'output-split-selection-anchor';

export type SplitSelectionDecorationsController = {
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
        className: OUTPUT_SPLIT_SELECTION_RANGE_CLASS,
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
        className: OUTPUT_SPLIT_SELECTION_ANCHOR_CLASS,
        isWholeLine: true,
      },
    },
  ];
};

export const createSplitSelectionDecorations = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): SplitSelectionDecorationsController => {
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
