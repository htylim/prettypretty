import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { OutputPaneSourceRange } from '../app/outputPaneDomain';
import { setCollapseStateForFoldStart } from '../editor/monacoFolding';
import { registerInlineFoldControls } from '../output/inlineFoldControls';
import {
  prepareMonacoEditorRuntime,
  releaseSharedEditorModel,
  restoreEditorViewState,
  retainSharedEditorModel,
  saveEditorViewState,
} from '../output/monacoEditorRuntime';
import { applyOutputViewRange } from '../output/outputViewRange';

type OutputEditorRuntimeOptions = {
  documentId: string;
  viewStateKey: string;
  viewRange?: OutputPaneSourceRange | null | undefined;
  onFocus?: (() => void) | undefined;
  onContextMenu?: ((request: OutputEditorContextMenuRequest) => void) | undefined;
};

export type OutputEditorContextMenuRequest = {
  anchorX: number;
  anchorY: number;
  isContentHit: boolean;
  position: {
    lineNumber: number;
    column: number;
  } | null;
  hasSelection: boolean;
};

export type OutputEditorRuntime = {
  beforeMount: (monaco: typeof import('monaco-editor')) => void;
  onMount: OnMount;
  onUnmount: OnMount;
  onFocusCapture: () => void;
  onMouseDown: () => void;
  collapseAll: () => Promise<void>;
  expandAll: () => Promise<void>;
  focus: () => void;
  openFind: () => void;
};

const collapseViewRangeToStartLine = (viewRange: OutputPaneSourceRange): OutputPaneSourceRange => ({
  ...viewRange,
  endLineNumber: viewRange.startLineNumber,
  endColumn: viewRange.startColumn,
});

