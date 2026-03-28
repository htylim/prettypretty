import Editor, { type OnMount } from '@monaco-editor/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  createOutputContextMenuActions,
  type OutputContextMenuAction,
} from '../output/outputContextMenuActions';
import {
  normalizeOutputEmbeddedSelectionText,
  resolveOutputEmbeddedSelection,
  type OutputEmbeddedCandidate,
} from '../output/outputEmbeddedSelection';
import { getOutputEditorOptions } from '../output/outputEditorConfig';
import { applyOutputViewRange } from '../output/outputViewRange';
import { createOutputEmbeddedHighlightDecorations } from '../output/splitSelectionDecorations';

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
  embeddedCandidate?: OutputEmbeddedCandidate | null | undefined;
  onEmbeddedCandidateChange?: ((candidate: OutputEmbeddedCandidate | null) => void) | undefined;
  onPrettifyInPane?: ((candidate: OutputEmbeddedCandidate) => void) | undefined;
  onPrettifyReplace?: ((candidate: OutputEmbeddedCandidate) => void) | undefined;
  onFocus?: (() => void) | undefined;
  testId?: string | undefined;
};

type MonacoSelectionLike = OutputPaneSourceRange & {
  selectionStartLineNumber: number;
  selectionStartColumn: number;
  positionLineNumber: number;
  positionColumn: number;
};

type OutputContextMenuState = {
  x: number;
  y: number;
  actions: OutputContextMenuAction[];
};

const isCtrlClickContextMenuEvent = (event: MouseEvent): boolean => {
  return event.ctrlKey && event.button === 0;
};

const registerCtrlClickEmbeddedSelection = (
  container: HTMLDivElement,
  editor: MonacoEditor.IStandaloneCodeEditor,
  getValue: () => string,
  getViewRange: () => OutputPaneSourceRange | null,
  onEmbeddedCandidateChange: (candidate: OutputEmbeddedCandidate | null) => void,
): { dispose: () => void } => {
  const handleMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !event.ctrlKey || event.detail !== 1) {
      return;
    }

    if (event.target instanceof Element && event.target.closest('.output-context-menu')) {
      return;
    }

    const target = editor.getTargetAtClientPoint(event.clientX, event.clientY);
    const lineNumber = target?.position?.lineNumber;
    const column = target?.position?.column ?? 1;
    if (!lineNumber) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const value = getValue();
    const viewRange = getViewRange();
    const directCandidate = resolveOutputEmbeddedSelection(
      value,
      {
        type: 'position',
        lineNumber,
        column,
      },
      viewRange,
    );
    if (directCandidate) {
      onEmbeddedCandidateChange(directCandidate);
      return;
    }

    const model = editor.getModel();
    if (!model) {
      onEmbeddedCandidateChange(null);
      return;
    }

    onEmbeddedCandidateChange(
      resolveOutputEmbeddedSelection(
        value,
        {
          type: 'range',
          sourceRange: {
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber,
            endColumn: model.getLineMaxColumn(lineNumber),
          },
        },
        viewRange,
      ),
    );
  };

  container.addEventListener('mousedown', handleMouseDown, true);

  return {
    dispose: () => {
      container.removeEventListener('mousedown', handleMouseDown, true);
    },
  };
};

const collapseViewRangeToStartLine = (viewRange: OutputPaneSourceRange): OutputPaneSourceRange => ({
  ...viewRange,
  endLineNumber: viewRange.startLineNumber,
  endColumn: viewRange.startColumn,
});

const formatSourceRangeForDataAttribute = (
  sourceRange: OutputPaneSourceRange | null,
): string | undefined => {
  if (!sourceRange) {
    return undefined;
  }

  return `${sourceRange.startLineNumber}:${sourceRange.startColumn}-${sourceRange.endLineNumber}:${sourceRange.endColumn}`;
};

const selectionToSourceRange = (selection: MonacoSelectionLike): OutputPaneSourceRange => ({
  startLineNumber: selection.startLineNumber,
  startColumn: selection.startColumn,
  endLineNumber: selection.endLineNumber,
  endColumn: selection.endColumn,
});

const isSelectionEmpty = (selection: MonacoSelectionLike | null): boolean => {
  if (!selection) {
    return true;
  }

  return (
    selection.selectionStartLineNumber === selection.positionLineNumber &&
    selection.selectionStartColumn === selection.positionColumn
  );
};

