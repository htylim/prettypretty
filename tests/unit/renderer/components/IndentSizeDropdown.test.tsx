import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IndentSizeDropdown } from '../../../../src/renderer/components/IndentSizeDropdown';
import type { IndentSize } from '../../../../src/shared/preferences';

type SetupOptions = {
  indentSize?: IndentSize;
  onIndentSizeChange?: (nextIndentSize: IndentSize) => void;
};

const renderDropdown = ({ indentSize = 2, onIndentSizeChange = vi.fn() }: SetupOptions = {}) => {
  render(<IndentSizeDropdown indentSize={indentSize} onIndentSizeChange={onIndentSizeChange} />);

  return { onIndentSizeChange };
};

describe('IndentSizeDropdown', () => {
  it('renders selected indentation size and all options', async () => {
    const user = userEvent.setup();

    renderDropdown({ indentSize: 4 });

    const trigger = screen.getByTestId('indent-size-select');
    expect(trigger).toHaveTextContent('Indent: 4');

    await user.click(trigger);

    expect(screen.getByTestId('indent-size-panel')).toBeInTheDocument();
    for (const size of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(screen.getByTestId(`indent-size-option-${size}`)).toHaveTextContent(`${size} spaces`);
    }
  });

  it('calls change handler with selected size', async () => {
    const user = userEvent.setup();
    const onIndentSizeChange = vi.fn();

    renderDropdown({ indentSize: 2, onIndentSizeChange });

    await user.click(screen.getByTestId('indent-size-select'));
    await user.click(screen.getByTestId('indent-size-option-6'));

    expect(onIndentSizeChange).toHaveBeenCalledTimes(1);
    expect(onIndentSizeChange).toHaveBeenCalledWith(6);
  });

  it('closes on escape key press', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByTestId('indent-size-select'));
    expect(screen.getByTestId('indent-size-panel')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('indent-size-panel')).not.toBeInTheDocument();
    });
  });

  it('closes on outside click', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByTestId('indent-size-select'));
    expect(screen.getByTestId('indent-size-panel')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTestId('indent-size-panel')).not.toBeInTheDocument();
    });
  });
});
