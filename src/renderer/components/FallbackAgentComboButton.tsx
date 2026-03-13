import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { FallbackAgentOption } from '../app/appDomain';

type FallbackAgentComboButtonProps = {
  fallbackAgentOptions: FallbackAgentOption[];
  onSelect: (agentId: string) => void;
  autoFocusPrimaryAction?: boolean;
};

export const FallbackAgentComboButton = ({
  fallbackAgentOptions,
  onSelect,
  autoFocusPrimaryAction = false,
}: FallbackAgentComboButtonProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const enabledOptions = fallbackAgentOptions.filter((option) => option.enabled);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    enabledOptions[0]?.id ?? null,
  );
  const selectedAgentIdValue =
    enabledOptions.find((option) => option.id === selectedAgentId)?.id ??
    enabledOptions[0]?.id ??
    null;
  const selectedAgent = enabledOptions.find((option) => option.id === selectedAgentIdValue) ?? null;
  const selectedAgentIndex = enabledOptions.findIndex(
    (option) => option.id === selectedAgentIdValue,
  );

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setActiveOptionIndex(null);
  }, []);

  const getWrappedOptionIndex = useCallback(
    (index: number): number => {
      if (enabledOptions.length === 0) {
        return -1;
      }

      return (index + enabledOptions.length) % enabledOptions.length;
    },
    [enabledOptions.length],
  );

  const getNeighborIndex = useCallback(
    (direction: 1 | -1): number => {
      if (enabledOptions.length === 0) {
        return -1;
      }

      if (selectedAgentIndex === -1) {
        return direction === 1 ? 0 : enabledOptions.length - 1;
      }

      return getWrappedOptionIndex(selectedAgentIndex + direction);
    },
    [enabledOptions.length, getWrappedOptionIndex, selectedAgentIndex],
  );

  const openDropdownAtIndex = useCallback((index: number): void => {
    if (index < 0) {
      return;
    }

    setDropdownOpen(true);
    setActiveOptionIndex(index);
  }, []);

  const selectAgent = useCallback(
    (agentId: string): void => {
      setSelectedAgentId(agentId);
      closeDropdown();
      onSelect(agentId);
    },
    [closeDropdown, onSelect, setSelectedAgentId],
  );

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

  useEffect(() => {
    if (!dropdownOpen || activeOptionIndex === null) {
      return;
    }

    optionRefs.current[activeOptionIndex]?.focus();
  }, [activeOptionIndex, dropdownOpen]);

  const handleTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        openDropdownAtIndex(getNeighborIndex(1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        openDropdownAtIndex(getNeighborIndex(-1));
      }
    },
    [getNeighborIndex, openDropdownAtIndex],
  );

  const handleOptionKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveOptionIndex(getWrappedOptionIndex(index + 1));
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveOptionIndex(getWrappedOptionIndex(index - 1));
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setActiveOptionIndex(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        setActiveOptionIndex(enabledOptions.length - 1);
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const option = enabledOptions[index];
        if (option) {
          selectAgent(option.id);
        }
      }
    },
    [enabledOptions, getWrappedOptionIndex, selectAgent],
  );

  return (
    <div className="dropdown" ref={dropdownRef}>
      <div className="btn-group">
        <button
          autoFocus={autoFocusPrimaryAction}
          className="btn btn-primary"
          data-testid="fallback-agent-combo-button"
          disabled={selectedAgent === null}
          onClick={() => {
            if (selectedAgent) {
              onSelect(selectedAgent.id);
            }
          }}
          onKeyDown={handleTriggerKeyDown}
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
          onKeyDown={handleTriggerKeyDown}
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
          {enabledOptions.map((agentOption, index) => (
            <button
              aria-selected={agentOption.id === selectedAgent?.id}
              className={`dropdown-option${agentOption.id === selectedAgent?.id ? ' dropdown-option-active' : ''}`}
              data-testid={`fallback-agent-combo-option-${agentOption.id}`}
              key={agentOption.id}
              onClick={() => selectAgent(agentOption.id)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              ref={(element) => {
                optionRefs.current[index] = element;
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