const getTextForSourceRange = (value: string, sourceRange: OutputPaneSourceRange): string => {
  const lines = value.split('\n');
  const startLineIndex = Math.max(sourceRange.startLineNumber - 1, 0);
  const endLineIndex = Math.min(sourceRange.endLineNumber - 1, lines.length - 1);
  if (startLineIndex > endLineIndex) {
    return '';
  }

  const selectedLines = lines.slice(startLineIndex, endLineIndex + 1);
  if (selectedLines.length === 0) {
    return '';
  }

  if (selectedLines.length === 1) {
    const line = selectedLines[0] ?? '';
    return line.slice(
      Math.max(sourceRange.startColumn - 1, 0),
      Math.max(sourceRange.endColumn - 1, 0),
    );
  }

  selectedLines[0] = selectedLines[0]?.slice(Math.max(sourceRange.startColumn - 1, 0)) ?? '';
  const lastLineIndex = selectedLines.length - 1;
  selectedLines[lastLineIndex] =
    selectedLines[lastLineIndex]?.slice(0, Math.max(sourceRange.endColumn - 1, 0)) ?? '';

  return selectedLines.join('\n');
};

const resolveContextMenuCandidate = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  value: string,
): OutputEmbeddedCandidate | null => {
  const selection = editor.getSelection();
  if (!selection || isSelectionEmpty(selection)) {
    return null;
  }

  const sourceRange = selectionToSourceRange(selection);
  const selectedText = getTextForSourceRange(value, sourceRange);
  const payload = normalizeOutputEmbeddedSelectionText(selectedText);
  if (!payload) {
    return null;
  }

  return {
    sourceRange,
    payload,
  };
};

