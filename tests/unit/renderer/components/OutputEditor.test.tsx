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
  findRunMock,
  focusMock,
  restoreViewStateMock,
  saveViewStateMock,
  setScrollTopMock,
  setScrollLeftMock,
  setPositionMock,
  getActionMock,
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
  findRunMock: vi.fn(async () => undefined),
  focusMock: vi.fn(),
  restoreViewStateMock: vi.fn(),
  saveViewStateMock: vi.fn(),
  setScrollTopMock: vi.fn(),
  setScrollLeftMock: vi.fn(),
  setPositionMock: vi.fn(),
  getActionMock: vi.fn(),
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

let viewStateCounter = 0;

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
    saveViewStateMock(state);
    return state as unknown as MonacoEditor.ICodeEditorViewState;
  },
  restoreViewState: restoreViewStateMock,
  setScrollTop: setScrollTopMock,
  setScrollLeft: setScrollLeftMock,
  setPosition: setPositionMock,
  focus: focusMock,
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
    viewStateCounter = 0;
    configureMonacoMock.mockClear();
    registerMonacoThemesMock.mockClear();
    getOutputEditorOptionsMock.mockClear();
    editorRenderSpy.mockClear();
    foldRunMock.mockClear();
    unfoldRunMock.mockClear();
    findRunMock.mockClear();
    focusMock.mockClear();
    restoreViewStateMock.mockClear();
    saveViewStateMock.mockClear();
    setScrollTopMock.mockClear();
    setScrollLeftMock.mockClear();
    setPositionMock.mockClear();
    getActionMock.mockClear();
  });

  it('renders Monaco in read-only mode with line numbers seam', () => {
    render(<OutputEditor documentId="doc-readonly-1" themeMode="light" value={'{"a":1}'} />);

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
      <OutputEditor documentId="doc-theme-1" themeMode="light" value='{"alpha":"beta"}' />,
    );

    let lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.theme).toBe('prettypretty-light');
    expect(lastRender.value).toBe('{"alpha":"beta"}');

    rerender(<OutputEditor documentId="doc-theme-1" themeMode="dark" value='{"alpha":"beta"}' />);

    lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.theme).toBe('prettypretty-dark');
    expect(lastRender.value).toBe('{"alpha":"beta"}');
  });

  it('exposes collapse, expand, and find actions through ref handle', async () => {
    const handleRef = createRef<OutputEditorHandle>();
    render(
      <OutputEditor
        ref={handleRef}
        documentId="doc-actions-1"
        themeMode="light"
        value="const x = 1;"
      />,
    );

    await handleRef.current?.collapseAll();
    await handleRef.current?.expandAll();
    await handleRef.current?.openFind();

    expect(getActionMock).toHaveBeenCalledWith('editor.foldAll');
    expect(getActionMock).toHaveBeenCalledWith('editor.unfoldAll');
    expect(getActionMock).toHaveBeenCalledWith('actions.find');
    expect(foldRunMock).toHaveBeenCalledTimes(1);
    expect(unfoldRunMock).toHaveBeenCalledTimes(1);
    expect(findRunMock).toHaveBeenCalledTimes(1);
    expect(focusMock).toHaveBeenCalledTimes(1);
  });

  it('persists and restores view state by document id', () => {
    const { rerender } = render(
      <OutputEditor documentId="doc-fold-A" themeMode="light" value='{"a":1}' />,
    );

    rerender(<OutputEditor documentId="doc-fold-B" themeMode="light" value='{"b":2}' />);

    rerender(<OutputEditor documentId="doc-fold-A" themeMode="light" value='{"a":1}' />);

    const restoredStates = restoreViewStateMock.mock.calls.map(
      (args) => args[0] as { token?: string },
    );
    expect(restoredStates.some((state) => state?.token === 'view-state-0')).toBe(true);
  });
});
