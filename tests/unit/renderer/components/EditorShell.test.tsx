import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorShell } from '../../../../src/renderer/components/EditorShell';

describe('EditorShell', () => {
  it('renders empty state when input is empty', () => {
    render(
      <EditorShell
        paneMode="input"
        inputText=""
        outputText=""
        searchQuery=""
        onInputChange={vi.fn()}
        onOpenFile={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('Paste, Drop, or Click')).toBeInTheDocument();
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
