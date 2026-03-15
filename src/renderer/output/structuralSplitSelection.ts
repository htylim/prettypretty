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

export const resolveStructuralSplitSelection = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumber: number,
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
  return {
    sourceRange,
  };
};
