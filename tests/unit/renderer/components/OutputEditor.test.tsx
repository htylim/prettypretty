import { render } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  OutputEditor,
  type OutputEditorHandle,
} from '../../../../src/renderer/components/OutputEditor';

const {
  configureMonacoMock,
  registerMonacoThemesMock,
  getOutputEditorOptionsMock,
  editorRenderSpy,
  foldRunMock,
  unfoldRunMock,
  restoreViewStateMock,
  saveViewStateMock,
  deltaDecorationsMock,
  setScrollTopMock,
  setScrollLeftMock,
  setPositionMock,
  getActionMock,
  currentValueRef,
} = vi.hoisted(() => ({
  configureMonacoMock: vi.fn(),
  registerMonacoThemesMock: vi.fn(),
  getOutputEditorOptionsMock: vi.fn(() => ({
    readOnly: true,
    lineNumbers: 'on',
  })),
  editorRenderSpy: vi.fn(),
  foldRunMock: vi.fn(async () => undefined),
  unfoldRunMock: vi.fn(async () => undefined),
  restoreViewStateMock: vi.fn(),
  saveViewStateMock: vi.fn(),
  deltaDecorationsMock: vi.fn(),
  setScrollTopMock: vi.fn(),
  setScrollLeftMock: vi.fn(),
  setPositionMock: vi.fn(),
  getActionMock: vi.fn(),
  currentValueRef: { current: '' },
}));

vi.mock('../../../../src/renderer/output/configureMonaco', () => ({
  configureMonaco: configureMonacoMock,
}));

vi.mock('../../../../src/renderer/output/monacoThemes', () => ({
  PRETTYPRETTY_LIGHT_THEME: 'prettypretty-light',
  PRETTYPRETTY_DARK_THEME: 'prettypretty-dark',
  registerMonacoThemes: registerMonacoThemesMock,
}));

vi.mock('../../../../src/renderer/output/outputEditorConfig', () => ({
  getOutputEditorOptions: getOutputEditorOptionsMock,
}));

type MonacoRenderProps = {
  value?: string;
  theme?: string;
  language?: string;
  options?: Record<string, unknown>;
  onMount?: (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => void;
  onUnmount?: (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => void;
};

let decorationCounter = 0;
let viewStateCounter = 0;

const getPositionAt = (offset: number): { lineNumber: number; column: number } => {
  const bounded = Math.max(0, Math.min(offset, currentValueRef.current.length));
  const before = currentValueRef.current.slice(0, bounded);
  const lines = before.split('\n');
  const lastLine = lines.at(-1) ?? '';

  return {
    lineNumber: lines.length,
    column: lastLine.length + 1,
  };
};

const modelMock = {
  getValue: () => currentValueRef.current,
  getPositionAt,
};

const editorMock = {
  getModel: () => modelMock,
  deltaDecorations: (
    _oldDecorations: string[],
    nextDecorations: MonacoEditor.IModelDeltaDecoration[],
  ): string[] => {
    deltaDecorationsMock(_oldDecorations, nextDecorations);
    return nextDecorations.map(() => `decoration-${decorationCounter++}`);
  },
  getAction: (id: string): { run: () => Promise<void> } | undefined => {
    getActionMock(id);
    if (id === 'editor.foldAll') {
      return { run: foldRunMock };
    }

    if (id === 'editor.unfoldAll') {
      return { run: unfoldRunMock };
    }

    return undefined;
  },
  saveViewState: () => {
    const state = { token: `view-state-${viewStateCounter++}` };
    saveViewStateMock(state);
    return state as unknown as MonacoEditor.ICodeEditorViewState;
  },
  restoreViewState: restoreViewStateMock,
  setScrollTop: setScrollTopMock,
  setScrollLeft: setScrollLeftMock,
  setPosition: setPositionMock,
} as unknown as MonacoEditor.IStandaloneCodeEditor;

const monacoMock = {
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
  },
} as unknown as typeof import('monaco-editor');

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');

  const MockEditor = ({ onMount, onUnmount, value, ...rest }: MonacoRenderProps) => {
    editorRenderSpy({
      onMount,
      onUnmount,
      value,
      ...rest,
    });

    React.useEffect(() => {
      currentValueRef.current = value ?? '';
    }, [value]);

    React.useEffect(() => {
      onMount?.(editorMock, monacoMock);
      return () => {
        onUnmount?.(editorMock, monacoMock);
      };
    }, [onMount, onUnmount]);

    return React.createElement('div', { 'data-testid': 'monaco-editor-mock' }, value);
  };

  return { default: MockEditor };
});

