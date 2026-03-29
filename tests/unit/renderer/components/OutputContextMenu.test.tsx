import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutputContextMenu } from '../../../../src/renderer/components/OutputContextMenu';

describe('OutputContextMenu', () => {
  it('renders the prettify action and dismisses on backdrop click', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();

    render(
      <OutputContextMenu
        anchorX={120}
        anchorY={240}
        disabled={false}
        isOpen={true}
        label="Prettify query..."
        onClose={onClose}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('output-context-menu')).toBeVisible();
    expect(screen.getByTestId('output-context-menu-prettify')).toHaveTextContent(
      'Prettify query...',
    );

    fireEvent.click(screen.getByTestId('output-context-menu-prettify'));
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('output-context-menu-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the action as disabled when unavailable', () => {
    render(
      <OutputContextMenu
        anchorX={0}
        anchorY={0}
        disabled={true}
        isOpen={true}
        label="Prettify ..."
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('output-context-menu-prettify')).toBeDisabled();
  });
});
