import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndentSize } from '../../shared/preferences';

const INDENT_SIZE_OPTIONS: IndentSize[] = [1, 2, 3, 4, 5, 6, 7, 8];

type IndentSizeDropdownProps = {
  indentSize: IndentSize;
  onIndentSizeChange: (nextIndentSize: IndentSize) => void;
};

export const IndentSizeDropdown = ({ indentSize, onIndentSizeChange }: IndentSizeDropdownProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setDropdownOpen(false), []);

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [dropdownOpen, closeDropdown]);

  return (
    <div className="dropdown" ref={dropdownRef}>
      <button
        aria-expanded={dropdownOpen}
        aria-haspopup="listbox"
        className="dropdown-trigger"
        data-testid="indent-size-select"
        onClick={() => setDropdownOpen((previous) => !previous)}
        title="Select indentation size"
        type="button"
      >
        <span className="dropdown-trigger-label">Indent: {indentSize}</span>
        <svg
          aria-hidden="true"
          className={`dropdown-chevron${dropdownOpen ? ' dropdown-chevron-open' : ''}`}
          fill="none"
          height="10"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 12 10"
          width="12"
        >
          <path d="M2 3.5l4 4 4-4" />
        </svg>
      </button>

      {dropdownOpen && (
        <div
          aria-label="Select indentation size"
          className="dropdown-panel"
          data-testid="indent-size-panel"
          role="listbox"
        >
          {INDENT_SIZE_OPTIONS.map((size) => (
            <button
              aria-selected={indentSize === size}
              className={`dropdown-option${indentSize === size ? ' dropdown-option-active' : ''}`}
              data-testid={`indent-size-option-${size}`}
              key={size}
              onClick={() => {
                onIndentSizeChange(size);
                closeDropdown();
              }}
              role="option"
              type="button"
            >
              {size} spaces
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
