import type { IRange, editor as MonacoEditor } from 'monaco-editor';
import type { OutputPaneSourceRange } from '../app/outputPaneDomain';

type HiddenAreaCapableEditor = MonacoEditor.IStandaloneCodeEditor & {
  setHiddenAreas?: (ranges: IRange[], source?: unknown, forceUpdate?: boolean) => void;
};

const createLineRange = (startLineNumber: number, endLineNumber: number): IRange => ({
  startLineNumber,
  startColumn: 1,
  endLineNumber,
  endColumn: 1,
});

const getHiddenAreasForViewRange = (
  model: MonacoEditor.ITextModel,
  viewRange: OutputPaneSourceRange | null,
): IRange[] => {
  if (!viewRange) {
    return [];
  }

  const hiddenAreas: IRange[] = [];
  if (viewRange.startLineNumber > 1) {
    hiddenAreas.push(createLineRange(1, viewRange.startLineNumber - 1));
  }

  const lastLineNumber = model.getLineCount();
  if (viewRange.endLineNumber < lastLineNumber) {
    hiddenAreas.push(createLineRange(viewRange.endLineNumber + 1, lastLineNumber));
  }

  return hiddenAreas;
};

export const applyOutputViewRange = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  viewRange: OutputPaneSourceRange | null,
  source: object,
): void => {
  const model = editor.getModel();
  if (!model) {
    return;
  }

  (editor as HiddenAreaCapableEditor).setHiddenAreas?.(
    getHiddenAreasForViewRange(model, viewRange),
    source,
  );
};
