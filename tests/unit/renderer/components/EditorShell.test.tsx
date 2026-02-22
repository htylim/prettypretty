import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorShell } from '../../../../src/renderer/components/EditorShell';

describe('EditorShell', () => {
  it('renders empty state when input is empty', () => {
    const onOpenFile = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorShell
        paneMode="input"
        inputText=""
        outputText=""
        searchQuery=""
        onInputChange={vi.fn()}
        onOpenFile={onOpenFile}
      />,
    );

    const cta = screen.getByTestId('empty-state-cta');

    expect(screen.getAllByTestId('empty-state-cta')).toHaveLength(1);
    expect(cta).toHaveTextContent(/^Paste, Drop or Click$/);

    fireEvent.click(screen.getByRole('button', { name: 'Click' }));
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it('renders editable input textarea in input mode', () => {
    const onInputChange = vi.fn();

    render(
      <EditorShell
        paneMode="input"
        inputText="alpha"
        outputText=""
        searchQuery=""
        onInputChange={onInputChange}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.change(screen.getByTestId('input-editor'), { target: { value: 'beta' } });

    expect(onInputChange).toHaveBeenCalledWith('beta');
  });

  it('renders read-only output in output mode', () => {
    render(
      <EditorShell
        paneMode="output"
        inputText="alpha"
        outputText="alpha"
        searchQuery=""
        onInputChange={vi.fn()}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByTestId('output-editor')).toBeInTheDocument();
  });
});
