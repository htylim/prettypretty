import { render, screen } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../../../../src/renderer/components/Toolbar';

const createProps = (
  overrides: Partial<ComponentProps<typeof Toolbar>> = {},
): ComponentProps<typeof Toolbar> => ({
  paneMode: 'input',
  themeMode: 'light',
  hasContent: true,
  searchQuery: '',
  onNew: vi.fn(),
  onPaneModeChange: vi.fn(),
  onCollapseAll: vi.fn(),
  onExpandAll: vi.fn(),
  onSave: vi.fn(),
  onCopy: vi.fn(),
  onSearchChange: vi.fn(),
  onThemeModeChange: vi.fn(),
  ...overrides,
});

describe('Toolbar', () => {
  it('shows output actions only in output mode', () => {
    const { rerender } = render(<Toolbar {...createProps({ paneMode: 'input' })} />);

    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();

    rerender(<Toolbar {...createProps({ paneMode: 'output' })} />);

    expect(screen.getByRole('button', { name: 'Collapse' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('renders pane segments with active/disabled states and explicit mode changes', async () => {
    const user = userEvent.setup();
    const onPaneModeChange = vi.fn();

    const { rerender } = render(
      <Toolbar {...createProps({ hasContent: false, onPaneModeChange, paneMode: 'input' })} />,
    );

    const inputSegment = screen.getByTestId('pane-segment-input');
    const outputSegment = screen.getByTestId('pane-segment-output');

    expect(inputSegment).toHaveAttribute('aria-pressed', 'true');
    expect(outputSegment).toHaveAttribute('aria-pressed', 'false');
    expect(outputSegment).toBeDisabled();

    await user.click(inputSegment);
    await user.click(outputSegment);

    expect(onPaneModeChange).not.toHaveBeenCalled();

    rerender(
      <Toolbar {...createProps({ hasContent: true, onPaneModeChange, paneMode: 'input' })} />,
    );

    await user.click(screen.getByTestId('pane-segment-output'));

    expect(onPaneModeChange).toHaveBeenCalledTimes(1);
    expect(onPaneModeChange).toHaveBeenNthCalledWith(1, 'output');

    rerender(
      <Toolbar {...createProps({ hasContent: true, onPaneModeChange, paneMode: 'output' })} />,
    );

    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('pane-segment-output'));

    expect(onPaneModeChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('pane-segment-input'));

    expect(onPaneModeChange).toHaveBeenCalledTimes(2);
    expect(onPaneModeChange).toHaveBeenNthCalledWith(2, 'input');

    rerender(
      <Toolbar {...createProps({ hasContent: false, onPaneModeChange, paneMode: 'output' })} />,
    );

    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).not.toBeDisabled();
  });

  it('renders theme segments with explicit mode changes', async () => {
    const user = userEvent.setup();
    const onThemeModeChange = vi.fn();

    const { rerender } = render(
      <Toolbar {...createProps({ onThemeModeChange, themeMode: 'light' })} />,
    );

    expect(screen.getByTestId('theme-segment-light')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('theme-segment-dark')).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByTestId('theme-segment-light'));

    expect(onThemeModeChange).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('theme-segment-dark'));

    expect(onThemeModeChange).toHaveBeenCalledTimes(1);
    expect(onThemeModeChange).toHaveBeenNthCalledWith(1, 'dark');

    rerender(<Toolbar {...createProps({ onThemeModeChange, themeMode: 'dark' })} />);

    expect(screen.getByTestId('theme-segment-light')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('theme-segment-dark')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByTestId('theme-segment-dark'));

    expect(onThemeModeChange).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('theme-segment-light'));

    expect(onThemeModeChange).toHaveBeenCalledTimes(2);
    expect(onThemeModeChange).toHaveBeenNthCalledWith(2, 'light');
  });

  it('emits search value changes', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    const Harness = () => {
      const [searchQuery, setSearchQuery] = useState('');
      return (
        <Toolbar
          {...createProps({
            searchQuery,
            onSearchChange: (next) => {
              setSearchQuery(next);
              onSearchChange(next);
            },
          })}
        />
      );
    };

    render(<Harness />);

    await user.type(screen.getByTestId('search-input'), 'abc');

    expect(onSearchChange).toHaveBeenLastCalledWith('abc');
  });
});
