import { useEffect } from 'react';

type OutputContextMenuProps = {
  isOpen: boolean;
  anchorX: number;
  anchorY: number;
  label: string;
  disabled: boolean;
  onSelect: () => void;
  onClose: () => void;
};

export const OutputContextMenu = ({
  isOpen,
  anchorX,
  anchorY,
  label,
  disabled,
  onSelect,
  onClose,
}: OutputContextMenuProps) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="output-context-menu-backdrop"
      data-testid="output-context-menu-backdrop"
      onClick={onClose}
    >
      <div
        aria-label="Output context menu"
        className="output-context-menu"
        data-testid="output-context-menu"
        onClick={(event) => event.stopPropagation()}
        role="menu"
        style={{ left: anchorX, top: anchorY }}
      >
        <button
          className="output-context-menu-item"
          data-testid="output-context-menu-prettify"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }

            onSelect();
          }}
          type="button"
        >
          {label}
        </button>
      </div>
    </div>
  );
};
