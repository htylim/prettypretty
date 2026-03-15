import type { editor as MonacoEditor } from 'monaco-editor';
import { hasPrimaryModifier } from '../app/primaryModifier';
import { findOwningFoldStartLine, toggleFoldStart } from '../editor/monacoFolding';

export const registerPrimaryModifierFoldToggle = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): { dispose: () => void } => {
  return editor.onMouseDown((mouseEvent) => {
    const lineNumber = mouseEvent.target.position?.lineNumber;
    const isPrimaryModifierClick =
      hasPrimaryModifier(mouseEvent.event) && mouseEvent.event.browserEvent.detail === 1;
    if (!lineNumber || !isPrimaryModifierClick) {
      return;
    }

    const foldStartLine = findOwningFoldStartLine(editor, lineNumber);
    if (!foldStartLine) {
      return;
    }

    mouseEvent.event.preventDefault();
    mouseEvent.event.stopPropagation();
    void toggleFoldStart(editor, foldStartLine);
  });
};
