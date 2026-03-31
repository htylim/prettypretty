import { render } from '@testing-library/react';
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
  editorRenderSpy,
  foldRunMock,
  unfoldRunMock,
  findRunMock,
  focusMock,
  getActionMock,
  inlineControlsDisposeMock,
  focusMouseDownDisposeMock,
  hiddenAreasDisposeMock,
  focusWidgetDisposeMock,
  contextMenuDisposeMock,
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
  setCollapseStateForFoldStartMock: vi.fn(async (...args: unknown[]) => {
    void args;
    return true;
  }),
  applyOutputViewRangeMock: vi.fn((...args: unknown[]) => {
    void args;
    return undefined;
  }),
  editorRenderSpy: vi.fn(),
  foldRunMock: vi.fn(async () => undefined),
  unfoldRunMock: vi.fn(async () => undefined),
  findRunMock: vi.fn(async () => undefined),
  focusMock: vi.fn(),
  getActionMock: vi.fn(),
  inlineControlsDisposeMock: vi.fn(),
  focusMouseDownDisposeMock: vi.fn(),
  hiddenAreasDisposeMock: vi.fn(),
  focusWidgetDisposeMock: vi.fn(),
  contextMenuDisposeMock: vi.fn(),
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
    return {
      token: `view-state-${viewStateCounter++}`,
    } as unknown as MonacoEditor.ICodeEditorViewState;
  },
  focus: focusMock,
  onMouseDown: (listener: () => void): { dispose: () => void } => {
    void listener;
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
    void listener;
    return { dispose: vi.fn() };
  },
  getSelection: () => ({
    isEmpty: () => true,
  }),
  onContextMenu: () => ({ dispose: contextMenuDisposeMock }),
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
    focusWidgetListener = null;
    prepareMonacoEditorRuntimeMock.mockClear();
    retainSharedEditorModelMock.mockClear();
    releaseSharedEditorModelMock.mockClear();
    restoreEditorViewStateMock.mockClear();
    saveEditorViewStateMock.mockClear();
    getOutputEditorOptionsMock.mockClear();
    registerInlineFoldControlsMock.mockClear();
    editorRenderSpy.mockClear();
    foldRunMock.mockClear();
    unfoldRunMock.mockClear();
    findRunMock.mockClear();
    focusMock.mockClear();
    getActionMock.mockClear();
    inlineControlsDisposeMock.mockClear();
    setCollapseStateForFoldStartMock.mockClear();
    applyOutputViewRangeMock.mockClear();
    focusMouseDownDisposeMock.mockClear();
    hiddenAreasDisposeMock.mockClear();
    focusWidgetDisposeMock.mockClear();
    contextMenuDisposeMock.mockClear();
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

  it('uses the provided language override for extracted-source panes', () => {
    render(
      <OutputEditor
        {...createProps({
          value: '"page_info": {\n  "has_next_page": true',
          languageOverride: 'json',
        })}
      />,
    );

    const lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.language).toBe('json');
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

  it('reports focus back to the controller', () => {
    const onFocus = vi.fn();
    render(<OutputEditor {...createProps({ onFocus })} />);

    focusWidgetListener?.();

    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('disposes interaction hooks on unmount', () => {
    const { unmount } = render(<OutputEditor {...createProps()} />);

    unmount();

    expect(releaseSharedEditorModelMock).toHaveBeenCalledWith('output://source/doc-1');
    expect(inlineControlsDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusMouseDownDisposeMock).toHaveBeenCalledTimes(1);
    expect(hiddenAreasDisposeMock).toHaveBeenCalledTimes(1);
    expect(focusWidgetDisposeMock).toHaveBeenCalledTimes(1);
  });
});
