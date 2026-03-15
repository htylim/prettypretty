import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { IRange, editor as MonacoEditor } from 'monaco-editor';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { OutputPaneSelection, OutputPaneSourceRange } from '../app/outputPaneDomain';
import { setCollapseStateForFoldStart } from '../editor/monacoFolding';
import { configureMonaco } from '../output/configureMonaco';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import {
  PRETTYPRETTY_DARK_THEME,
  PRETTYPRETTY_LIGHT_THEME,
  registerMonacoThemes,
} from '../output/monacoThemes';
import { applyOutputViewRange } from '../output/outputViewRange';
import { registerInlineFoldControls } from '../output/inlineFoldControls';
import { getOutputEditorOptions } from '../output/outputEditorConfig';
import { createSplitSelectionDecorations } from '../output/splitSelectionDecorations';
import { resolveStructuralSplitSelection } from '../output/structuralSplitSelection';

export type OutputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
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

const viewStateByKey = new Map<string, MonacoEditor.ICodeEditorViewState | null>();
const modelReferenceCounts = new Map<string, number>();
let monacoModule: typeof import('monaco-editor') | null = null;

const retainModel = (modelPath: string): void => {
  modelReferenceCounts.set(modelPath, (modelReferenceCounts.get(modelPath) ?? 0) + 1);
};

const releaseModel = (modelPath: string): void => {
  const currentReferenceCount = modelReferenceCounts.get(modelPath) ?? 0;
  if (currentReferenceCount <= 1) {
    modelReferenceCounts.delete(modelPath);
    globalThis.queueMicrotask(() => {
      if ((modelReferenceCounts.get(modelPath) ?? 0) > 0) {
        return;
      }

      const model = monacoModule?.editor.getModel(monacoModule.Uri.parse(modelPath));
      model?.dispose();
    });
    return;
  }

  modelReferenceCounts.set(modelPath, currentReferenceCount - 1);
};

const restoreViewState = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  viewStateKey: string,
  viewRangeSource: object,
): void => {
  const savedViewState = viewStateByKey.get(viewStateKey) ?? null;
  if (savedViewState) {
    editor.restoreViewState(savedViewState);
    return;
  }

  (
    editor as MonacoEditor.IStandaloneCodeEditor & {
      setHiddenAreas?: (ranges: IRange[], source?: unknown, forceUpdate?: boolean) => void;
    }
  ).setHiddenAreas?.([], viewRangeSource, true);
  editor.setScrollTop(0);
  editor.setScrollLeft(0);
  editor.setPosition({ lineNumber: 1, column: 1 });
};

const registerCtrlClickSplitSelection = (
  editor: MonacoEditor.IStandaloneCodeEditor,
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

    void resolveStructuralSplitSelection(editor, lineNumber).then((selection) => {
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
    const viewRangeSourceRef = useRef({});
    const options = useMemo(() => getOutputEditorOptions(indentSize), [indentSize]);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;
    const modelPath = useMemo(() => `output://source/${documentId}`, [documentId]);

    configureMonaco();

    const saveCurrentViewState = (): void => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      viewStateByKey.set(currentViewStateKeyRef.current, editor.saveViewState());
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
      restoreViewState(editor, viewStateKey, viewRangeSourceRef.current);
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
      retainModel(modelPath);
      return () => {
        releaseModel(modelPath);
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
          viewStateByKey.set(currentViewStateKeyRef.current, editor.saveViewState());
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
      monacoModule = monaco;
      editorRef.current = editor;
      currentViewStateKeyRef.current = viewStateKey;
      registerMonacoThemes(monaco);
      monaco.editor.setTheme(theme);
      restoreViewState(editor, viewStateKey, viewRangeSourceRef.current);
      splitSelectionDecorationsRef.current = createSplitSelectionDecorations(editor);
      splitSelectionDecorationsRef.current.update(highlightRange);
      applyOutputViewRange(editor, viewRange, viewRangeSourceRef.current);

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
          registerCtrlClickSplitSelection(editor, (selection) => {
            splitSelectionHandlerRef.current?.(selection);
          }),
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
