import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import { registerPrimaryModifierFoldToggle } from '../output/indentBlockFolding';
import { prepareMonacoEditorRuntime } from '../output/monacoEditorRuntime';
import { PRETTYPRETTY_DARK_THEME, PRETTYPRETTY_LIGHT_THEME } from '../output/monacoThemes';
import { getInputEditorOptions } from '../output/outputEditorConfig';

type InputEditorProps = {
  value: string;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  onChange: (value: string) => void;
  onViewportInteraction?: (() => void) | undefined;
};

export type InputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
  captureViewportSnapshot: () => EditorViewportSnapshot | null;
  restoreViewportSnapshot: (snapshot: EditorViewportSnapshot | null) => void;
};

export type EditorViewportSnapshot = {
  lineNumber: number;
  column: number;
  topLineNumber: number;
  scrollLeft: number;
  scrollTop: number;
  restoreScrollPosition?: boolean;
};

export const InputEditor = forwardRef<InputEditorHandle, InputEditorProps>(
  ({ value, themeMode, indentSize, onChange, onViewportInteraction }, ref) => {
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const interactionDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
    const options = useMemo(() => getInputEditorOptions(indentSize), [indentSize]);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;
    const handleBeforeMount = useCallback((monaco: typeof import('monaco-editor')): void => {
      prepareMonacoEditorRuntime(monaco);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        collapseAll: () => {
          void editorRef.current?.getAction('editor.foldAll')?.run();
        },
        expandAll: () => {
          void editorRef.current?.getAction('editor.unfoldAll')?.run();
        },
        captureViewportSnapshot: () => {
          const editor = editorRef.current;
          const position = editor?.getPosition();
          if (!editor || !position) {
            return null;
          }

          return {
            lineNumber: position.lineNumber,
            column: position.column,
            topLineNumber: editor.getVisibleRanges()[0]?.startLineNumber ?? position.lineNumber,
            scrollLeft: editor.getScrollLeft(),
            scrollTop: editor.getScrollTop(),
          };
        },
        restoreViewportSnapshot: (snapshot) => {
          const editor = editorRef.current;
          const model = editor?.getModel();
          if (!editor || !model || !snapshot) {
            return;
          }

          const lineNumber = Math.min(Math.max(snapshot.lineNumber, 1), model.getLineCount());
          const column = Math.min(Math.max(snapshot.column, 1), model.getLineMaxColumn(lineNumber));
          const topLineNumber = Math.min(Math.max(snapshot.topLineNumber, 1), model.getLineCount());
          editor.setPosition({ lineNumber, column });
          editor.revealLineNearTop(topLineNumber);
          if (snapshot.restoreScrollPosition !== false) {
            editor.setScrollLeft(snapshot.scrollLeft);
            editor.setScrollTop(snapshot.scrollTop);
          }
        },
      }),
      [],
    );

    useEffect(
      () => () => {
        for (const disposable of interactionDisposablesRef.current) {
          disposable.dispose();
        }
        interactionDisposablesRef.current = [];
        editorRef.current = null;
      },
      [],
    );

    const handleMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      void monaco;
      interactionDisposablesRef.current = [registerPrimaryModifierFoldToggle(editor)];
    };

    return (
      <div
        className="input-editor"
        data-testid="input-editor"
        onKeyDownCapture={onViewportInteraction}
        onMouseDownCapture={onViewportInteraction}
        onWheelCapture={onViewportInteraction}
      >
        <Editor
          beforeMount={handleBeforeMount}
          height="100%"
          language={language}
          onChange={(nextValue) => onChange(nextValue ?? '')}
          onMount={handleMount}
          options={options}
          theme={theme}
          value={value}
        />
      </div>
    );
  },
);

InputEditor.displayName = 'InputEditor';
