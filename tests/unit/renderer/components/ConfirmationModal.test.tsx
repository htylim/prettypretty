import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationModal } from '../../../../src/renderer/components/ConfirmationModal';

describe('ConfirmationModal', () => {
  it('renders dialog content when open', () => {
    render(
      <ConfirmationModal
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        isOpen={true}
        message="Content is 301 lines. Use fallback agent?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Large content"
      />,
    );

    expect(screen.getByTestId('fallback-confirmation-modal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Large content' })).toBeInTheDocument();
    expect(screen.getByText('Content is 301 lines. Use fallback agent?')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <ConfirmationModal
        cancelLabel="Cancel"
        confirmLabel="Confirm"
        isOpen={false}
        message="Content is 301 lines. Use fallback agent?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Large content"
      />,
    );

    expect(screen.queryByTestId('fallback-confirmation-modal')).not.toBeInTheDocument();
  });

  it('calls callbacks for confirm and cancel actions', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmationModal
        cancelLabel="Cancel"
        confirmLabel="Use fallback agent"
        isOpen={true}
        message="Content is 301 lines. Use fallback agent?"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Large content"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Use fallback agent' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
