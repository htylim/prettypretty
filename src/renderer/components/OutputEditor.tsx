import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
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
};

type OutputEditorProps = {
  value: string;
  searchQuery: string;
  themeMode: ThemeMode;
  documentId: string;
};

const viewStateByDocumentId = new Map<string, MonacoEditor.ICodeEditorViewState | null>();

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSearchDecorations = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  query: string,
): MonacoEditor.IModelDeltaDecoration[] => {
  const model = editor.getModel();
  if (!model || !query) {
    return [];
  }

  const pattern = new RegExp(escapeForRegex(query), 'gi');
  const text = model.getValue();
  const decorations: MonacoEditor.IModelDeltaDecoration[] = [];

  for (const match of text.matchAll(pattern)) {
    const startIndex = match.index ?? -1;
    if (startIndex < 0 || match[0].length === 0) {
      continue;
    }

    const endIndex = startIndex + match[0].length;
    const start = model.getPositionAt(startIndex);
    const end = model.getPositionAt(endIndex);

    decorations.push({
      range: {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      },
      options: {
        inlineClassName: 'output-search-match',
      },
    });
  }

  return decorations;
};

const updateSearchDecorations = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  currentDecorationIds: string[],
  query: string,
): string[] => {
  const nextDecorations = buildSearchDecorations(editor, query);
  return editor.deltaDecorations(currentDecorationIds, nextDecorations);
};

export const OutputEditor = forwardRef<OutputEditorHandle, OutputEditorProps>(
  ({ value, searchQuery, themeMode, documentId }, ref) => {
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const decorationIdsRef = useRef<string[]>([]);
    const currentDocumentIdRef = useRef(documentId);
    const options = useMemo(() => getOutputEditorOptions(), []);
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
      if (!editor) {
        return;
      }

      decorationIdsRef.current = updateSearchDecorations(
        editor,
        decorationIdsRef.current,
        searchQuery,
      );
    }, [searchQuery, value]);

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
        editor.deltaDecorations(decorationIdsRef.current, []);
        decorationIdsRef.current = [];
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
      decorationIdsRef.current = updateSearchDecorations(
        editor,
        decorationIdsRef.current,
        searchQuery,
      );
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
