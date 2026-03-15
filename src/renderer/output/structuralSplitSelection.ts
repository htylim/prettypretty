import type { IRange, editor as MonacoEditor } from 'monaco-editor';
import { resolveSmallestEnclosingFoldRange } from '../editor/monacoFolding';
import type { OutputPaneSelection, OutputPaneSourceRange } from '../app/outputPaneDomain';

const getFoldRangeModelSpan = (
  model: MonacoEditor.ITextModel,
  sourceRange: Pick<IRange, 'startLineNumber' | 'endLineNumber'>,
): OutputPaneSourceRange => {
  return {
    startLineNumber: sourceRange.startLineNumber,
    startColumn: 1,
    endLineNumber: sourceRange.endLineNumber,
    endColumn: model.getLineMaxColumn(sourceRange.endLineNumber),
  };
};

const isRangeWithinViewRange = (
  sourceRange: OutputPaneSourceRange,
  viewRange: OutputPaneSourceRange,
): boolean => {
  return (
    sourceRange.startLineNumber >= viewRange.startLineNumber &&
    sourceRange.endLineNumber <= viewRange.endLineNumber
  );
};

const isRangeEqual = (left: OutputPaneSourceRange, right: OutputPaneSourceRange): boolean => {
  return (
    left.startLineNumber === right.startLineNumber &&
    left.startColumn === right.startColumn &&
    left.endLineNumber === right.endLineNumber &&
    left.endColumn === right.endColumn
  );
};

export const resolveStructuralSplitSelection = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumber: number,
  paneViewRange: OutputPaneSourceRange | null = null,
): Promise<OutputPaneSelection | null> => {
  const model = editor.getModel();
  if (!model) {
    return null;
  }

  const foldRange = await resolveSmallestEnclosingFoldRange(editor, lineNumber);
  if (!foldRange) {
    return null;
  }

  const sourceRange = getFoldRangeModelSpan(model, foldRange);
  if (paneViewRange) {
    if (!isRangeWithinViewRange(sourceRange, paneViewRange)) {
      return null;
    }

    if (isRangeEqual(sourceRange, paneViewRange)) {
      return null;
    }
  }

  return {
    sourceRange,
  };
};
