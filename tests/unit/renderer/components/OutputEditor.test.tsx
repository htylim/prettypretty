import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  OutputEditor,
  type OutputEditorHandle,
} from '../../../../src/renderer/components/OutputEditor';

const {
  prepareMonacoEditorRuntimeMock,
  retainSharedEditorModelMock,
  releaseSharedEditorModelMock,
  restoreEditorViewStateMock,
  saveEditorViewStateMock,
  getOutputEditorOptionsMock,
  registerInlineFoldControlsMock,
  setCollapseStateForFoldStartMock,
  applyOutputViewRangeMock,
  createSplitSelectionDecorationsMock,
  resolveStructuralSplitSelectionMock,
  editorRenderSpy,
  foldRunMock,
  unfoldRunMock,
  findRunMock,
  focusMock,
  setScrollTopMock,
  setScrollLeftMock,
  setPositionMock,
  getActionMock,
  inlineControlsDisposeMock,
  splitSelectionDecorationUpdateMock,
  splitSelectionDecorationDisposeMock,
  focusMouseDownDisposeMock,
  splitMouseDownDisposeMock,
  hiddenAreasDisposeMock,
  focusWidgetDisposeMock,
} = vi.hoisted(() => ({
  prepareMonacoEditorRuntimeMock: vi.fn(),
  retainSharedEditorModelMock: vi.fn(),
  releaseSharedEditorModelMock: vi.fn(),
  restoreEditorViewStateMock: vi.fn(),
  saveEditorViewStateMock: vi.fn(),
  getOutputEditorOptionsMock: vi.fn(() => ({
    readOnly: true,
    lineNumbers: 'on',
  })),
  registerInlineFoldControlsMock: vi.fn(() => ({ dispose: inlineControlsDisposeMock })),
  setCollapseStateForFoldStartMock: vi.fn(
    async (editor: unknown, foldStartLineNumber: unknown, isCollapsed: unknown) => {
      void editor;
      void foldStartLineNumber;
      void isCollapsed;
      return true;
    },
  ),
  applyOutputViewRangeMock: vi.fn(),
  createSplitSelectionDecorationsMock: vi.fn(() => ({
    update: splitSelectionDecorationUpdateMock,
    dispose: splitSelectionDecorationDisposeMock,
  })),
  resolveStructuralSplitSelectionMock: vi.fn(),
  editorRenderSpy: vi.fn(),
  foldRunMock: vi.fn(async () => undefined),
  unfoldRunMock: vi.fn(async () => undefined),
  findRunMock: vi.fn(async () => undefined),
  focusMock: vi.fn(),
  setScrollTopMock: vi.fn(),
  setScrollLeftMock: vi.fn(),
  setPositionMock: vi.fn(),
  getActionMock: vi.fn(),
  inlineControlsDisposeMock: vi.fn(),
  splitSelectionDecorationUpdateMock: vi.fn(),
  splitSelectionDecorationDisposeMock: vi.fn(),
  focusMouseDownDisposeMock: vi.fn(),
  splitMouseDownDisposeMock: vi.fn(),
  hiddenAreasDisposeMock: vi.fn(),
  focusWidgetDisposeMock: vi.fn(),
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

vi.mock('../../../../src/renderer/output/monacoThemes', () => ({
  PRETTYPRETTY_LIGHT_THEME: 'prettypretty-light',
  PRETTYPRETTY_DARK_THEME: 'prettypretty-dark',
}));

vi.mock('../../../../src/renderer/output/outputEditorConfig', () => ({
  getOutputEditorOptions: getOutputEditorOptionsMock,
}));

vi.mock('../../../../src/renderer/output/inlineFoldControls', () => ({
  registerInlineFoldControls: registerInlineFoldControlsMock,
}));

vi.mock('../../../../src/renderer/output/outputViewRange', () => ({
  applyOutputViewRange: (...args: unknown[]) => applyOutputViewRangeMock(...args),
}));

vi.mock('../../../../src/renderer/output/splitSelectionDecorations', () => ({
  createSplitSelectionDecorations: createSplitSelectionDecorationsMock,
}));

vi.mock('../../../../src/renderer/output/structuralSplitSelection', () => ({
  resolveStructuralSplitSelection: (...args: unknown[]) =>
    resolveStructuralSplitSelectionMock(...args),
}));

type MonacoRenderProps = {
  value?: string;
  theme?: string;
  language?: string;
  options?: Record<string, unknown>;
  path?: string;
  keepCurrentModel?: boolean;
  saveViewState?: boolean;
  beforeMount?: (monaco: typeof import('monaco-editor')) => void;
  onMount?: (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => void;
  onUnmount?: (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => void;
};

let viewStateCounter = 0;
let mouseDownListeners: Array<
  (event: {
    target: { position?: { lineNumber: number } };
    event: {
      ctrlKey: boolean;
      browserEvent: { detail: number };
      preventDefault: () => void;
      stopPropagation: () => void;
    };
  }) => void
> = [];
let splitMouseDownListener:
  | ((event: {
      target: { position?: { lineNumber: number } };
      event: {
        ctrlKey: boolean;
        browserEvent: { detail: number };
        preventDefault: () => void;
        stopPropagation: () => void;
      };
    }) => void)
  | null = null;
let focusWidgetListener: (() => void) | null = null;

const editorMock = {
  getAction: (id: string): { run: () => Promise<void> } | undefined => {
    getActionMock(id);
    if (id === 'editor.foldAll') {
      return { run: foldRunMock };
    }

    if (id === 'editor.unfoldAll') {
      return { run: unfoldRunMock };
    }

    if (id === 'actions.find') {
      return { run: findRunMock };
    }

    return undefined;
  },
  saveViewState: () => {
    const state = { token: `view-state-${viewStateCounter++}` };
    return state as unknown as MonacoEditor.ICodeEditorViewState;
  },
  setScrollTop: setScrollTopMock,
  setScrollLeft: setScrollLeftMock,
  setPosition: setPositionMock,
  focus: focusMock,
  onMouseDown: (listener: NonNullable<typeof splitMouseDownListener>): { dispose: () => void } => {
    mouseDownListeners.push(listener);
    if (mouseDownListeners.length === 1) {
      return { dispose: focusMouseDownDisposeMock };
    }

    splitMouseDownListener = listener;
    return { dispose: splitMouseDownDisposeMock };
  },
  onDidChangeHiddenAreas: (listener: () => void): { dispose: () => void } => {
    void listener;
    return { dispose: hiddenAreasDisposeMock };
  },
  onDidFocusEditorWidget: (listener: () => void): { dispose: () => void } => {
    focusWidgetListener = listener;
    return { dispose: focusWidgetDisposeMock };
  },
  getModel: vi.fn(() => null),
} as unknown as MonacoEditor.IStandaloneCodeEditor;

const monacoMock = {} as unknown as typeof import('monaco-editor');

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');

  const MockEditor = ({ beforeMount, onMount, onUnmount, value, ...rest }: MonacoRenderProps) => {
    editorRenderSpy({
      beforeMount,
      onMount,
      onUnmount,
      value,
      ...rest,
    });

    React.useEffect(() => {
      beforeMount?.(monacoMock);
      onMount?.(editorMock, monacoMock);
      return () => {
        onUnmount?.(editorMock, monacoMock);
      };
    }, [beforeMount, onMount, onUnmount]);

    return React.createElement('div', { 'data-testid': 'monaco-editor-mock' }, value);
  };

  return { default: MockEditor };
});

const createProps = (
  overrides: Partial<ComponentProps<typeof OutputEditor>> = {},
): ComponentProps<typeof OutputEditor> => ({
  documentId: 'doc-1',
  viewStateKey: 'output-root-pane:doc-1',
  themeMode: 'light',
  indentSize: 2,
  value: '{"a":1}',
  ...overrides,
});

describe('OutputEditor', () => {
  beforeEach(() => {
    viewStateCounter = 0;
    mouseDownListeners = [];
    splitMouseDownListener = null;
    focusWidgetListener = null;
    prepareMonacoEditorRuntimeMock.mockClear();
    retainSharedEditorModelMock.mockClear();
    releaseSharedEditorModelMock.mockClear();
    restoreEditorViewStateMock.mockClear();
    saveEditorViewStateMock.mockClear();
    getOutputEditorOptionsMock.mockClear();
    registerInlineFoldControlsMock.mockClear();
    createSplitSelectionDecorationsMock.mockClear();
    resolveStructuralSplitSelectionMock.mockReset();
    editorRenderSpy.mockClear();
    foldRunMock.mockClear();
    unfoldRunMock.mockClear();
    findRunMock.mockClear();
    focusMock.mockClear();
    setScrollTopMock.mockClear();
    setScrollLeftMock.mockClear();
    setPositionMock.mockClear();
    getActionMock.mockClear();
    inlineControlsDisposeMock.mockClear();
    setCollapseStateForFoldStartMock.mockClear();
    applyOutputViewRangeMock.mockClear();
    splitSelectionDecorationUpdateMock.mockClear();
    splitSelectionDecorationDisposeMock.mockClear();
    focusMouseDownDisposeMock.mockClear();
    splitMouseDownDisposeMock.mockClear();
    hiddenAreasDisposeMock.mockClear();
    focusWidgetDisposeMock.mockClear();
  });

  it('renders Monaco in read-only mode with line numbers and a pane-specific model path', () => {
    render(<OutputEditor {...createProps()} />);

    expect(prepareMonacoEditorRuntimeMock).toHaveBeenCalledWith(monacoMock);
    expect(retainSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');
    expect(getOutputEditorOptionsMock).toHaveBeenCalledTimes(1);
    expect(getOutputEditorOptionsMock).toHaveBeenCalledWith(2);

    const lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.options?.readOnly).toBe(true);
    expect(lastRender.options?.lineNumbers).toBe('on');
    expect(lastRender.language).toBe('json');
    expect(lastRender.path).toBe('output://source/doc-1');
    expect(lastRender.keepCurrentModel).toBe(true);
    expect(lastRender.saveViewState).toBe(false);
  });

  it('updates Monaco theme without mutating content', () => {
    const { rerender } = render(
      <OutputEditor {...createProps({ value: '{"alpha":"beta"}', viewStateKey: 'root:alpha' })} />,
    );

    let lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.theme).toBe('prettypretty-light');
    expect(lastRender.value).toBe('{"alpha":"beta"}');

    rerender(
      <OutputEditor
        {...createProps({
          themeMode: 'dark',
          value: '{"alpha":"beta"}',
          viewStateKey: 'root:alpha',
        })}
      />,
    );

    lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.theme).toBe('prettypretty-dark');
    expect(lastRender.value).toBe('{"alpha":"beta"}');
  });

  it('exposes collapse, expand, focus, and find actions through the ref handle', async () => {
    const handleRef = createRef<OutputEditorHandle>();
    render(<OutputEditor {...createProps({ value: 'const x = 1;' })} ref={handleRef} />);

    await handleRef.current?.collapseAll();
    await handleRef.current?.expandAll();
    await handleRef.current?.openFind();
    handleRef.current?.focus();

    expect(getActionMock).toHaveBeenCalledWith('editor.foldAll');
    expect(getActionMock).toHaveBeenCalledWith('editor.unfoldAll');
    expect(getActionMock).toHaveBeenCalledWith('actions.find');
    expect(foldRunMock).toHaveBeenCalledTimes(1);
    expect(unfoldRunMock).toHaveBeenCalledTimes(1);
    expect(findRunMock).toHaveBeenCalledTimes(1);
    expect(focusMock).toHaveBeenCalledTimes(2);
  });

  it('uses pane-local fold actions for derived source views', async () => {
    const handleRef = createRef<OutputEditorHandle>();
    const viewRange = {
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 2,
    };

    render(<OutputEditor {...createProps({ viewRange })} ref={handleRef} />);

    await handleRef.current?.collapseAll();
    await handleRef.current?.expandAll();

    expect(setCollapseStateForFoldStartMock).toHaveBeenNthCalledWith(1, editorMock, 3, true);
    expect(setCollapseStateForFoldStartMock).toHaveBeenNthCalledWith(2, editorMock, 3, false);
    expect(getActionMock).not.toHaveBeenCalledWith('editor.foldAll');
    expect(getActionMock).not.toHaveBeenCalledWith('editor.unfoldAll');
  });

  it('delegates pane-specific view-state save and restore to the Monaco runtime manager', () => {
    const firstRender = render(
      <OutputEditor
        {...createProps({
          documentId: 'shared-doc',
          viewStateKey: 'output-root-pane:shared-doc',
        })}
      />,
    );
    firstRender.unmount();

    const secondRender = render(
      <OutputEditor
        {...createProps({
          documentId: 'shared-doc',
          viewStateKey: 'output-pane-1:selection-1',
        })}
      />,
    );
    secondRender.unmount();

    render(
      <OutputEditor
        {...createProps({
          documentId: 'shared-doc',
          viewStateKey: 'output-root-pane:shared-doc',
        })}
      />,
    );

    expect(saveEditorViewStateMock).toHaveBeenCalledWith('output-root-pane:shared-doc', editorMock);
    expect(restoreEditorViewStateMock).toHaveBeenCalledWith(
      'output-root-pane:shared-doc',
      editorMock,
      expect.objectContaining({
        hiddenAreaResetSource: expect.any(Object),
      }),
    );
  });

  it('registers inline fold controls for every pane and split gesture only when enabled', async () => {
    const onSplitSelection = vi.fn();
    resolveStructuralSplitSelectionMock.mockResolvedValue({
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    });

    render(<OutputEditor {...createProps({ onSplitSelection })} />);

    expect(registerInlineFoldControlsMock).toHaveBeenCalledWith(editorMock);
    expect(splitMouseDownListener).not.toBeNull();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await act(async () => {
      splitMouseDownListener?.({
        target: { position: { lineNumber: 2 } },
        event: {
          ctrlKey: true,
          browserEvent: { detail: 1 },
          preventDefault,
          stopPropagation,
        },
      });
      await Promise.resolve();
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(resolveStructuralSplitSelectionMock).toHaveBeenCalledWith(editorMock, 2, null);
    expect(onSplitSelection).toHaveBeenCalledWith({
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    });
  });

  it('passes the current pane view range into structural split resolution for derived panes', async () => {
    const onSplitSelection = vi.fn();
    const viewRange = {
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 2,
    };
    resolveStructuralSplitSelectionMock.mockResolvedValue(null);

    render(<OutputEditor {...createProps({ onSplitSelection, viewRange })} />);

    await act(async () => {
      splitMouseDownListener?.({
        target: { position: { lineNumber: 4 } },
        event: {
          ctrlKey: true,
          browserEvent: { detail: 1 },
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        },
      });
      await Promise.resolve();
    });

    expect(resolveStructuralSplitSelectionMock).toHaveBeenCalledWith(editorMock, 4, viewRange);
    expect(onSplitSelection).not.toHaveBeenCalled();
  });

  it('applies pane-local view ranges while keeping a shared source model path', () => {
    const viewRange = {
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 2,
    };
    const { rerender } = render(<OutputEditor {...createProps({ viewRange })} />);

    expect(applyOutputViewRangeMock).toHaveBeenCalledWith(
      editorMock,
      viewRange,
      expect.any(Object),
    );

    rerender(<OutputEditor {...createProps({ viewRange: null })} />);

    expect(applyOutputViewRangeMock).toHaveBeenLastCalledWith(editorMock, null, expect.any(Object));

    const childRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(childRender.path).toBe('output://source/doc-1');
  });

  it('does not register split gesture listeners when split selection is disabled', () => {
    render(<OutputEditor {...createProps()} />);
    expect(splitMouseDownListener).toBeNull();
  });

  it('registers, updates, and disposes split highlight decorations', () => {
    const highlightRange = {
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 2,
    };
    const { rerender, unmount } = render(<OutputEditor {...createProps({ highlightRange })} />);

    expect(createSplitSelectionDecorationsMock).toHaveBeenCalledWith(editorMock);
    expect(splitSelectionDecorationUpdateMock).toHaveBeenCalledWith(highlightRange);

    rerender(<OutputEditor {...createProps({ highlightRange: null })} />);
    expect(splitSelectionDecorationUpdateMock).toHaveBeenLastCalledWith(null);

    unmount();
    expect(splitSelectionDecorationDisposeMock).toHaveBeenCalledTimes(1);
  });

  it('reports focus back to the controller', () => {
    const onFocus = vi.fn();
    render(<OutputEditor {...createProps({ onFocus })} />);

    focusWidgetListener?.();

    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('disposes interaction hooks on unmount', () => {
    const { unmount } = render(<OutputEditor {...createProps({ onSplitSelection: vi.fn() })} />);

    unmount();

    expect(releaseSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');
    expect(inlineControlsDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusMouseDownDisposeMock).toHaveBeenCalledTimes(1);
    expect(splitMouseDownDisposeMock).toHaveBeenCalledTimes(1);
    expect(hiddenAreasDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusWidgetDisposeMock).toHaveBeenCalledTimes(1);
    expect(splitSelectionDecorationDisposeMock).toHaveBeenCalledTimes(1);
  });
});