export const useOutputEditorRuntime = ({
  documentId,
  viewStateKey,
  viewRange = null,
  onFocus,
  onContextMenu,
}: OutputEditorRuntimeOptions): OutputEditorRuntime => {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const currentViewStateKeyRef = useRef(viewStateKey);
  const latestViewStateKeyRef = useRef(viewStateKey);
  const focusHandlerRef = useRef<typeof onFocus>(onFocus);
  const contextMenuHandlerRef = useRef<typeof onContextMenu>(onContextMenu);
  const sourceViewRangeRef = useRef(viewRange);
  const activeViewRangeRef = useRef(viewRange);
  const latestViewRangeRef = useRef(viewRange);
  const pendingEditorFocusRef = useRef(false);
  const hiddenAreaResetSourceRef = useRef({});
  const hasSelectionRef = useRef(false);
  const rightClickSelectionRef = useRef(false);
  const interactionDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
  const didCleanupRef = useRef(false);

  const modelPath = useMemo(() => `output://source/${documentId}`, [documentId]);

  useEffect(() => {
    focusHandlerRef.current = onFocus;
  }, [onFocus]);

  useEffect(() => {
    contextMenuHandlerRef.current = onContextMenu;
  }, [onContextMenu]);

  useEffect(() => {
    latestViewStateKeyRef.current = viewStateKey;
  }, [viewStateKey]);

  useEffect(() => {
    retainSharedEditorModel(modelPath);
    return () => {
      releaseSharedEditorModel(modelPath);
    };
  }, [modelPath]);

  useEffect(() => {
    latestViewRangeRef.current = viewRange;
    sourceViewRangeRef.current = viewRange;
    activeViewRangeRef.current = viewRange;

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    applyOutputViewRange(editor, activeViewRangeRef.current, hiddenAreaResetSourceRef.current);
  }, [viewRange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || currentViewStateKeyRef.current === viewStateKey) {
      return;
    }

    saveEditorViewState(currentViewStateKeyRef.current, editor);
    currentViewStateKeyRef.current = viewStateKey;
    restoreEditorViewState(viewStateKey, editor, {
      hiddenAreaResetSource: hiddenAreaResetSourceRef.current,
    });
    applyOutputViewRange(editor, activeViewRangeRef.current, hiddenAreaResetSourceRef.current);
  }, [viewStateKey]);

  const cleanupEditorRuntime = useCallback((editor?: MonacoEditor.IStandaloneCodeEditor | null) => {
    if (didCleanupRef.current) {
      return;
    }

    didCleanupRef.current = true;

    for (const disposable of interactionDisposablesRef.current) {
      disposable.dispose();
    }
    interactionDisposablesRef.current = [];

    const activeEditor = editor ?? editorRef.current;
    if (activeEditor) {
      saveEditorViewState(currentViewStateKeyRef.current, activeEditor);
    }

    editorRef.current = null;
  }, []);

  const handleBeforeMount = useCallback((monaco: typeof import('monaco-editor')): void => {
    prepareMonacoEditorRuntime(monaco);
  }, []);

  const handleEditorFocus = useCallback((): void => {
    focusHandlerRef.current?.();
  }, []);

  const handleFocus = useCallback((): void => {
    const editor = editorRef.current;
    if (!editor) {
      pendingEditorFocusRef.current = true;
      return;
    }

    editor.focus();
  }, []);

  const handleOpenFind = useCallback((): void => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    void editor.getAction('actions.find')?.run();
  }, []);

  const handleCollapseAll = useCallback(async (): Promise<void> => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (sourceViewRangeRef.current) {
      await setCollapseStateForFoldStart(editor, sourceViewRangeRef.current.startLineNumber, true);
      activeViewRangeRef.current = collapseViewRangeToStartLine(sourceViewRangeRef.current);
      applyOutputViewRange(editor, activeViewRangeRef.current, hiddenAreaResetSourceRef.current);
      return;
    }

    await editor.getAction('editor.foldAll')?.run();
  }, []);

  const handleExpandAll = useCallback(async (): Promise<void> => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (sourceViewRangeRef.current) {
      await setCollapseStateForFoldStart(editor, sourceViewRangeRef.current.startLineNumber, false);
      activeViewRangeRef.current = sourceViewRangeRef.current;
      applyOutputViewRange(editor, activeViewRangeRef.current, hiddenAreaResetSourceRef.current);
      return;
    }

    await editor.getAction('editor.unfoldAll')?.run();
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      didCleanupRef.current = false;
      editorRef.current = editor;
      currentViewStateKeyRef.current = latestViewStateKeyRef.current;
      sourceViewRangeRef.current = latestViewRangeRef.current;
      activeViewRangeRef.current = latestViewRangeRef.current;
      void monaco;
      restoreEditorViewState(currentViewStateKeyRef.current, editor, {
        hiddenAreaResetSource: hiddenAreaResetSourceRef.current,
      });
      applyOutputViewRange(editor, activeViewRangeRef.current, hiddenAreaResetSourceRef.current);
      if (pendingEditorFocusRef.current) {
        pendingEditorFocusRef.current = false;
        editor.focus();
      }

      const nextInteractionDisposables: Array<{ dispose: () => void }> = [
        registerInlineFoldControls(editor),
        editor.onDidChangeCursorSelection((event) => {
          hasSelectionRef.current = !event.selection.isEmpty();
        }),
        editor.onDidChangeHiddenAreas(() => {
          applyOutputViewRange(
            editor,
            activeViewRangeRef.current,
            hiddenAreaResetSourceRef.current,
          );
        }),
        editor.onMouseDown((event) => {
          if (event.event.rightButton) {
            rightClickSelectionRef.current = hasSelectionRef.current;
          } else {
            rightClickSelectionRef.current = false;
          }
          handleEditorFocus();
        }),
        editor.onDidFocusEditorWidget(() => {
          handleEditorFocus();
        }),
        editor.onContextMenu((event) => {
          event.event.preventDefault();
          event.event.stopPropagation();
          contextMenuHandlerRef.current?.({
            anchorX: event.event.posx,
            anchorY: event.event.posy,
            isContentHit:
              event.target.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
              event.target.type === monaco.editor.MouseTargetType.CONTENT_EMPTY,
            position: event.target.position
              ? {
                  lineNumber: event.target.position.lineNumber,
                  column: event.target.position.column,
                }
              : null,
            hasSelection:
              rightClickSelectionRef.current || !(editor.getSelection()?.isEmpty() ?? true),
          });
        }),
      ];

      interactionDisposablesRef.current = nextInteractionDisposables;
    },
    [handleEditorFocus],
  );

  useEffect(() => {
    return () => {
      cleanupEditorRuntime();
    };
  }, [cleanupEditorRuntime]);

  const handleUnmount: OnMount = useCallback(
    (editor) => {
      cleanupEditorRuntime(editor);
    },
    [cleanupEditorRuntime],
  );

  return useMemo(
    () => ({
      beforeMount: handleBeforeMount,
      onMount: handleMount,
      onUnmount: handleUnmount,
      onFocusCapture: handleEditorFocus,
      onMouseDown: handleEditorFocus,
      collapseAll: handleCollapseAll,
      expandAll: handleExpandAll,
      focus: handleFocus,
      openFind: handleOpenFind,
    }),
    [
      handleBeforeMount,
      handleCollapseAll,
      handleEditorFocus,
      handleExpandAll,
      handleFocus,
      handleMount,
      handleOpenFind,
      handleUnmount,
    ],
  );
};
