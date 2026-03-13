import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FallbackAgentComboButton } from '../../../../src/renderer/components/FallbackAgentComboButton';

describe('FallbackAgentComboButton', () => {
  it('renders the first enabled agent as the primary action and only enabled options in the menu', async () => {
    const user = userEvent.setup();

    render(
      <FallbackAgentComboButton
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: false },
        ]}
        onTrigger={vi.fn()}
      />,
    );

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Amp');

    await user.click(screen.getByTestId('fallback-agent-combo-toggle'));

    expect(screen.getByTestId('fallback-agent-combo-panel')).toBeInTheDocument();
    expect(screen.getByTestId('fallback-agent-combo-option-amp')).toHaveTextContent('Amp');
    expect(screen.queryByTestId('fallback-agent-combo-option-codex')).not.toBeInTheDocument();
  });

  it('calls onTrigger with the current selection when the primary action is clicked', async () => {
    const user = userEvent.setup();
    const onTrigger = vi.fn();

    render(
      <FallbackAgentComboButton
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: true },
        ]}
        onTrigger={onTrigger}
      />,
    );

    await user.click(screen.getByTestId('fallback-agent-combo-button'));

    expect(onTrigger).toHaveBeenCalledWith('amp');
  });

  it('updates the primary label when a dropdown option is clicked without triggering the action', async () => {
    const user = userEvent.setup();
    const onTrigger = vi.fn();

    render(
      <FallbackAgentComboButton
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: true },
        ]}
        onTrigger={onTrigger}
      />,
    );

    await user.click(screen.getByTestId('fallback-agent-combo-toggle'));
    await user.click(screen.getByTestId('fallback-agent-combo-option-codex'));

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Codex');
    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveFocus();
    expect(onTrigger).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-agent-combo-panel')).not.toBeInTheDocument();
    });
  });

  it('supports arrow navigation to change selection, then enter to trigger the selected agent', async () => {
    const user = userEvent.setup();
    const onTrigger = vi.fn();

    render(
      <FallbackAgentComboButton
        autoFocusPrimaryAction={true}
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: true },
          { id: 'claude', name: 'Claude', enabled: true },
        ]}
        onTrigger={onTrigger}
      />,
    );

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Codex');
    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveFocus();
    expect(onTrigger).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-agent-combo-panel')).not.toBeInTheDocument();
    });

    await user.keyboard('{Enter}');

    expect(onTrigger).toHaveBeenCalledWith('codex');
  });
});
