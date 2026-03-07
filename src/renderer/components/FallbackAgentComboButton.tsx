import { useCallback, useEffect, useRef, useState } from 'react';
import type { FallbackAgentOption } from '../app/appDomain';

type FallbackAgentComboButtonProps = {
  fallbackAgentOptions: FallbackAgentOption[];
  onSelect: (agentId: string) => void;
};

export const FallbackAgentComboButton = ({
  fallbackAgentOptions,
  onSelect,
}: FallbackAgentComboButtonProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const enabledOptions = fallbackAgentOptions.filter((option) => option.enabled);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    enabledOptions[0]?.id ?? null,
  );
  const selectedAgentIdValue =
    enabledOptions.find((option) => option.id === selectedAgentId)?.id ??
    enabledOptions[0]?.id ??
    null;
  const selectedAgent = enabledOptions.find((option) => option.id === selectedAgentIdValue) ?? null;

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

    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [closeDropdown, dropdownOpen]);

  return (
    <div className="dropdown" ref={dropdownRef}>
      <div className="btn-group">
        <button
          className="btn btn-primary"
          data-testid="fallback-agent-combo-button"
          disabled={selectedAgent === null}
          onClick={() => {
            if (selectedAgent) {
              onSelect(selectedAgent.id);
            }
          }}
          type="button"
        >
          <span className="combo-button-label">{selectedAgent?.name ?? 'Select agent'}</span>
        </button>
        <button
          aria-expanded={dropdownOpen}
          aria-haspopup="listbox"
          className="btn btn-primary btn-icon"
          data-testid="fallback-agent-combo-toggle"
          disabled={enabledOptions.length === 0}
          onClick={() => setDropdownOpen((previous) => !previous)}
          type="button"
        >
          <svg
            aria-hidden="true"
            className={`dropdown-chevron${dropdownOpen ? ' dropdown-chevron-open' : ''}`}
            fill="none"
            height="10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            style={{ color: 'currentColor' }}
            viewBox="0 0 12 10"
            width="12"
          >
            <path d="M2 3.5l4 4 4-4" />
          </svg>
        </button>
      </div>

      {dropdownOpen && (
        <div
          aria-label="Call fallback agent"
          className="dropdown-panel"
          data-testid="fallback-agent-combo-panel"
          role="listbox"
          style={{ minWidth: '140px' }}
        >
          {enabledOptions.map((agentOption) => (
            <button
              aria-selected={agentOption.id === selectedAgent?.id}
              className={`dropdown-option${agentOption.id === selectedAgent?.id ? ' dropdown-option-active' : ''}`}
              data-testid={`fallback-agent-combo-option-${agentOption.id}`}
              key={agentOption.id}
              onClick={() => {
                setSelectedAgentId(agentOption.id);
                closeDropdown();
              }}
              role="option"
              type="button"
            >
              {agentOption.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
