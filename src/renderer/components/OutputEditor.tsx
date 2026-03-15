import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { OutputPaneSelection, OutputPaneSourceRange } from '../app/outputPaneDomain';
import { setCollapseStateForFoldStart } from '../editor/monacoFolding';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import {
  prepareMonacoEditorRuntime,
  releaseSharedEditorModel,
  restoreEditorViewState,
  retainSharedEditorModel,
  saveEditorViewState,
} from '../output/monacoEditorRuntime';
import { PRETTYPRETTY_DARK_THEME, PRETTYPRETTY_LIGHT_THEME } from '../output/monacoThemes';
import { applyOutputViewRange } from '../output/outputViewRange';
import { registerInlineFoldControls } from '../output/inlineFoldControls';
import { getOutputEditorOptions } from '../output/outputEditorConfig';
import { createSplitSelectionDecorations } from '../output/splitSelectionDecorations';
import { resolveStructuralSplitSelection } from '../output/structuralSplitSelection';

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
  highlightRange?: OutputPaneSourceRange | null | undefined;
  onSplitSelection?: ((selection: OutputPaneSelection) => void) | undefined;
  onFocus?: (() => void) | undefined;
  testId?: string | undefined;
};

const registerCtrlClickSplitSelection = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  getViewRange: () => OutputPaneSourceRange | null,
  onSplitSelection: (selection: OutputPaneSelection) => void,
): { dispose: () => void } => {
  let disposed = false;
  const disposable = editor.onMouseDown((mouseEvent) => {
    const lineNumber = mouseEvent.target.position?.lineNumber;
    const isCtrlClick = mouseEvent.event.ctrlKey && mouseEvent.event.browserEvent.detail === 1;
    if (!lineNumber || !isCtrlClick) {
      return;
    }

    mouseEvent.event.preventDefault();
    mouseEvent.event.stopPropagation();

    void resolveStructuralSplitSelection(editor, lineNumber, getViewRange()).then((selection) => {
      if (!selection || disposed) {
        return;
      }

      onSplitSelection(selection);
    });
  });

  return {
    dispose: () => {
      disposed = true;
      disposable.dispose();
    },
  };
};

const collapseViewRangeToStartLine = (viewRange: OutputPaneSourceRange): OutputPaneSourceRange => ({
  ...viewRange,
  endLineNumber: viewRange.startLineNumber,
  endColumn: viewRange.startColumn,
});

export const OutputEditor = forwardRef<OutputEditorHandle, OutputEditorProps>(
  (
    {
      value,
      themeMode,
      documentId,
      viewStateKey,
      indentSize,
      viewRange = null,
      highlightRange = null,
      onSplitSelection,
      onFocus,
      testId = 'output-editor',
    },
    ref,
  ) => {
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const currentViewStateKeyRef = useRef(viewStateKey);
    const interactionDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
    const splitSelectionDecorationsRef = useRef<ReturnType<
      typeof createSplitSelectionDecorations
    > | null>(null);
    const splitSelectionHandlerRef = useRef<typeof onSplitSelection>(onSplitSelection);
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
      splitSelectionDecorationsRef.current?.update(highlightRange);
    }, [highlightRange]);

    useEffect(() => {
      splitSelectionHandlerRef.current = onSplitSelection;
    }, [onSplitSelection]);

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
        splitSelectionDecorationsRef.current?.dispose();
        splitSelectionDecorationsRef.current = null;

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
      splitSelectionDecorationsRef.current = createSplitSelectionDecorations(editor);
      splitSelectionDecorationsRef.current.update(highlightRange);
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

      if (onSplitSelection) {
        nextInteractionDisposables.push(
          registerCtrlClickSplitSelection(
            editor,
            () => sourceViewRangeRef.current,
            (selection) => {
              splitSelectionHandlerRef.current?.(selection);
            },
          ),
        );
      }

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
