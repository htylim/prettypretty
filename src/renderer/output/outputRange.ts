import type { IRange } from 'monaco-editor';

export type OutputPaneSourceRange = Pick<
  IRange,
  'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'
>;

export const areOutputPaneSourceRangesEqual = (
  left: OutputPaneSourceRange,
  right: OutputPaneSourceRange,
): boolean => {
  return (
    left.startLineNumber === right.startLineNumber &&
    left.startColumn === right.startColumn &&
    left.endLineNumber === right.endLineNumber &&
    left.endColumn === right.endColumn
  );
};
