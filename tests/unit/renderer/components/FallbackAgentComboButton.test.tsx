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
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Amp');

    await user.click(screen.getByTestId('fallback-agent-combo-toggle'));

    expect(screen.getByTestId('fallback-agent-combo-panel')).toBeInTheDocument();
    expect(screen.getByTestId('fallback-agent-combo-option-amp')).toHaveTextContent('Amp');
    expect(screen.queryByTestId('fallback-agent-combo-option-codex')).not.toBeInTheDocument();
  });

  it('calls onSelect with the current selection when the primary action is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <FallbackAgentComboButton
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: true },
        ]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByTestId('fallback-agent-combo-button'));

    expect(onSelect).toHaveBeenCalledWith('amp');
  });

  it('runs the clicked dropdown option immediately and updates the primary label', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <FallbackAgentComboButton
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: true },
        ]}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByTestId('fallback-agent-combo-toggle'));
    await user.click(screen.getByTestId('fallback-agent-combo-option-codex'));

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Codex');
    expect(onSelect).toHaveBeenCalledWith('codex');
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-agent-combo-panel')).not.toBeInTheDocument();
    });
  });

  it('supports arrow navigation from the primary action and enter to run the highlighted option', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <FallbackAgentComboButton
        autoFocusPrimaryAction={true}
        fallbackAgentOptions={[
          { id: 'amp', name: 'Amp', enabled: true },
          { id: 'codex', name: 'Codex', enabled: true },
          { id: 'claude', name: 'Claude', enabled: true },
        ]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(onSelect).toHaveBeenCalledWith('codex');
    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Codex');
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-agent-combo-panel')).not.toBeInTheDocument();
    });
  });
});
