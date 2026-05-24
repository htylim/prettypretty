import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  InputEditor,
  type InputEditorHandle,
} from '../../../../src/renderer/components/InputEditor';

const {
  prepareMonacoEditorRuntimeMock,
  getInputEditorOptionsMock,
  registerPrimaryModifierFoldToggleMock,
  editorRenderSpy,
  foldRunMock,
  unfoldRunMock,
  getActionMock,
  foldToggleDisposeMock,
  setPositionMock,
  setScrollLeftMock,
  setScrollTopMock,
  revealLineNearTopMock,
} = vi.hoisted(() => ({
  prepareMonacoEditorRuntimeMock: vi.fn(),
  getInputEditorOptionsMock: vi.fn(() => ({
    readOnly: false,
    lineNumbers: 'on',
  })),
  registerPrimaryModifierFoldToggleMock: vi.fn(() => ({ dispose: foldToggleDisposeMock })),
  editorRenderSpy: vi.fn(),
  foldRunMock: vi.fn(async () => undefined),
  unfoldRunMock: vi.fn(async () => undefined),
  getActionMock: vi.fn(),
  foldToggleDisposeMock: vi.fn(),
  setPositionMock: vi.fn(),
  setScrollLeftMock: vi.fn(),
  setScrollTopMock: vi.fn(),
  revealLineNearTopMock: vi.fn(),
}));

vi.mock('../../../../src/renderer/output/monacoEditorRuntime', () => ({
  prepareMonacoEditorRuntime: prepareMonacoEditorRuntimeMock,
}));

vi.mock('../../../../src/renderer/output/monacoThemes', () => ({
  PRETTYPRETTY_LIGHT_THEME: 'prettypretty-light',
  PRETTYPRETTY_DARK_THEME: 'prettypretty-dark',
}));

vi.mock('../../../../src/renderer/output/outputEditorConfig', () => ({
  getInputEditorOptions: getInputEditorOptionsMock,
}));

vi.mock('../../../../src/renderer/output/indentBlockFolding', () => ({
  registerPrimaryModifierFoldToggle: registerPrimaryModifierFoldToggleMock,
}));

type MonacoRenderProps = {
  value?: string;
  theme?: string;
  language?: string;
  options?: Record<string, unknown>;
  beforeMount?: (monaco: typeof import('monaco-editor')) => void;
  onMount?: (
    editor: MonacoEditor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor'),
  ) => void;
  onChange?: (value: string | undefined) => void;
};

const monacoMock = {} as unknown as typeof import('monaco-editor');

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
  getPosition: () => ({ lineNumber: 7, column: 9 }),
  getVisibleRanges: () => [{ startLineNumber: 6 }],
  getScrollLeft: () => 12,
  getScrollTop: () => 240,
  getModel: () => ({
    getLineCount: () => 5,
    getLineMaxColumn: (lineNumber: number) => (lineNumber === 5 ? 4 : 10),
  }),
  setPosition: setPositionMock,
  setScrollLeft: setScrollLeftMock,
  setScrollTop: setScrollTopMock,
  revealLineNearTop: revealLineNearTopMock,
} as unknown as MonacoEditor.IStandaloneCodeEditor;

vi.mock('@monaco-editor/react', async () => {
  const React = await import('react');

  const MockEditor = ({ beforeMount, onMount, onChange, value, ...rest }: MonacoRenderProps) => {
    editorRenderSpy({
      beforeMount,
      onMount,
      onChange,
      value,
      ...rest,
    });

    React.useEffect(() => {
      beforeMount?.(monacoMock);
      onMount?.(editorMock, monacoMock);
    }, [beforeMount, onMount]);

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
    prepareMonacoEditorRuntimeMock.mockClear();
    getInputEditorOptionsMock.mockClear();
    registerPrimaryModifierFoldToggleMock.mockClear();
    editorRenderSpy.mockClear();
    foldRunMock.mockClear();
    unfoldRunMock.mockClear();
    getActionMock.mockClear();
    foldToggleDisposeMock.mockClear();
    setPositionMock.mockClear();
    setScrollLeftMock.mockClear();
    setScrollTopMock.mockClear();
    revealLineNearTopMock.mockClear();
  });

  it('renders Monaco with shared options seam in editable mode', () => {
    render(<InputEditor themeMode="light" indentSize={2} value={'{"a":1}'} onChange={vi.fn()} />);

    expect(prepareMonacoEditorRuntimeMock).toHaveBeenCalledWith(monacoMock);
    expect(getInputEditorOptionsMock).toHaveBeenCalledTimes(1);
    expect(getInputEditorOptionsMock).toHaveBeenCalledWith(2);

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

  it('captures and restores viewport snapshots with clamped line and column', () => {
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

    const snapshot = handleRef.current?.captureViewportSnapshot();
    expect(snapshot).toEqual({
      lineNumber: 7,
      column: 9,
      topLineNumber: 6,
      scrollLeft: 12,
      scrollTop: 240,
    });

    handleRef.current?.restoreViewportSnapshot(snapshot ?? null);

    expect(setPositionMock).toHaveBeenCalledWith({ lineNumber: 5, column: 4 });
    expect(setScrollLeftMock).toHaveBeenCalledWith(12);
    expect(setScrollTopMock).toHaveBeenCalledWith(240);
    expect(revealLineNearTopMock).toHaveBeenCalledWith(5);
    expect(revealLineNearTopMock.mock.invocationCallOrder[0]).toBeLessThan(
      setScrollTopMock.mock.invocationCallOrder[0]!,
    );

    handleRef.current?.restoreViewportSnapshot({
      ...snapshot!,
      lineNumber: 2,
      column: 3,
      topLineNumber: 5,
    });

    expect(revealLineNearTopMock).toHaveBeenLastCalledWith(5);
  });

  it('registers shared fold toggle wiring on mount', () => {
    render(<InputEditor themeMode="light" indentSize={2} value="alpha" onChange={vi.fn()} />);

    expect(registerPrimaryModifierFoldToggleMock).toHaveBeenCalledWith(editorMock);
  });

  it('disposes fold listener on unmount', () => {
    const { unmount } = render(
      <InputEditor themeMode="light" indentSize={2} value="alpha" onChange={vi.fn()} />,
    );

    unmount();

    expect(foldToggleDisposeMock).toHaveBeenCalledTimes(1);
  });
});