/**
 * Monaco-backed read-only output editor. It owns pane-local editor state,
 * optional view-range filtering, embedded candidate highlighting, and the
 * renderer-owned output context menu so Electron stays deterministic.
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
      embeddedCandidate = null,
      onEmbeddedCandidateChange,
      onPrettifyInPane,
      onPrettifyReplace,
      onFocus,
      testId = 'output-editor',
    },
    ref,
  ) => {
    const [contextMenuState, setContextMenuState] = useState<OutputContextMenuState | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
    const currentViewStateKeyRef = useRef(viewStateKey);
    const interactionDisposablesRef = useRef<Array<{ dispose: () => void }>>([]);
    const embeddedHighlightDecorationsRef = useRef<ReturnType<
      typeof createOutputEmbeddedHighlightDecorations
    > | null>(null);
    const embeddedCandidateHandlerRef =
      useRef<typeof onEmbeddedCandidateChange>(onEmbeddedCandidateChange);
    const prettifyInPaneHandlerRef = useRef<typeof onPrettifyInPane>(onPrettifyInPane);
    const prettifyReplaceHandlerRef = useRef<typeof onPrettifyReplace>(onPrettifyReplace);
    const focusHandlerRef = useRef<typeof onFocus>(onFocus);
    const sourceViewRangeRef = useRef(viewRange);
    const activeViewRangeRef = useRef(viewRange);
    const valueRef = useRef(value);
    const currentEmbeddedCandidateRef = useRef<OutputEmbeddedCandidate | null>(embeddedCandidate);
    const contextMenuSelectionSnapshotRef = useRef<OutputEmbeddedCandidate | null | undefined>(
      undefined,
    );
    const pendingEditorFocusRef = useRef(false);
    const viewRangeSourceRef = useRef({});
    const options = useMemo(() => getOutputEditorOptions(indentSize), [indentSize]);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;
    const modelPath = useMemo(() => `output://source/${documentId}`, [documentId]);
    const highlightRange = embeddedCandidate?.sourceRange ?? null;
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

    const closeContextMenu = useCallback((): void => {
      contextMenuSelectionSnapshotRef.current = undefined;
      setContextMenuState(null);
    }, []);

    const applyEmbeddedCandidate = useCallback(
      (candidate: OutputEmbeddedCandidate | null): void => {
        currentEmbeddedCandidateRef.current = candidate;
        embeddedCandidateHandlerRef.current?.(candidate);
      },
      [],
    );

    /**
     * Uses Monaco hit testing at the DOM `contextmenu` event point. This keeps
     * right-click behavior stable in real Electron runs where Monaco's
     * right-button mouse hook is not reliable for renderer-owned menus.
     */
    const openContextMenuAtPoint = useCallback((clientX: number, clientY: number): void => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const nextCandidate =
        contextMenuSelectionSnapshotRef.current === undefined
          ? resolveContextMenuCandidate(editor, valueRef.current)
          : contextMenuSelectionSnapshotRef.current;
      contextMenuSelectionSnapshotRef.current = undefined;

      const containerBounds = containerRef.current?.getBoundingClientRect();
      setContextMenuState({
        x: containerBounds ? clientX - containerBounds.left : clientX,
        y: containerBounds ? clientY - containerBounds.top : clientY,
        actions: createOutputContextMenuActions({
          candidate: nextCandidate,
          onPrettifyInPane: prettifyInPaneHandlerRef.current,
          onPrettifyReplace: prettifyReplaceHandlerRef.current,
        }),
      });
    }, []);

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
      valueRef.current = value;
    }, [value]);

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
      currentEmbeddedCandidateRef.current = embeddedCandidate;
      embeddedHighlightDecorationsRef.current?.update(highlightRange);
    }, [embeddedCandidate, highlightRange]);

    useEffect(() => {
      embeddedCandidateHandlerRef.current = onEmbeddedCandidateChange;
    }, [onEmbeddedCandidateChange]);

    useEffect(() => {
      prettifyInPaneHandlerRef.current = onPrettifyInPane;
    }, [onPrettifyInPane]);

    useEffect(() => {
      prettifyReplaceHandlerRef.current = onPrettifyReplace;
    }, [onPrettifyReplace]);

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
        embeddedHighlightDecorationsRef.current?.dispose();
        embeddedHighlightDecorationsRef.current = null;

        if (editor) {
          saveEditorViewState(currentViewStateKeyRef.current, editor);
        }
        editorRef.current = null;
      },
      [],
    );

    useEffect(() => {
      if (!contextMenuState) {
        return;
      }

      const handlePointerDown = (event: MouseEvent): void => {
        const target = event.target;
        if (target instanceof Node && containerRef.current?.contains(target)) {
          return;
        }

        closeContextMenu();
      };

      const handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          closeContextMenu();
        }
      };

      window.addEventListener('mousedown', handlePointerDown, true);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('mousedown', handlePointerDown, true);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [closeContextMenu, contextMenuState]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const handleContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (isCtrlClickContextMenuEvent(event)) {
          closeContextMenu();
          return;
        }

        focusHandlerRef.current?.();
        openContextMenuAtPoint(event.clientX, event.clientY);
      };

      container.addEventListener('contextmenu', handleContextMenu, true);
      return () => {
        container.removeEventListener('contextmenu', handleContextMenu, true);
      };
    }, [closeContextMenu, openContextMenuAtPoint]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const handleMouseDownCapture = (event: MouseEvent): void => {
        if (event.button !== 2) {
          contextMenuSelectionSnapshotRef.current = undefined;
          return;
        }

        const editor = editorRef.current;
        contextMenuSelectionSnapshotRef.current = editor
          ? resolveContextMenuCandidate(editor, valueRef.current)
          : null;
      };

      container.addEventListener('mousedown', handleMouseDownCapture, true);
      return () => {
        container.removeEventListener('mousedown', handleMouseDownCapture, true);
      };
    }, []);

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
      embeddedHighlightDecorationsRef.current = createOutputEmbeddedHighlightDecorations(editor);
      embeddedHighlightDecorationsRef.current.update(highlightRange);
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
        editor.onMouseDown((mouseEvent) => {
          focusHandlerRef.current?.();
          if (mouseEvent.event.browserEvent.button !== 2) {
            closeContextMenu();
          }
        }),
        editor.onDidFocusEditorWidget(() => {
          focusHandlerRef.current?.();
        }),
      ];

      if (onEmbeddedCandidateChange) {
        const container = containerRef.current;
        if (!container) {
          interactionDisposablesRef.current = nextInteractionDisposables;
          return;
        }

        nextInteractionDisposables.push(
          registerCtrlClickEmbeddedSelection(
            container,
            editor,
            () => valueRef.current,
            () => sourceViewRangeRef.current,
            (candidate) => {
              closeContextMenu();
              applyEmbeddedCandidate(candidate);
            },
          ),
        );
      }

      interactionDisposablesRef.current = nextInteractionDisposables;
    };

    return (
      <div
        className="output-editor"
        data-embedded-highlight-range={formatSourceRangeForDataAttribute(highlightRange)}
        data-testid={testId}
        onFocusCapture={() => {
          focusHandlerRef.current?.();
        }}
        onMouseDown={() => {
          focusHandlerRef.current?.();
        }}
        ref={containerRef}
        style={{ position: 'relative' }}
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
        {contextMenuState ? (
          <div
            className="output-context-menu"
            data-testid={`${testId}-context-menu`}
            role="menu"
            style={{
              left: contextMenuState.x,
              top: contextMenuState.y,
            }}
          >
            {contextMenuState.actions.map((action) => (
              <button
                className="output-context-menu-item"
                data-testid={`${testId}-context-menu-${action.id}`}
                disabled={action.disabled}
                key={action.id}
                onClick={() => {
                  closeContextMenu();
                  void action.run();
                }}
                role="menuitem"
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

OutputEditor.displayName = 'OutputEditor';
