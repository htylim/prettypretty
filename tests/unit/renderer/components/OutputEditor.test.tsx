import { act, fireEvent, render, screen } from '@testing-library/react';
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
  createOutputEmbeddedHighlightDecorationsMock,
  resolveOutputEmbeddedSelectionMock,
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
  embeddedHighlightDecorationUpdateMock,
  embeddedHighlightDecorationDisposeMock,
  focusMouseDownDisposeMock,
  hiddenAreasDisposeMock,
  focusWidgetDisposeMock,
  selectionChangeDisposeMock,
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
  createOutputEmbeddedHighlightDecorationsMock: vi.fn(() => ({
    update: embeddedHighlightDecorationUpdateMock,
    dispose: embeddedHighlightDecorationDisposeMock,
  })),
  resolveOutputEmbeddedSelectionMock: vi.fn(),
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
  embeddedHighlightDecorationUpdateMock: vi.fn(),
  embeddedHighlightDecorationDisposeMock: vi.fn(),
  focusMouseDownDisposeMock: vi.fn(),
  hiddenAreasDisposeMock: vi.fn(),
  focusWidgetDisposeMock: vi.fn(),
  selectionChangeDisposeMock: vi.fn(),
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
  createOutputEmbeddedHighlightDecorations: createOutputEmbeddedHighlightDecorationsMock,
}));

vi.mock('../../../../src/renderer/output/outputEmbeddedSelection', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/renderer/output/outputEmbeddedSelection')
    >();
  return {
    ...actual,
    resolveOutputEmbeddedSelection: (...args: unknown[]) =>
      resolveOutputEmbeddedSelectionMock(...args),
  };
});

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
let currentSelection: {
  selectionStartLineNumber: number;
  selectionStartColumn: number;
  positionLineNumber: number;
  positionColumn: number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} | null = null;
type MonacoMouseDownListener = (event: {
  target: { position?: { lineNumber: number; column: number } };
  event: {
    ctrlKey: boolean;
    browserEvent: { detail: number; button: number };
    preventDefault: () => void;
    stopPropagation: () => void;
  };
}) => void;

