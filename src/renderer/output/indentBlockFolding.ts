import type { editor as MonacoEditor } from 'monaco-editor';
import { findOwningFoldStartLine, toggleFoldStart } from '../editor/monacoFolding';

export const registerCmdClickFoldToggle = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): { dispose: () => void } => {
  return editor.onMouseDown((mouseEvent) => {
    const lineNumber = mouseEvent.target.position?.lineNumber;
    const isCmdClick = mouseEvent.event.metaKey && mouseEvent.event.browserEvent.detail === 1;
    if (!lineNumber || !isCmdClick) {
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
