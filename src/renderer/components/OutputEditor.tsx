import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { OutputPaneSourceRange } from '../app/outputPaneDomain';
import { setCollapseStateForFoldStart } from '../editor/monacoFolding';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import { registerInlineFoldControls } from '../output/inlineFoldControls';
import {
  prepareMonacoEditorRuntime,
  releaseSharedEditorModel,
  restoreEditorViewState,
  retainSharedEditorModel,
  saveEditorViewState,
} from '../output/monacoEditorRuntime';
import { PRETTYPRETTY_DARK_THEME, PRETTYPRETTY_LIGHT_THEME } from '../output/monacoThemes';
import { getOutputEditorOptions } from '../output/outputEditorConfig';
import { applyOutputViewRange } from '../output/outputViewRange';

export type OutputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
  focus: () => void;
  openFind: () => void;
};

type OutputEditorProps = {
  value: string;
  themeMode: ThemeMode;
  documentId: string;
  viewStateKey: string;
  indentSize: IndentSize;
  viewRange?: OutputPaneSourceRange | null | undefined;
  onFocus?: (() => void) | undefined;
  testId?: string | undefined;
};

const collapseViewRangeToStartLine = (viewRange: OutputPaneSourceRange): OutputPaneSourceRange => ({
  ...viewRange,
  endLineNumber: viewRange.startLineNumber,
  endColumn: viewRange.startColumn,
});

/**
 * Monaco-backed read-only output editor. It owns pane-local editor state,
 * optional view-range filtering, and active-pane focus handoff.
 */
export const OutputEditor = forwardRef<OutputEditorHandle, OutputEditorProps>(
  (
    {
      value,
      themeMode,
      documentId,
      viewStateKey,
      indentSize,
      viewRange = null,
      onFocus,
      testId = 'output-editor',
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const currentViewStateKeyRef = useRef(viewStateKey);
    const interactionDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
    const focusHandlerRef = useRef<typeof onFocus>(onFocus);
    const sourceViewRangeRef = useRef(viewRange);
    const activeViewRangeRef = useRef(viewRange);
    const pendingEditorFocusRef = useRef(false);
    const viewRangeSourceRef = useRef({});
    const options = useMemo(() => getOutputEditorOptions(indentSize), [indentSize]);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;
    const modelPath = useMemo(() => `output://source/${documentId}`, [documentId]);
    const handleBeforeMount = useCallback((monaco: typeof import('monaco-editor')): void => {
      prepareMonacoEditorRuntime(monaco);
    }, []);

    const saveCurrentViewState = (): void => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      saveEditorViewState(currentViewStateKeyRef.current, editor);
    };

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || currentViewStateKeyRef.current === viewStateKey) {
        return;
      }

      saveCurrentViewState();
      currentViewStateKeyRef.current = viewStateKey;
      sourceViewRangeRef.current = viewRange;
      activeViewRangeRef.current = viewRange;
      restoreEditorViewState(viewStateKey, editor, {
        hiddenAreaResetSource: viewRangeSourceRef.current,
      });
      applyOutputViewRange(editor, activeViewRangeRef.current, viewRangeSourceRef.current);
    }, [viewRange, viewStateKey]);

    useEffect(() => {
      sourceViewRangeRef.current = viewRange;
      activeViewRangeRef.current = viewRange;
    }, [viewRange]);

    useEffect(() => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      sourceViewRangeRef.current = viewRange;
      activeViewRangeRef.current = viewRange;
      applyOutputViewRange(editor, activeViewRangeRef.current, viewRangeSourceRef.current);
    }, [viewRange]);

    useEffect(() => {
      focusHandlerRef.current = onFocus;
    }, [onFocus]);

    useEffect(() => {
      retainSharedEditorModel(modelPath);
      return () => {
        releaseSharedEditorModel(modelPath);
      };
    }, [modelPath]);

    useEffect(
      () => () => {
        const editor = editorRef.current;
        for (const disposable of interactionDisposablesRef.current) {
          disposable.dispose();
        }
        interactionDisposablesRef.current = [];

        if (editor) {
          saveEditorViewState(currentViewStateKeyRef.current, editor);
        }
        editorRef.current = null;
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        collapseAll: async () => {
          const editor = editorRef.current;
          if (!editor) {
            return;
          }

          if (sourceViewRangeRef.current) {
            await setCollapseStateForFoldStart(
              editor,
              sourceViewRangeRef.current.startLineNumber,
              true,
            );
            activeViewRangeRef.current = collapseViewRangeToStartLine(sourceViewRangeRef.current);
            applyOutputViewRange(editor, activeViewRangeRef.current, viewRangeSourceRef.current);
            return;
          }

          await editor.getAction('editor.foldAll')?.run();
        },
        expandAll: async () => {
          const editor = editorRef.current;
          if (!editor) {
            return;
          }

          if (sourceViewRangeRef.current) {
            await setCollapseStateForFoldStart(
              editor,
              sourceViewRangeRef.current.startLineNumber,
              false,
            );
            activeViewRangeRef.current = sourceViewRangeRef.current;
            applyOutputViewRange(editor, activeViewRangeRef.current, viewRangeSourceRef.current);
            return;
          }

          await editor.getAction('editor.unfoldAll')?.run();
        },
        focus: () => {
          const editor = editorRef.current;
          if (!editor) {
            pendingEditorFocusRef.current = true;
            return;
          }

          editor.focus();
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
      currentViewStateKeyRef.current = viewStateKey;
      void monaco;
      restoreEditorViewState(viewStateKey, editor, {
        hiddenAreaResetSource: viewRangeSourceRef.current,
      });
      applyOutputViewRange(editor, viewRange, viewRangeSourceRef.current);
      if (pendingEditorFocusRef.current) {
        pendingEditorFocusRef.current = false;
        editor.focus();
      }

      const nextInteractionDisposables: Array<{ dispose: () => void }> = [
        registerInlineFoldControls(editor),
        editor.onDidChangeHiddenAreas(() => {
          applyOutputViewRange(editor, activeViewRangeRef.current, viewRangeSourceRef.current);
        }),
        editor.onMouseDown(() => {
          focusHandlerRef.current?.();
        }),
        editor.onDidFocusEditorWidget(() => {
          focusHandlerRef.current?.();
        }),
      ];

      interactionDisposablesRef.current = nextInteractionDisposables;
    };

    return (
      <div
        className="output-editor"
        data-testid={testId}
        onFocusCapture={() => {
          focusHandlerRef.current?.();
        }}
        onMouseDown={() => {
          focusHandlerRef.current?.();
        }}
        ref={containerRef}
      >
        <Editor
          beforeMount={handleBeforeMount}
          height="100%"
          keepCurrentModel
          language={language}
          onMount={handleMount}
          options={options}
          path={modelPath}
          saveViewState={false}
          theme={theme}
          value={value}
        />
      </div>
    );
  },
);

OutputEditor.displayName = 'OutputEditor';
