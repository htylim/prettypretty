import { render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../../../../src/renderer/components/Toolbar';

const createProps = (
  overrides: Partial<ComponentProps<typeof Toolbar>> = {},
): ComponentProps<typeof Toolbar> => ({
  paneMode: 'input',
  themeMode: 'light',
  fallbackAgentId: 'codex',
  fallbackAgentOptions: [
    { id: 'amp', name: 'Amp', enabled: true },
    { id: 'codex', name: 'Codex', enabled: true },
  ],
  hasContent: true,
  onNew: vi.fn(),
  onPaneModeChange: vi.fn(),
  onCollapseAll: vi.fn(),
  onExpandAll: vi.fn(),
  onSave: vi.fn(),
  onCopy: vi.fn(),
  onThemeModeChange: vi.fn(),
  onFallbackAgentIdChange: vi.fn(),
  ...overrides,
});

describe('Toolbar', () => {
  it('gates expand/collapse by content presence and gates save/copy to output mode', async () => {
    const user = userEvent.setup();
    const onCollapseAll = vi.fn();
    const onExpandAll = vi.fn();
    const onSave = vi.fn();
    const onCopy = vi.fn();

    const foldActionCases = [
      { label: 'Collapse', handler: onCollapseAll },
      { label: 'Expand', handler: onExpandAll },
    ] as const;

    const outputOnlyActionCases = [
      { label: 'Save', handler: onSave },
      { label: 'Copy', handler: onCopy },
    ] as const;

    const { rerender } = render(
      <Toolbar
        {...createProps({
          hasContent: false,
          onCollapseAll,
          onCopy,
          onExpandAll,
          onSave,
          paneMode: 'input',
        })}
      />,
    );

    for (const { handler, label } of foldActionCases) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(handler).not.toHaveBeenCalled();
    }

    for (const { handler, label } of outputOnlyActionCases) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(handler).not.toHaveBeenCalled();
    }

    rerender(
      <Toolbar
        {...createProps({
          hasContent: true,
          onCollapseAll,
          onCopy,
          onExpandAll,
          onSave,
          paneMode: 'output',
        })}
      />,
    );

    for (const { handler, label } of [...foldActionCases, ...outputOnlyActionCases]) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toBeEnabled();
      await user.click(button);
      expect(handler).toHaveBeenCalled();
    }
  });

  it('uses one shared style for toolbar action buttons', () => {
    render(<Toolbar {...createProps({ paneMode: 'output' })} />);

    const actionButtons = ['New', 'Expand', 'Collapse', 'Save', 'Copy'] as const;

    for (const label of actionButtons) {
      const button = screen.getByRole('button', { name: label });
      expect(button.className).toBe('btn');
    }
  });

  it('renders output actions in expand-then-collapse order', () => {
    render(<Toolbar {...createProps({ paneMode: 'output' })} />);

    const expandButton = screen.getByRole('button', { name: 'Expand' });
    const toolbarLeft = expandButton.closest('.toolbar-left');
    const actionLabels = Array.from(toolbarLeft?.querySelectorAll('button.btn') ?? []).map(
      (button) => button.textContent?.trim(),
    );

    expect(actionLabels).toEqual(['New', 'Expand', 'Collapse', 'Save', 'Copy']);
  });

  it('shows tooltips with shortcut hints for primary controls', () => {
    render(<Toolbar {...createProps({ paneMode: 'output' })} />);

    expect(screen.getByRole('button', { name: 'New' })).toHaveAttribute('title', 'New (Cmd+N)');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute(
      'title',
      'Switch to input (Cmd+I)',
    );
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute(
      'title',
      'Switch to output (Cmd+O)',
    );
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('title', 'Save (Cmd+S)');
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveAttribute(
      'title',
      'Copy (Cmd+Shift+C)',
    );
  });

  it('does not render a toolbar search input', () => {
    render(<Toolbar {...createProps({ paneMode: 'output' })} />);
    expect(screen.queryByTestId('search-input')).not.toBeInTheDocument();
  });

  it('renders fallback agent dropdown with no-fallback option and all configured agents', async () => {
    const user = userEvent.setup();

    render(
      <Toolbar
        {...createProps({
          paneMode: 'output',
          fallbackAgentId: null,
          fallbackAgentOptions: [
            { id: 'amp', name: 'Amp', enabled: true },
            { id: 'codex', name: 'Codex', enabled: false },
          ],
        })}
      />,
    );

    const trigger = screen.getByTestId('fallback-agent-select');
    expect(trigger).toHaveTextContent('No Fallback');

    await user.click(trigger);

    const panel = screen.getByTestId('fallback-agent-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId('fallback-option-none')).toHaveTextContent('No Fallback');
    expect(screen.getByTestId('fallback-option-amp')).toHaveTextContent('Amp');
    expect(screen.getByTestId('fallback-option-codex')).toBeDisabled();
    expect(screen.getByTestId('fallback-option-codex')).toHaveTextContent('Codex (Disabled)');
  });

  it('calls fallback change handler with selected agent id or null', async () => {
    const user = userEvent.setup();
    const onFallbackAgentIdChange = vi.fn();

    render(
      <Toolbar
        {...createProps({
          paneMode: 'output',
          fallbackAgentId: 'codex',
          onFallbackAgentIdChange,
        })}
      />,
    );

    const trigger = screen.getByTestId('fallback-agent-select');
    await user.click(trigger);
    await user.click(screen.getByTestId('fallback-option-amp'));

    await user.click(trigger);
    await user.click(screen.getByTestId('fallback-option-none'));

    expect(onFallbackAgentIdChange).toHaveBeenCalledTimes(2);
    expect(onFallbackAgentIdChange).toHaveBeenNthCalledWith(1, 'amp');
    expect(onFallbackAgentIdChange).toHaveBeenNthCalledWith(2, null);
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
});
