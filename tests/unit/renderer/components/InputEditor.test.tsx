import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  InputEditor,
  type InputEditorHandle,
} from '../../../../src/renderer/components/InputEditor';

const {
  configureMonacoMock,
  registerMonacoThemesMock,
  getInputEditorOptionsMock,
  registerCmdClickFoldToggleMock,
  editorRenderSpy,
  setThemeMock,
  foldRunMock,
  unfoldRunMock,
  getActionMock,
  foldToggleDisposeMock,
} = vi.hoisted(() => ({
  configureMonacoMock: vi.fn(),
  registerMonacoThemesMock: vi.fn(),
  getInputEditorOptionsMock: vi.fn(() => ({
    readOnly: false,
    lineNumbers: 'on',
  })),
  registerCmdClickFoldToggleMock: vi.fn(() => ({ dispose: foldToggleDisposeMock })),
  editorRenderSpy: vi.fn(),
  setThemeMock: vi.fn(),
  foldRunMock: vi.fn(async () => undefined),
  unfoldRunMock: vi.fn(async () => undefined),
  getActionMock: vi.fn(),
  foldToggleDisposeMock: vi.fn(),
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
  getInputEditorOptions: getInputEditorOptionsMock,
}));

vi.mock('../../../../src/renderer/output/indentBlockFolding', () => ({
  registerCmdClickFoldToggle: registerCmdClickFoldToggleMock,
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
  onChange?: (value: string | undefined) => void;
};

const monacoMock = {
  editor: {
    setTheme: setThemeMock,
  },
} as unknown as typeof import('monaco-editor');

const editorMock = {
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
} as unknown as MonacoEditor.IStandaloneCodeEditor;

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');

  const MockEditor = ({ onMount, onChange, value, ...rest }: MonacoRenderProps) => {
    editorRenderSpy({
      onMount,
      onChange,
      value,
      ...rest,
    });

    React.useEffect(() => {
      onMount?.(editorMock, monacoMock);
    }, [onMount]);

    return React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'monaco-input-mock',
        onClick: () => onChange?.('next-value'),
      },
      value,
    );
  };

  return { default: MockEditor };
});

describe('InputEditor', () => {
  beforeEach(() => {
    configureMonacoMock.mockClear();
    registerMonacoThemesMock.mockClear();
    getInputEditorOptionsMock.mockClear();
    registerCmdClickFoldToggleMock.mockClear();
    editorRenderSpy.mockClear();
    setThemeMock.mockClear();
    foldRunMock.mockClear();
    unfoldRunMock.mockClear();
    getActionMock.mockClear();
    foldToggleDisposeMock.mockClear();
  });

  it('renders Monaco with shared options seam in editable mode', () => {
    render(<InputEditor themeMode="light" indentSize={2} value={'{"a":1}'} onChange={vi.fn()} />);

    expect(configureMonacoMock).toHaveBeenCalledTimes(1);
    expect(registerMonacoThemesMock).toHaveBeenCalledTimes(1);
    expect(getInputEditorOptionsMock).toHaveBeenCalledTimes(1);
    expect(getInputEditorOptionsMock).toHaveBeenCalledWith(2);
    expect(setThemeMock).toHaveBeenCalledWith('prettypretty-light');

    const lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    expect(lastRender.options?.readOnly).toBe(false);
    expect(lastRender.options?.lineNumbers).toBe('on');
    expect(lastRender.language).toBe('json');
  });

  it('forwards Monaco change events to input callback', () => {
    const onChange = vi.fn();
    render(<InputEditor themeMode="light" indentSize={2} value="alpha" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('monaco-input-mock'));

    expect(onChange).toHaveBeenCalledWith('next-value');
  });

  it('normalizes undefined Monaco change payloads to empty string', () => {
    const onChange = vi.fn();
    render(<InputEditor themeMode="light" indentSize={2} value="alpha" onChange={onChange} />);

    const lastRender = editorRenderSpy.mock.calls.at(-1)?.[0] as MonacoRenderProps;
    lastRender.onChange?.(undefined);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('exposes collapse and expand actions through ref handle', async () => {
    const handleRef = createRef<InputEditorHandle>();
    render(
      <InputEditor
        ref={handleRef}
        themeMode="light"
        indentSize={2}
        value="alpha"
        onChange={vi.fn()}
      />,
    );

    await handleRef.current?.collapseAll();
    await handleRef.current?.expandAll();

    expect(getActionMock).toHaveBeenCalledWith('editor.foldAll');
    expect(getActionMock).toHaveBeenCalledWith('editor.unfoldAll');
    expect(foldRunMock).toHaveBeenCalledTimes(1);
    expect(unfoldRunMock).toHaveBeenCalledTimes(1);
  });

  it('registers shared fold toggle wiring on mount', () => {
    render(<InputEditor themeMode="light" indentSize={2} value="alpha" onChange={vi.fn()} />);

    expect(registerCmdClickFoldToggleMock).toHaveBeenCalledWith(editorMock);
  });

  it('disposes fold listener on unmount', () => {
    const { unmount } = render(
      <InputEditor themeMode="light" indentSize={2} value="alpha" onChange={vi.fn()} />,
    );

    unmount();

    expect(foldToggleDisposeMock).toHaveBeenCalledTimes(1);
  });
});