describe('OutputEditor', () => {
  beforeEach(() => {
    currentValueRef.current = '';
    decorationCounter = 0;
    viewStateCounter = 0;
    configureMonacoMock.mockClear();
    registerMonacoThemesMock.mockClear();
    getOutputEditorOptionsMock.mockClear();
    editorRenderSpy.mockClear();
    foldRunMock.mockClear();
    unfoldRunMock.mockClear();
    restoreViewStateMock.mockClear();
    saveViewStateMock.mockClear();
    deltaDecorationsMock.mockClear();
    setScrollTopMock.mockClear();
    setScrollLeftMock.mockClear();
    setPositionMock.mockClear();
    getActionMock.mockClear();
  });

  it('renders Monaco in read-only mode with line numbers seam', () => {
    render(
      <OutputEditor
        documentId="doc-readonly-1"
        searchQuery=""
        themeMode="light"
        value={'{"a":1}'}
      />,
    );

    expect(configureMonacoMock).toHaveBeenCalledTimes(1);
    expect(registerMonacoThemesMock).toHaveBeenCalledTimes(1);
    expect(getOutputEditorOptionsMock).toHaveBeenCalledTimes(1);

    const lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.options?.readOnly).toBe(true);
    expect(lastRender.options?.lineNumbers).toBe('on');
    expect(lastRender.language).toBe('json');
  });

  it('updates Monaco theme without mutating content', () => {
    const { rerender } = render(
      <OutputEditor
        documentId="doc-theme-1"
        searchQuery=""
        themeMode="light"
        value={'{"alpha":"beta"}'}
      />,
    );

    let lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.theme).toBe('prettypretty-light');
    expect(lastRender.value).toBe('{"alpha":"beta"}');

    rerender(
      <OutputEditor
        documentId="doc-theme-1"
        searchQuery=""
        themeMode="dark"
        value={'{"alpha":"beta"}'}
      />,
    );

    lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.theme).toBe('prettypretty-dark');
    expect(lastRender.value).toBe('{"alpha":"beta"}');
  });

  it('decorates search matches without mutating text', () => {
    render(
      <OutputEditor
        documentId="doc-search-1"
        searchQuery="alpha"
        themeMode="light"
        value={'{"a":"Alpha"}\n{"b":"alpha"}'}
      />,
    );

    const lastDeltaCall = deltaDecorationsMock.mock.calls.at(-1);
    expect(lastDeltaCall).toBeDefined();
    const decorations = lastDeltaCall?.[1] as MonacoEditor.IModelDeltaDecoration[];
    expect(decorations).toHaveLength(2);
    expect(decorations[0]?.options.inlineClassName).toBe('output-search-match');
    expect(currentValueRef.current).toBe('{"a":"Alpha"}\n{"b":"alpha"}');
  });

  it('exposes collapse and expand actions through ref handle', async () => {
    const handleRef = createRef<OutputEditorHandle>();
    render(
      <OutputEditor
        ref={handleRef}
        documentId="doc-actions-1"
        searchQuery=""
        themeMode="light"
        value="const x = 1;"
      />,
    );

    await handleRef.current?.collapseAll();
    await handleRef.current?.expandAll();

    expect(getActionMock).toHaveBeenCalledWith('editor.foldAll');
    expect(getActionMock).toHaveBeenCalledWith('editor.unfoldAll');
    expect(foldRunMock).toHaveBeenCalledTimes(1);
    expect(unfoldRunMock).toHaveBeenCalledTimes(1);
  });

  it('persists and restores view state by document id', () => {
    const { rerender } = render(
      <OutputEditor documentId="doc-fold-A" searchQuery="" themeMode="light" value={'{"a":1}'} />,
    );

    rerender(
      <OutputEditor documentId="doc-fold-B" searchQuery="" themeMode="light" value={'{"b":2}'} />,
    );

    rerender(
      <OutputEditor documentId="doc-fold-A" searchQuery="" themeMode="light" value={'{"a":1}'} />,
    );

    const restoredStates = restoreViewStateMock.mock.calls.map(
      (args) => args[0] as { token?: string },
    );
    expect(restoredStates.some((state) => state?.token === 'view-state-0')).toBe(true);
  });
});
