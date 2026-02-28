import { useCallback, useEffect, useRef, useState } from 'react';

export type FallbackAgentOption = {
  id: string;
  name: string;
  enabled: boolean;
};

type FallbackAgentDropdownProps = {
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  onFallbackAgentIdChange: (nextAgentId: string | null) => void;
};

export const FallbackAgentDropdown = ({
  fallbackAgentId,
  fallbackAgentOptions,
  onFallbackAgentIdChange,
}: FallbackAgentDropdownProps) => {
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

  const selectedLabel =
    fallbackAgentOptions.find((option) => option.id === fallbackAgentId)?.name ?? 'No Fallback';

  return (
    <div className="dropdown" ref={dropdownRef}>
      <button
        aria-expanded={dropdownOpen}
        aria-haspopup="listbox"
        className="dropdown-trigger"
        data-testid="fallback-agent-select"
        onClick={() => setDropdownOpen((previous) => !previous)}
        title="Select fallback agent"
        type="button"
      >
        <span className="dropdown-trigger-label">{selectedLabel}</span>
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
          aria-label="Select fallback agent"
          className="dropdown-panel"
          data-testid="fallback-agent-panel"
          role="listbox"
        >
          <button
            aria-selected={fallbackAgentId === null}
            className={`dropdown-option${fallbackAgentId === null ? ' dropdown-option-active' : ''}`}
            data-testid="fallback-option-none"
            onClick={() => {
              onFallbackAgentIdChange(null);
              closeDropdown();
            }}
            role="option"
            type="button"
          >
            No Fallback
          </button>
          {fallbackAgentOptions.map((agentOption) => (
            <button
              aria-selected={fallbackAgentId === agentOption.id}
              className={`dropdown-option${fallbackAgentId === agentOption.id ? ' dropdown-option-active' : ''}${!agentOption.enabled ? ' dropdown-option-disabled' : ''}`}
              data-testid={`fallback-option-${agentOption.id}`}
              disabled={!agentOption.enabled}
              key={agentOption.id}
              onClick={() => {
                onFallbackAgentIdChange(agentOption.id);
                closeDropdown();
              }}
              role="option"
              type="button"
            >
              {agentOption.enabled ? agentOption.name : `${agentOption.name} (Disabled)`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
