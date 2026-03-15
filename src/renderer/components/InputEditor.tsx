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
};

export type InputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
};

export const InputEditor = forwardRef<InputEditorHandle, InputEditorProps>(
  ({ value, themeMode, indentSize, onChange }, ref) => {
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
      <div className="input-editor" data-testid="input-editor">
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
