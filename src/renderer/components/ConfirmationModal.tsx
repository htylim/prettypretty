import { useEffect } from 'react';
import type { ReactNode } from 'react';

type ConfirmationModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  confirmLabel?: string | undefined;
  cancelLabel?: string | undefined;
  onConfirm?: (() => void) | undefined;
  actions?: ReactNode | undefined;
};

export const ConfirmationModal = ({
  isOpen,
  title,
  message,
  onCancel,
  confirmLabel,
  cancelLabel,
  onConfirm,
  actions,
}: ConfirmationModalProps) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="confirmation-modal-overlay"
      data-testid="fallback-confirmation-modal"
      role="dialog"
    >
      <div className="confirmation-modal">
        <h2 className="confirmation-modal-title">{title}</h2>
        <p className="confirmation-modal-message">{message}</p>
        {actions ? (
          <div className="confirmation-modal-actions">{actions}</div>
        ) : (
          <div className="confirmation-modal-actions">
            <button className="btn" onClick={onCancel} type="button">
              {cancelLabel}
            </button>
            <button className="btn btn-primary" onClick={onConfirm} type="button">
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
