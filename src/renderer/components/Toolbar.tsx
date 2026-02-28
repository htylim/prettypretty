import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaneMode, ThemeMode } from '../../shared/types';

type FallbackAgentOption = {
  id: string;
  name: string;
  enabled: boolean;
};

type ToolbarProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  hasContent: boolean;
  onNew: () => void;
  onPaneModeChange: (nextMode: PaneMode) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSave: () => void;
  onCopy: () => void;
  onThemeModeChange: (nextMode: ThemeMode) => void;
  onFallbackAgentIdChange: (nextAgentId: string | null) => void;
};

const buttonClass = 'btn';
const segmentedContainerClass = 'segmented';
const segmentButtonClass = 'seg';
const activeSegmentClass = 'seg-active';
const inactiveSegmentClass = 'seg-inactive';
const tooltips = {
  new: 'New (Cmd+N)',
  input: 'Switch to input (Cmd+I)',
  output: 'Switch to output (Cmd+O)',
  expand: 'Expand all',
  collapse: 'Collapse all',
  save: 'Save (Cmd+S)',
  copy: 'Copy (Cmd+Shift+C)',
  lightTheme: 'Switch to light theme',
  darkTheme: 'Switch to dark theme',
} as const;

export const Toolbar = ({
  paneMode,
  themeMode,
  fallbackAgentId,
  fallbackAgentOptions,
  hasContent,
  onNew,
  onPaneModeChange,
  onCollapseAll,
  onExpandAll,
  onSave,
  onCopy,
  onThemeModeChange,
  onFallbackAgentIdChange,
}: ToolbarProps) => {
  const isOutput = paneMode === 'output';
  const isOutputSegmentDisabled = paneMode === 'input' && !hasContent;
  const areFoldActionsDisabled = !hasContent;
  const areOutputPersistenceActionsDisabled = !isOutput;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setDropdownOpen(false), []);

  useEffect(() => {
    if (!dropdownOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDropdown();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [dropdownOpen, closeDropdown]);

  const selectedLabel =
    fallbackAgentOptions.find((o) => o.id === fallbackAgentId)?.name ?? 'No Fallback';

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button className={buttonClass} onClick={onNew} title={tooltips.new} type="button">
          New
        </button>

        <div className={segmentedContainerClass} data-testid="input-output-toggle" role="group">
          <button
            aria-pressed={paneMode === 'input'}
            className={`${segmentButtonClass} ${paneMode === 'input' ? activeSegmentClass : inactiveSegmentClass}`}
            data-testid="pane-segment-input"
            onClick={() => {
              if (paneMode !== 'input') {
                onPaneModeChange('input');
              }
            }}
            title={tooltips.input}
            type="button"
          >
            Input
          </button>
          <button
            aria-pressed={paneMode === 'output'}
            className={`${segmentButtonClass} ${paneMode === 'output' ? activeSegmentClass : inactiveSegmentClass}`}
            data-testid="pane-segment-output"
            disabled={isOutputSegmentDisabled}
            onClick={() => {
              if (paneMode !== 'output') {
                onPaneModeChange('output');
              }
            }}
            title={tooltips.output}
            type="button"
          >
            Output
          </button>
        </div>

        <>
          <button
            className={buttonClass}
            disabled={areFoldActionsDisabled}
            onClick={onExpandAll}
            title={tooltips.expand}
            type="button"
          >
            Expand
          </button>
          <button
            className={buttonClass}
            disabled={areFoldActionsDisabled}
            onClick={onCollapseAll}
            title={tooltips.collapse}
            type="button"
          >
            Collapse
          </button>
          <button
            className={buttonClass}
            disabled={areOutputPersistenceActionsDisabled}
            onClick={onSave}
            title={tooltips.save}
            type="button"
          >
            Save
          </button>
          <button
            className={buttonClass}
            disabled={areOutputPersistenceActionsDisabled}
            onClick={onCopy}
            title={tooltips.copy}
            type="button"
          >
            Copy
          </button>
        </>
      </div>

      <div className="toolbar-right">
        <div className="dropdown" ref={dropdownRef}>
          <button
            aria-expanded={dropdownOpen}
            aria-haspopup="listbox"
            className="dropdown-trigger"
            data-testid="fallback-agent-select"
            onClick={() => setDropdownOpen((prev) => !prev)}
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
              className="dropdown-panel"
              data-testid="fallback-agent-panel"
              role="listbox"
              aria-label="Select fallback agent"
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

        <div className={segmentedContainerClass} data-testid="theme-toggle" role="group">
          <button
            aria-pressed={themeMode === 'light'}
            className={`${segmentButtonClass} ${themeMode === 'light' ? activeSegmentClass : inactiveSegmentClass}`}
            data-testid="theme-segment-light"
            onClick={() => {
              if (themeMode !== 'light') {
                onThemeModeChange('light');
              }
            }}
            title={tooltips.lightTheme}
            type="button"
          >
            Light
          </button>
          <button
            aria-pressed={themeMode === 'dark'}
            className={`${segmentButtonClass} ${themeMode === 'dark' ? activeSegmentClass : inactiveSegmentClass}`}
            data-testid="theme-segment-dark"
            onClick={() => {
              if (themeMode !== 'dark') {
                onThemeModeChange('dark');
              }
            }}
            title={tooltips.darkTheme}
            type="button"
          >
            Dark
          </button>
        </div>
      </div>
    </header>
  );
};
