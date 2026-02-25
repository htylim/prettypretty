import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import { configureMonaco } from '../output/configureMonaco';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import {
  PRETTYPRETTY_DARK_THEME,
  PRETTYPRETTY_LIGHT_THEME,
  registerMonacoThemes,
} from '../output/monacoThemes';
import { getOutputEditorOptions } from '../output/outputEditorConfig';

export type OutputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
  openFind: () => void;
};

type OutputEditorProps = {
  value: string;
  themeMode: ThemeMode;
  documentId: string;
  indentSize: IndentSize;
};

const viewStateByDocumentId = new Map<string, MonacoEditor.ICodeEditorViewState | null>();

export const OutputEditor = forwardRef<OutputEditorHandle, OutputEditorProps>(
  ({ value, themeMode, documentId, indentSize }, ref) => {
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const currentDocumentIdRef = useRef(documentId);
    const options = useMemo(() => getOutputEditorOptions(indentSize), [indentSize]);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;

    configureMonaco();

    const saveCurrentViewState = (): void => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      viewStateByDocumentId.set(currentDocumentIdRef.current, editor.saveViewState());
    };

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || currentDocumentIdRef.current === documentId) {
        return;
      }

      saveCurrentViewState();
      currentDocumentIdRef.current = documentId;
      const savedViewState = viewStateByDocumentId.get(documentId) ?? null;
      if (savedViewState) {
        editor.restoreViewState(savedViewState);
      } else {
        editor.setScrollTop(0);
        editor.setScrollLeft(0);
        editor.setPosition({ lineNumber: 1, column: 1 });
      }
    }, [documentId]);

    useEffect(
      () => () => {
        const editor = editorRef.current;
        if (!editor) {
          return;
        }

        viewStateByDocumentId.set(currentDocumentIdRef.current, editor.saveViewState());
        editorRef.current = null;
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        collapseAll: () => {
          void editorRef.current?.getAction('editor.foldAll')?.run();
        },
        expandAll: () => {
          void editorRef.current?.getAction('editor.unfoldAll')?.run();
        },
        openFind: () => {
          const editor = editorRef.current;
          if (!editor) {
            return;
          }

          editor.focus();
          void editor.getAction('actions.find')?.run();
        },
      }),
      [],
    );

    const handleMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      registerMonacoThemes(monaco);
      monaco.editor.setTheme(theme);
      const initialViewState = viewStateByDocumentId.get(documentId) ?? null;
      if (initialViewState) {
        editor.restoreViewState(initialViewState);
      }
    };

    return (
      <div className="output-editor" data-testid="output-editor">
        <Editor
          height="100%"
          language={language}
          onMount={handleMount}
          options={options}
          theme={theme}
          value={value}
        />
      </div>
    );
  },
);

OutputEditor.displayName = 'OutputEditor';
