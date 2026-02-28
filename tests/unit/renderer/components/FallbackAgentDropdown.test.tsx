import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  FallbackAgentDropdown,
  type FallbackAgentOption,
} from '../../../../src/renderer/components/FallbackAgentDropdown';

type SetupOptions = {
  fallbackAgentId?: string | null;
  fallbackAgentOptions?: FallbackAgentOption[];
  onFallbackAgentIdChange?: (nextAgentId: string | null) => void;
};

const defaultAgentOptions: FallbackAgentOption[] = [
  { id: 'amp', name: 'Amp', enabled: true },
  { id: 'codex', name: 'Codex', enabled: true },
];

const renderDropdown = ({
  fallbackAgentId = 'codex',
  fallbackAgentOptions = defaultAgentOptions,
  onFallbackAgentIdChange = vi.fn(),
}: SetupOptions = {}) => {
  render(
    <FallbackAgentDropdown
      fallbackAgentId={fallbackAgentId}
      fallbackAgentOptions={fallbackAgentOptions}
      onFallbackAgentIdChange={onFallbackAgentIdChange}
    />,
  );

  return { onFallbackAgentIdChange };
};

describe('FallbackAgentDropdown', () => {
  it('renders no-fallback and configured agent options', async () => {
    const user = userEvent.setup();

    renderDropdown({
      fallbackAgentId: null,
      fallbackAgentOptions: [
        { id: 'amp', name: 'Amp', enabled: true },
        { id: 'codex', name: 'Codex', enabled: false },
      ],
    });

    const trigger = screen.getByTestId('fallback-agent-select');
    expect(trigger).toHaveTextContent('No Fallback');

    await user.click(trigger);

    expect(screen.getByTestId('fallback-agent-panel')).toBeInTheDocument();
    expect(screen.getByTestId('fallback-option-none')).toHaveTextContent('No Fallback');
    expect(screen.getByTestId('fallback-option-amp')).toHaveTextContent('Amp');
    expect(screen.getByTestId('fallback-option-codex')).toBeDisabled();
    expect(screen.getByTestId('fallback-option-codex')).toHaveTextContent('Codex (Disabled)');
  });

  it('calls change handler with selected agent id or null', async () => {
    const user = userEvent.setup();
    const onFallbackAgentIdChange = vi.fn();

    renderDropdown({ fallbackAgentId: 'codex', onFallbackAgentIdChange });

    const trigger = screen.getByTestId('fallback-agent-select');
    await user.click(trigger);
    await user.click(screen.getByTestId('fallback-option-amp'));

    await user.click(trigger);
    await user.click(screen.getByTestId('fallback-option-none'));

    expect(onFallbackAgentIdChange).toHaveBeenCalledTimes(2);
    expect(onFallbackAgentIdChange).toHaveBeenNthCalledWith(1, 'amp');
    expect(onFallbackAgentIdChange).toHaveBeenNthCalledWith(2, null);
  });

  it('closes on escape key press', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByTestId('fallback-agent-select'));
    expect(screen.getByTestId('fallback-agent-panel')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-agent-panel')).not.toBeInTheDocument();
    });
  });

  it('closes on outside click', async () => {
    const user = userEvent.setup();
    renderDropdown();

    await user.click(screen.getByTestId('fallback-agent-select'));
    expect(screen.getByTestId('fallback-agent-panel')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-agent-panel')).not.toBeInTheDocument();
    });
  });
});
