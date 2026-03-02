type ConfirmationModalProps = {
  isOpen: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmationModal = ({
  isOpen,
  title,
  confirmLabel,
  cancelLabel,
  message,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) => {
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
        <div className="confirmation-modal-actions">
          <button className="btn" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="btn confirmation-modal-confirm" onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
