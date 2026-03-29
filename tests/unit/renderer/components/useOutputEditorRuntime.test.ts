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
  focusMock,
  getActionMock,
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
  focusMock: vi.fn(),
  getActionMock: vi.fn(),
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
} as unknown as MonacoEditor.IStandaloneCodeEditor;

const monacoMock = {} as unknown as typeof import('monaco-editor');

type RuntimeHandle = ReturnType<typeof useOutputEditorRuntime>;

type HarnessProps = {
  documentId: string;
  viewStateKey: string;
  viewRange?: OutputPaneSourceRange | null;
  onFocus?: () => void;
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
    focusMock.mockClear();
    getActionMock.mockClear();
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
});
