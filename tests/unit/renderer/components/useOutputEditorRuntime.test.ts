import { act, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { OutputPaneSourceRange } from '../../../../src/renderer/app/outputPaneDomain';
import { useOutputEditorRuntime } from '../../../../src/renderer/components/useOutputEditorRuntime';

const {
  prepareMonacoEditorRuntimeMock,
  retainSharedEditorModelMock,
  releaseSharedEditorModelMock,
  restoreEditorViewStateMock,
  saveEditorViewStateMock,
  registerInlineFoldControlsMock,
  setCollapseStateForFoldStartMock,
  applyOutputViewRangeMock,
  inlineControlsDisposeMock,
  hiddenAreasDisposeMock,
  mouseDownDisposeMock,
  focusWidgetDisposeMock,
  contextMenuDisposeMock,
  focusMock,
  getActionMock,
  decorationCollectionClearMock,
  decorationCollectionSetMock,
  editorRenderMock,
} = vi.hoisted(() => ({
  prepareMonacoEditorRuntimeMock: vi.fn(),
  retainSharedEditorModelMock: vi.fn(),
  releaseSharedEditorModelMock: vi.fn(),
  restoreEditorViewStateMock: vi.fn(),
  saveEditorViewStateMock: vi.fn(),
  registerInlineFoldControlsMock: vi.fn(() => ({ dispose: inlineControlsDisposeMock })),
  setCollapseStateForFoldStartMock: vi.fn(async (...args: unknown[]) => {
    void args;
    return true;
  }),
  applyOutputViewRangeMock: vi.fn((...args: unknown[]) => {
    void args;
    return undefined;
  }),
  inlineControlsDisposeMock: vi.fn(),
  hiddenAreasDisposeMock: vi.fn(),
  mouseDownDisposeMock: vi.fn(),
  focusWidgetDisposeMock: vi.fn(),
  contextMenuDisposeMock: vi.fn(),
  focusMock: vi.fn(),
  getActionMock: vi.fn(),
  decorationCollectionClearMock: vi.fn(),
  decorationCollectionSetMock: vi.fn(),
  editorRenderMock: vi.fn(),
}));

vi.mock('../../../../src/renderer/output/monacoEditorRuntime', () => ({
  prepareMonacoEditorRuntime: prepareMonacoEditorRuntimeMock,
  retainSharedEditorModel: retainSharedEditorModelMock,
  releaseSharedEditorModel: releaseSharedEditorModelMock,
  restoreEditorViewState: restoreEditorViewStateMock,
  saveEditorViewState: saveEditorViewStateMock,
}));

vi.mock('../../../../src/renderer/editor/monacoFolding', () => ({
  setCollapseStateForFoldStart: (
    editor: unknown,
    foldStartLineNumber: unknown,
    isCollapsed: unknown,
  ) => setCollapseStateForFoldStartMock(editor, foldStartLineNumber, isCollapsed),
}));

vi.mock('../../../../src/renderer/output/inlineFoldControls', () => ({
  registerInlineFoldControls: registerInlineFoldControlsMock,
}));

vi.mock('../../../../src/renderer/output/outputViewRange', () => ({
  applyOutputViewRange: (...args: unknown[]) => applyOutputViewRangeMock(...args),
}));

let hiddenAreasListener: (() => void) | null = null;
let focusWidgetListener: (() => void) | null = null;
let contextMenuListener:
  | ((event: {
      event: {
        preventDefault: () => void;
        stopPropagation: () => void;
        posx: number;
        posy: number;
      };
      target: {
        type: number;
        position: { lineNumber: number; column: number } | null;
      };
    }) => void)
  | null = null;
let selectionIsEmpty = true;

const editorMock = {
  getAction: (id: string): { run: () => Promise<void> } | undefined => {
    getActionMock(id);
    if (id === 'editor.foldAll') {
      return { run: vi.fn(async () => undefined) };
    }

    if (id === 'editor.unfoldAll') {
      return { run: vi.fn(async () => undefined) };
    }

    if (id === 'actions.find') {
      return { run: vi.fn(async () => undefined) };
    }

    return undefined;
  },
  saveViewState: () =>
    ({
      token: 'view-state',
    }) as unknown as MonacoEditor.ICodeEditorViewState,
  focus: focusMock,
  getModel: () =>
    ({
      getLineContent: () => '',
    }) as unknown as MonacoEditor.ITextModel,
  createDecorationsCollection: () => ({
    clear: decorationCollectionClearMock,
    set: decorationCollectionSetMock,
  }),
  render: editorRenderMock,
  onMouseDown: (listener: () => void): { dispose: () => void } => {
    void listener;
    return { dispose: mouseDownDisposeMock };
  },
  onDidChangeHiddenAreas: (listener: () => void): { dispose: () => void } => {
    hiddenAreasListener = listener;
    return { dispose: hiddenAreasDisposeMock };
  },
  onDidFocusEditorWidget: (listener: () => void): { dispose: () => void } => {
    focusWidgetListener = listener;
    return { dispose: focusWidgetDisposeMock };
  },
  onDidChangeCursorSelection: (listener: () => void): { dispose: () => void } => {
    void listener;
    return { dispose: vi.fn() };
  },
  getSelection: () => ({
    isEmpty: () => selectionIsEmpty,
  }),
  onContextMenu: (listener: typeof contextMenuListener): { dispose: () => void } => {
    contextMenuListener = listener;
    return { dispose: contextMenuDisposeMock };
  },
} as unknown as MonacoEditor.IStandaloneCodeEditor;

const monacoMock = {
  editor: {
    MouseTargetType: {
      CONTENT_TEXT: 6,
      CONTENT_EMPTY: 7,
    },
  },
} as unknown as typeof import('monaco-editor');

type RuntimeHandle = ReturnType<typeof useOutputEditorRuntime>;

type HarnessProps = {
  activeExtractedSourceRange?: OutputPaneSourceRange | null;
  documentId: string;
  lineNumberStart?: number | null;
  onToggleExtractedSourcePane?: (content: {
    kind: 'extracted-source';
    value: string;
    sourceRange: OutputPaneSourceRange;
    lineNumberStart: number;
  }) => void;
  viewStateKey: string;
  viewRange?: OutputPaneSourceRange | null;
  onFocus?: () => void;
  onContextMenu?: (request: {
    anchorX: number;
    anchorY: number;
    isContentHit: boolean;
    position: { lineNumber: number; column: number } | null;
    hasSelection: boolean;
  }) => void;
};

const RuntimeHarness = forwardRef<RuntimeHandle, HarnessProps>((props, ref) => {
  const runtime = useOutputEditorRuntime(props);

  useImperativeHandle(ref, () => runtime, [runtime]);

  return null;
});

RuntimeHarness.displayName = 'RuntimeHarness';

describe('useOutputEditorRuntime', () => {
  beforeEach(() => {
    hiddenAreasListener = null;
    focusWidgetListener = null;
    contextMenuListener = null;
    selectionIsEmpty = true;
    prepareMonacoEditorRuntimeMock.mockClear();
    retainSharedEditorModelMock.mockClear();
    releaseSharedEditorModelMock.mockClear();
    restoreEditorViewStateMock.mockClear();
    saveEditorViewStateMock.mockClear();
    registerInlineFoldControlsMock.mockClear();
    setCollapseStateForFoldStartMock.mockClear();
    applyOutputViewRangeMock.mockClear();
    inlineControlsDisposeMock.mockClear();
    hiddenAreasDisposeMock.mockClear();
    mouseDownDisposeMock.mockClear();
    focusWidgetDisposeMock.mockClear();
    contextMenuDisposeMock.mockClear();
    focusMock.mockClear();
    getActionMock.mockClear();
    decorationCollectionClearMock.mockClear();
    decorationCollectionSetMock.mockClear();
    editorRenderMock.mockClear();
  });

  it('owns Monaco lifecycle, focus queueing, and hidden-area updates', () => {
    const onFocus = vi.fn();
    const ref = { current: null as RuntimeHandle | null };
    const viewRange = {
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 2,
    };
    const { unmount } = render(
      createElement(RuntimeHarness, {
        documentId: 'doc-1',
        onFocus,
        viewRange,
        viewStateKey: 'output-root-pane:doc-1',
        ref,
      }),
    );

    expect(retainSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');

    act(() => {
      ref.current?.focus();
      ref.current?.beforeMount(monacoMock);
      ref.current?.onMount(editorMock, monacoMock);
    });

    expect(prepareMonacoEditorRuntimeMock).toHaveBeenCalledWith(monacoMock);
    expect(restoreEditorViewStateMock).toHaveBeenCalledWith(
      'output-root-pane:doc-1',
      editorMock,
      expect.objectContaining({
        hiddenAreaResetSource: expect.any(Object),
      }),
    );
    expect(registerInlineFoldControlsMock).toHaveBeenCalledWith(editorMock);
    expect(applyOutputViewRangeMock).toHaveBeenCalledWith(
      editorMock,
      viewRange,
      expect.any(Object),
    );
    expect(focusMock).toHaveBeenCalledTimes(1);

    act(() => {
      hiddenAreasListener?.();
      ref.current?.onFocusCapture();
      ref.current?.onMouseDown();
      focusWidgetListener?.();
    });

    expect(onFocus).toHaveBeenCalledTimes(3);
    expect(applyOutputViewRangeMock).toHaveBeenCalledTimes(2);

    act(() => {
      ref.current?.onUnmount(editorMock, monacoMock);
    });

    unmount();

    expect(saveEditorViewStateMock).toHaveBeenCalledWith('output-root-pane:doc-1', editorMock);
    expect(inlineControlsDisposeMock).toHaveBeenCalledTimes(1);
    expect(hiddenAreasDisposeMock).toHaveBeenCalledTimes(1);
    expect(mouseDownDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusWidgetDisposeMock).toHaveBeenCalledTimes(1);
    expect(contextMenuDisposeMock).toHaveBeenCalledTimes(1);
    expect(releaseSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');
  });

  it('saves and restores view state when the pane key changes and keeps range-specific fold actions', () => {
    const ref = { current: null as RuntimeHandle | null };
    const viewRange = {
      startLineNumber: 4,
      startColumn: 1,
      endLineNumber: 6,
      endColumn: 2,
    };
    const { rerender } = render(
      createElement(RuntimeHarness, {
        documentId: 'doc-2',
        viewRange,
        viewStateKey: 'output-root-pane:doc-2',
        ref,
      }),
    );

    act(() => {
      ref.current?.beforeMount(monacoMock);
      ref.current?.onMount(editorMock, monacoMock);
    });

    act(() => {
      rerender(
        createElement(RuntimeHarness, {
          documentId: 'doc-2',
          viewRange,
          viewStateKey: 'output-pane-1:content-1',
          ref,
        }),
      );
    });

    expect(saveEditorViewStateMock).toHaveBeenCalledWith('output-root-pane:doc-2', editorMock);
    expect(restoreEditorViewStateMock).toHaveBeenCalledWith(
      'output-pane-1:content-1',
      editorMock,
      expect.objectContaining({
        hiddenAreaResetSource: expect.any(Object),
      }),
    );

    act(() => {
      void ref.current?.collapseAll();
      void ref.current?.expandAll();
    });

    expect(setCollapseStateForFoldStartMock).toHaveBeenNthCalledWith(1, editorMock, 4, true);
    expect(setCollapseStateForFoldStartMock).toHaveBeenNthCalledWith(2, editorMock, 4, false);
    expect(getActionMock).not.toHaveBeenCalledWith('editor.foldAll');
    expect(getActionMock).not.toHaveBeenCalledWith('editor.unfoldAll');
  });

  it('reports context-menu hits with pane coordinates and selection state', () => {
    const onContextMenu = vi.fn();
    const ref = { current: null as RuntimeHandle | null };

    render(
      createElement(RuntimeHarness, {
        documentId: 'doc-3',
        onContextMenu,
        viewStateKey: 'output-root-pane:doc-3',
        ref,
      }),
    );

    act(() => {
      ref.current?.beforeMount(monacoMock);
      ref.current?.onMount(editorMock, monacoMock);
    });

    act(() => {
      contextMenuListener?.({
        event: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          posx: 42,
          posy: 84,
        },
        target: {
          type: 6,
          position: { lineNumber: 3, column: 14 },
        },
      });
    });

    expect(onContextMenu).toHaveBeenCalledWith({
      anchorX: 42,
      anchorY: 84,
      isContentHit: true,
      position: { lineNumber: 3, column: 14 },
      hasSelection: false,
    });

    selectionIsEmpty = false;

    act(() => {
      contextMenuListener?.({
        event: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          posx: 11,
          posy: 22,
        },
        target: {
          type: 2,
          position: { lineNumber: 1, column: 1 },
        },
      });
    });

    expect(onContextMenu).toHaveBeenCalledWith({
      anchorX: 11,
      anchorY: 22,
      isContentHit: false,
      position: { lineNumber: 1, column: 1 },
      hasSelection: true,
    });
  });

  it('forwards extracted-source pane requests and source highlights through the runtime seam', () => {
    const onToggleExtractedSourcePane = vi.fn();
    const ref = { current: null as RuntimeHandle | null };

    render(
      createElement(RuntimeHarness, {
        activeExtractedSourceRange: {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 2,
        },
        documentId: 'doc-4',
        lineNumberStart: 41,
        onToggleExtractedSourcePane,
        viewStateKey: 'output-pane-1:content-1',
        ref,
      }),
    );

    act(() => {
      ref.current?.beforeMount(monacoMock);
      ref.current?.onMount(editorMock, monacoMock);
    });

    expect(registerInlineFoldControlsMock).toHaveBeenCalledWith(
      editorMock,
      expect.objectContaining({
        getActiveExtractedSourceRange: expect.any(Function),
        onToggleExtractedSourcePane: expect.any(Function),
      }),
    );
    expect(decorationCollectionSetMock).toHaveBeenCalledWith([
      expect.objectContaining({
        range: {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 2,
        },
      }),
    ]);
    expect(editorRenderMock).toHaveBeenCalledWith(true);

    const lastCall = registerInlineFoldControlsMock.mock.calls.at(-1) as
      | [
          MonacoEditor.IStandaloneCodeEditor,
          {
            onToggleExtractedSourcePane: (foldStart: {
              lineNumber: number;
              endLineNumber: number;
              sourceRange: OutputPaneSourceRange;
            }) => void;
          },
        ]
      | undefined;
    const registerOptions = lastCall?.[1] as {
      onToggleExtractedSourcePane: (foldStart: {
        lineNumber: number;
        endLineNumber: number;
        sourceRange: OutputPaneSourceRange;
      }) => void;
    };

    act(() => {
      registerOptions.onToggleExtractedSourcePane({
        lineNumber: 2,
        endLineNumber: 6,
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
      });
    });

    expect(onToggleExtractedSourcePane).toHaveBeenCalledWith({
      kind: 'extracted-source',
      value: '\n\n\n\n',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 6,
        endColumn: 2,
      },
      lineNumberStart: 42,
    });
  });
});