let mouseDownListeners: MonacoMouseDownListener[] = [];
let currentContextMenuTargetPosition: { lineNumber: number; column: number } | null = null;
let focusWidgetListener: (() => void) | null = null;
let selectionChangeListener: (() => void) | null = null;

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
  getSelection: vi.fn(() => currentSelection),
  saveViewState: () => {
    const state = { token: `view-state-${viewStateCounter++}` };
    return state as unknown as MonacoEditor.ICodeEditorViewState;
  },
  getTargetAtClientPoint: vi.fn(() =>
    currentContextMenuTargetPosition
      ? {
          position: currentContextMenuTargetPosition,
        }
      : null,
  ),
  setScrollTop: setScrollTopMock,
  setScrollLeft: setScrollLeftMock,
  setPosition: setPositionMock,
  focus: focusMock,
  onMouseDown: (listener: MonacoMouseDownListener): { dispose: () => void } => {
    mouseDownListeners.push(listener);
    return { dispose: focusMouseDownDisposeMock };
  },
  onDidChangeHiddenAreas: (listener: () => void): { dispose: () => void } => {
    void listener;
    return { dispose: hiddenAreasDisposeMock };
  },
  onDidFocusEditorWidget: (listener: () => void): { dispose: () => void } => {
    focusWidgetListener = listener;
    return { dispose: focusWidgetDisposeMock };
  },
  onDidChangeCursorSelection: (listener: () => void): { dispose: () => void } => {
    selectionChangeListener = listener;
    return { dispose: selectionChangeDisposeMock };
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
    currentSelection = null;
    mouseDownListeners = [];
    currentContextMenuTargetPosition = null;
    focusWidgetListener = null;
    selectionChangeListener = null;
    prepareMonacoEditorRuntimeMock.mockClear();
    retainSharedEditorModelMock.mockClear();
    releaseSharedEditorModelMock.mockClear();
    restoreEditorViewStateMock.mockClear();
    saveEditorViewStateMock.mockClear();
    getOutputEditorOptionsMock.mockClear();
    registerInlineFoldControlsMock.mockClear();
    createOutputEmbeddedHighlightDecorationsMock.mockClear();
    resolveOutputEmbeddedSelectionMock.mockReset();
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
    embeddedHighlightDecorationUpdateMock.mockClear();
    embeddedHighlightDecorationDisposeMock.mockClear();
    focusMouseDownDisposeMock.mockClear();
    hiddenAreasDisposeMock.mockClear();
    focusWidgetDisposeMock.mockClear();
    selectionChangeDisposeMock.mockClear();
  });

  it('renders Monaco in read-only mode with line numbers and a pane-specific model path', () => {
    render(<OutputEditor {...createProps()} />);

    expect(prepareMonacoEditorRuntimeMock).toHaveBeenCalledWith(monacoMock);
    expect(retainSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');
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
          viewStateKey: 'output-pane-1:content-1',
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

  it('registers inline fold controls and updates the embedded highlight on ctrl-click', () => {
    const onEmbeddedCandidateChange = vi.fn();
    resolveOutputEmbeddedSelectionMock.mockReturnValue({
      payload: '{"nested":true}',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    });

    render(<OutputEditor {...createProps({ onEmbeddedCandidateChange })} />);

    expect(registerInlineFoldControlsMock).toHaveBeenCalledWith(editorMock);
    currentContextMenuTargetPosition = { lineNumber: 2, column: 7 };

    fireEvent.mouseDown(screen.getByTestId('output-editor'), {
      button: 0,
      ctrlKey: true,
      detail: 1,
      clientX: 24,
      clientY: 48,
    });

    expect(resolveOutputEmbeddedSelectionMock).toHaveBeenCalledWith(
      '{"a":1}',
      {
        type: 'position',
        lineNumber: 2,
        column: 7,
      },
      null,
    );
    expect(onEmbeddedCandidateChange).toHaveBeenCalledWith({
      payload: '{"nested":true}',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    });
  });

  it('uses the exact current selection for pane prettify actions', async () => {
    const onEmbeddedCandidateChange = vi.fn();
    const onPrettifyInPane = vi.fn(async () => undefined);
    const onPrettifyReplace = vi.fn(async () => undefined);
    const value = '{"payload":"{\\"nested\\":true}"}';
    const selectedSnippet = '"{\\"nested\\":true}"';
    const selectionStartOffset = value.indexOf(selectedSnippet);
    const selectionStartColumn = selectionStartOffset + 1;
    const selectionEndColumn = selectionStartColumn + selectedSnippet.length;
    currentSelection = {
      selectionStartLineNumber: 1,
      selectionStartColumn,
      positionLineNumber: 1,
      positionColumn: selectionEndColumn,
      startLineNumber: 1,
      startColumn: selectionStartColumn,
      endLineNumber: 1,
      endColumn: selectionEndColumn,
    };

    render(
      <OutputEditor
        {...createProps({
          value,
          onEmbeddedCandidateChange,
          onPrettifyInPane,
          onPrettifyReplace,
        })}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 24,
      clientY: 48,
    });

    expect(resolveOutputEmbeddedSelectionMock).not.toHaveBeenCalled();
    expect(onEmbeddedCandidateChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('output-editor-context-menu')).toHaveStyle({
      left: '24px',
      top: '48px',
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('output-editor-context-menu-prettify-in-pane'));
    });

    expect(onPrettifyInPane).toHaveBeenCalledWith({
      payload: '{"nested":true}',
      sourceRange: {
        startLineNumber: 1,
        startColumn: selectionStartColumn,
        endLineNumber: 1,
        endColumn: selectionEndColumn,
      },
    });
    expect(screen.queryByTestId('output-editor-context-menu')).toBeNull();

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 18,
      clientY: 36,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('output-editor-context-menu-prettify-replace'));
    });

    expect(onPrettifyReplace).toHaveBeenCalledWith({
      payload: '{"nested":true}',
      sourceRange: {
        startLineNumber: 1,
        startColumn: selectionStartColumn,
        endLineNumber: 1,
        endColumn: selectionEndColumn,
      },
    });
  });

  it('keeps the last non-empty selection for context-menu actions when right click collapses Monaco selection', async () => {
    const onPrettifyInPane = vi.fn(async () => undefined);
    const value = '{"payload":"{\\"nested\\":true}"}';
    const selectedSnippet = '"{\\"nested\\":true}"';
    const selectionStartOffset = value.indexOf(selectedSnippet);
    const selectionStartColumn = selectionStartOffset + 1;
    const selectionEndColumn = selectionStartColumn + selectedSnippet.length;
    currentSelection = {
      selectionStartLineNumber: 1,
      selectionStartColumn,
      positionLineNumber: 1,
      positionColumn: selectionEndColumn,
      startLineNumber: 1,
      startColumn: selectionStartColumn,
      endLineNumber: 1,
      endColumn: selectionEndColumn,
    };

    render(
      <OutputEditor
        {...createProps({
          value,
          onPrettifyInPane,
        })}
      />,
    );

    selectionChangeListener?.();
    currentSelection = null;

    fireEvent.mouseDown(screen.getByTestId('output-editor'), {
      button: 2,
    });
    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 24,
      clientY: 48,
    });

    expect(screen.getByTestId('output-editor-context-menu-prettify-in-pane')).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('output-editor-context-menu-prettify-in-pane'));
    });

    expect(onPrettifyInPane).toHaveBeenCalledWith({
      payload: '{"nested":true}',
      sourceRange: {
        startLineNumber: 1,
        startColumn: selectionStartColumn,
        endLineNumber: 1,
        endColumn: selectionEndColumn,
      },
    });
  });

  it('allows whole-document selections to drive context-menu actions in derived panes', async () => {
    const onPrettifyInPane = vi.fn(async () => undefined);
    const onPrettifyReplace = vi.fn(async () => undefined);
    const value = '{\n  "nested": true\n}';
    currentSelection = {
      selectionStartLineNumber: 1,
      selectionStartColumn: 1,
      positionLineNumber: 3,
      positionColumn: 2,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 2,
    };

    render(
      <OutputEditor
        {...createProps({
          value,
          viewRange: {
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: 3,
            endColumn: 2,
          },
          onPrettifyInPane,
          onPrettifyReplace,
        })}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 24,
      clientY: 48,
    });

    expect(screen.getByTestId('output-editor-context-menu-prettify-in-pane')).not.toBeDisabled();
    expect(screen.getByTestId('output-editor-context-menu-prettify-replace')).not.toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('output-editor-context-menu-prettify-in-pane'));
    });

    expect(onPrettifyInPane).toHaveBeenCalledWith({
      payload: '{\n  "nested": true\n}',
      sourceRange: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 2,
      },
    });

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 18,
      clientY: 36,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('output-editor-context-menu-prettify-replace'));
    });

    expect(onPrettifyReplace).toHaveBeenCalledWith({
      payload: '{\n  "nested": true\n}',
      sourceRange: {
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 2,
      },
    });
  });

  it('suppresses renderer context-menu opening for ctrl-click contextmenu events', () => {
    render(<OutputEditor {...createProps({ onEmbeddedCandidateChange: vi.fn() })} />);

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      button: 0,
      ctrlKey: true,
      clientX: 24,
      clientY: 48,
    });

    expect(screen.queryByTestId('output-editor-context-menu')).toBeNull();
  });

  it('shows disabled context-menu actions when there is no selection', async () => {
    const onPrettifyInPane = vi.fn(async () => undefined);
    const embeddedCandidate = {
      payload: '{"id":1}',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 14,
        endLineNumber: 2,
        endColumn: 22,
      },
    };

    currentSelection = null;

    render(
      <OutputEditor
        {...createProps({
          embeddedCandidate,
          onPrettifyInPane,
        })}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 24,
      clientY: 48,
    });

    expect(screen.getByTestId('output-editor-context-menu-prettify-in-pane')).toBeDisabled();
    expect(screen.getByTestId('output-editor-context-menu-prettify-replace')).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByTestId('output-editor-context-menu-prettify-in-pane'));
    });

    expect(onPrettifyInPane).not.toHaveBeenCalled();
  });

  it('shows disabled context-menu actions when the current selection is not a valid embedded candidate', async () => {
    const value = '{"payload":"{\\"nested\\":true}"}';
    currentSelection = {
      selectionStartLineNumber: 1,
      selectionStartColumn: 1,
      positionLineNumber: 1,
      positionColumn: value.length + 1,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: value.length + 1,
    };

    render(<OutputEditor {...createProps({ value })} />);

    fireEvent.contextMenu(screen.getByTestId('output-editor'), {
      clientX: 24,
      clientY: 48,
    });

    expect(screen.getByTestId('output-editor-context-menu-prettify-in-pane')).toBeDisabled();
    expect(screen.getByTestId('output-editor-context-menu-prettify-replace')).toBeDisabled();
  });

  it('passes the current pane view range into embedded resolution and clears when no candidate matches', () => {
    const onEmbeddedCandidateChange = vi.fn();
    const viewRange = {
      startLineNumber: 3,
      startColumn: 1,
      endLineNumber: 5,
      endColumn: 2,
    };
    resolveOutputEmbeddedSelectionMock.mockReturnValue(null);

    render(<OutputEditor {...createProps({ onEmbeddedCandidateChange, viewRange })} />);

    currentContextMenuTargetPosition = { lineNumber: 4, column: 3 };

    fireEvent.mouseDown(screen.getByTestId('output-editor'), {
      button: 0,
      ctrlKey: true,
      detail: 1,
      clientX: 24,
      clientY: 48,
    });

    expect(resolveOutputEmbeddedSelectionMock).toHaveBeenCalledWith(
      '{"a":1}',
      {
        type: 'position',
        lineNumber: 4,
        column: 3,
      },
      viewRange,
    );
    expect(onEmbeddedCandidateChange).toHaveBeenCalledWith(null);
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

  it('does not register ctrl-click highlight listeners when embedded selection is disabled', () => {
    render(<OutputEditor {...createProps()} />);
    expect(mouseDownListeners).toHaveLength(1);
  });

  it('registers, updates, and disposes embedded highlight decorations', () => {
    const embeddedCandidate = {
      payload: '{"nested":true}',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    };
    const { rerender, unmount } = render(<OutputEditor {...createProps({ embeddedCandidate })} />);

    expect(createOutputEmbeddedHighlightDecorationsMock).toHaveBeenCalledWith(editorMock);
    expect(embeddedHighlightDecorationUpdateMock).toHaveBeenCalledWith(
      embeddedCandidate.sourceRange,
    );

    rerender(<OutputEditor {...createProps({ embeddedCandidate: null })} />);
    expect(embeddedHighlightDecorationUpdateMock).toHaveBeenLastCalledWith(null);

    unmount();
    expect(embeddedHighlightDecorationDisposeMock).toHaveBeenCalledTimes(1);
  });

  it('reports focus back to the controller', () => {
    const onFocus = vi.fn();
    render(<OutputEditor {...createProps({ onFocus })} />);

    focusWidgetListener?.();

    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('disposes interaction hooks on unmount', () => {
    const { unmount } = render(
      <OutputEditor {...createProps({ onEmbeddedCandidateChange: vi.fn() })} />,
    );

    unmount();

    expect(releaseSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');
    expect(inlineControlsDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusMouseDownDisposeMock).toHaveBeenCalledTimes(1);
    expect(hiddenAreasDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusWidgetDisposeMock).toHaveBeenCalledTimes(1);
    expect(embeddedHighlightDecorationDisposeMock).toHaveBeenCalledTimes(1);
  });
});
