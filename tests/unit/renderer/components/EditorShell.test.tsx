import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EditorShell } from '../../../../src/renderer/components/EditorShell';
import type { InputEditorHandle } from '../../../../src/renderer/components/InputEditor';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';

vi.mock('../../../../src/renderer/components/InputEditor', async () => {
  const React = await import('react');

  return {
    InputEditor: React.forwardRef(
      (
        { value, onChange }: { value: string; onChange: (value: string) => void },
        ref: React.ForwardedRef<unknown>,
      ) => {
        void ref;
        return React.createElement('textarea', {
          'data-testid': 'input-editor',
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        });
      },
    ),
  };
});

vi.mock('../../../../src/renderer/components/OutputEditor', async () => {
  const React = await import('react');

  return {
    OutputEditor: React.forwardRef(() =>
      React.createElement('div', { 'data-testid': 'output-editor' }),
    ),
  };
});

const createOutputEditorRef = () => createRef<OutputEditorHandle>();
const createInputEditorRef = () => createRef<InputEditorHandle>();

describe('EditorShell', () => {
  it('renders empty state when input is empty', () => {
    const onOpenFile = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorShell
        paneMode="input"
        themeMode="light"
        indentSize={2}
        inputText=""
        outputText=""
        outputDocumentId="doc-1"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={vi.fn()}
        onIngestInput={vi.fn()}
        onOpenFile={onOpenFile}
      />,
    );

    const cta = screen.getByTestId('empty-state-cta');

    expect(screen.getAllByTestId('empty-state-cta')).toHaveLength(1);
    expect(cta).toHaveTextContent(/^Paste, Drop or Click$/);

    fireEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('renders editable input editor and uses edit callback only', () => {
    const onEditInputChange = vi.fn();
    const onIngestInput = vi.fn();

    render(
      <EditorShell
        paneMode="input"
        themeMode="light"
        indentSize={2}
        inputText="alpha"
        outputText=""
        outputDocumentId="doc-2"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={onEditInputChange}
        onIngestInput={onIngestInput}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByTestId('input-editor'), { target: { value: 'beta' } });

    expect(onEditInputChange).toHaveBeenCalledWith('beta');
    expect(onIngestInput).not.toHaveBeenCalled();
  });

  it('routes dropped file content through ingest callback', async () => {
    const onIngestInput = vi.fn();
    const droppedFile = {
      text: vi.fn().mockResolvedValue('{"a":1}'),
    } as unknown as File;

    render(
      <EditorShell
        paneMode="input"
        themeMode="light"
        indentSize={2}
        inputText=""
        outputText=""
        outputDocumentId="doc-3"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={vi.fn()}
        onIngestInput={onIngestInput}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    await waitFor(() => {
      expect(onIngestInput).toHaveBeenCalledWith('{"a":1}');
    });
  });

  it('routes empty dropped file content through ingest callback', async () => {
    const onIngestInput = vi.fn();
    const droppedFile = {
      text: vi.fn().mockResolvedValue(''),
    } as unknown as File;

    render(
      <EditorShell
        paneMode="input"
        themeMode="light"
        indentSize={2}
        inputText=""
        outputText=""
        outputDocumentId="doc-4"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={vi.fn()}
        onIngestInput={onIngestInput}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    await waitFor(() => {
      expect(onIngestInput).toHaveBeenCalledWith('');
    });
  });

  it('routes pasted text through ingest callback', () => {
    const onIngestInput = vi.fn();

    render(
      <EditorShell
        paneMode="input"
        themeMode="light"
        indentSize={2}
        inputText=""
        outputText=""
        outputDocumentId="doc-5"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={vi.fn()}
        onIngestInput={onIngestInput}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '{"a":1}',
      },
    });

    expect(onIngestInput).toHaveBeenCalledWith('{"a":1}');
  });

  it('routes empty pasted text through ingest callback', () => {
    const onIngestInput = vi.fn();

    render(
      <EditorShell
        paneMode="input"
        themeMode="light"
        indentSize={2}
        inputText=""
        outputText=""
        outputDocumentId="doc-6"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={vi.fn()}
        onIngestInput={onIngestInput}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '',
      },
    });

    expect(onIngestInput).toHaveBeenCalledWith('');
  });

  it('renders read-only output in output mode', () => {
    render(
      <EditorShell
        paneMode="output"
        themeMode="dark"
        indentSize={2}
        inputText="alpha"
        outputText="alpha"
        outputDocumentId="doc-7"
        inputEditorRef={createInputEditorRef()}
        outputEditorRef={createOutputEditorRef()}
        onEditInputChange={vi.fn()}
        onIngestInput={vi.fn()}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId('output-editor')).toBeInTheDocument();
  });
});
