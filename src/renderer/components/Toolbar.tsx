import type { PaneMode, ThemeMode } from '../../shared/types';
import { FallbackAgentDropdown, type FallbackAgentOption } from './FallbackAgentDropdown';

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
        <FallbackAgentDropdown
          fallbackAgentId={fallbackAgentId}
          fallbackAgentOptions={fallbackAgentOptions}
          onFallbackAgentIdChange={onFallbackAgentIdChange}
        />

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
