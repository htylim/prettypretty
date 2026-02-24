import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { ThemeMode } from '../../shared/types';
import { configureMonaco } from '../output/configureMonaco';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import {
  PRETTYPRETTY_DARK_THEME,
  PRETTYPRETTY_LIGHT_THEME,
  registerMonacoThemes,
} from '../output/monacoThemes';
import { getInputEditorOptions } from '../output/outputEditorConfig';

type InputEditorProps = {
  value: string;
  themeMode: ThemeMode;
  onChange: (value: string) => void;
};

export type InputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
};

export const InputEditor = forwardRef<InputEditorHandle, InputEditorProps>(
  ({ value, themeMode, onChange }, ref) => {
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const options = useMemo(() => getInputEditorOptions(), []);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;

    configureMonaco();

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
    };

    return (
      <div className="input-editor" data-testid="input-editor">
        <Editor
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
