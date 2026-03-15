import { VscCollapseAll, VscCopy, VscDebugStepBack, VscExpandAll, VscSave } from 'react-icons/vsc';
import type { PaneMode, ThemeMode } from '../../shared/types';
import type { IndentSize } from '../../shared/preferences';
import { FallbackAgentDropdown, type FallbackAgentOption } from './FallbackAgentDropdown';
import { IndentSizeDropdown } from './IndentSizeDropdown';

type ToolbarProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  hasContent: boolean;
  hasDerivedOutputPane: boolean;
  onNew: () => void;
  onPaneModeChange: (nextMode: PaneMode) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSave: () => void;
  onCopy: () => void;
  onCloseSplit: () => void;
  onThemeModeChange: (nextMode: ThemeMode) => void;
  onIndentSizeChange: (nextIndentSize: IndentSize) => void;
  onFallbackAgentIdChange: (nextAgentId: string | null) => void;
};

const buttonClass = 'btn';
const segmentedContainerClass = 'segmented';
const segmentButtonClass = 'seg';
const activeSegmentClass = 'seg-active';
const inactiveSegmentClass = 'seg-inactive';

const tooltips = {
  new: 'New window (Cmd+N)',
  input: 'Switch to input (Cmd+I)',
  output: 'Switch to output (Cmd+O)',
  expand: 'Expand',
  collapse: 'Collapse',
  save: 'Save (Cmd+S)',
  copy: 'Copy (Cmd+Shift+C)',
  split: 'Close split pane',
  lightTheme: 'Switch to light theme',
  darkTheme: 'Switch to dark theme',
} as const;

// Segment buttons share one visual contract across pane/theme toggles.
const getSegmentClassName = (isActive: boolean): string => {
  return `${segmentButtonClass} ${isActive ? activeSegmentClass : inactiveSegmentClass}`;
};

export const Toolbar = ({
  paneMode,
  themeMode,
  indentSize,
  fallbackAgentId,
  fallbackAgentOptions,
  hasContent,
  hasDerivedOutputPane,
  onNew,
  onPaneModeChange,
  onCollapseAll,
  onExpandAll,
  onSave,
  onCopy,
  onCloseSplit,
  onThemeModeChange,
  onIndentSizeChange,
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
            className={getSegmentClassName(paneMode === 'input')}
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
            className={getSegmentClassName(paneMode === 'output')}
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
            aria-label="Collapse"
            className={`${buttonClass} btn-icon`}
            disabled={areFoldActionsDisabled}
            onClick={onCollapseAll}
            title={tooltips.collapse}
            type="button"
          >
            <VscCollapseAll />
          </button>
          <button
            aria-label="Expand"
            className={`${buttonClass} btn-icon`}
            disabled={areFoldActionsDisabled}
            onClick={onExpandAll}
            title={tooltips.expand}
            type="button"
          >
            <VscExpandAll />
          </button>
          <button
            aria-label="Save"
            className={`${buttonClass} btn-icon`}
            disabled={areOutputPersistenceActionsDisabled}
            onClick={onSave}
            title={tooltips.save}
            type="button"
          >
            <VscSave />
          </button>
          <button
            aria-label="Copy"
            className={`${buttonClass} btn-icon`}
            disabled={areOutputPersistenceActionsDisabled}
            onClick={onCopy}
            title={tooltips.copy}
            type="button"
          >
            <VscCopy />
          </button>
        </>

        <IndentSizeDropdown indentSize={indentSize} onIndentSizeChange={onIndentSizeChange} />

        <FallbackAgentDropdown
          fallbackAgentId={fallbackAgentId}
          fallbackAgentOptions={fallbackAgentOptions}
          onFallbackAgentIdChange={onFallbackAgentIdChange}
        />

        <button
          className={buttonClass}
          data-testid="toolbar-split-button"
          disabled={!hasDerivedOutputPane}
          onClick={onCloseSplit}
          title={tooltips.split}
          type="button"
        >
          <VscDebugStepBack />
          <span>Split</span>
        </button>
      </div>

      <div className="toolbar-right">
        <div className={segmentedContainerClass} data-testid="theme-toggle" role="group">
          <button
            aria-pressed={themeMode === 'light'}
            className={getSegmentClassName(themeMode === 'light')}
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
            className={getSegmentClassName(themeMode === 'dark')}
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
