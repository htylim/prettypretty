import type { PaneMode, ThemeMode } from '../../shared/types';

type ToolbarProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  hasContent: boolean;
  searchQuery: string;
  onNew: () => void;
  onPaneModeChange: (nextMode: PaneMode) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSave: () => void;
  onCopy: () => void;
  onSearchChange: (value: string) => void;
  onThemeModeChange: (nextMode: ThemeMode) => void;
};

const buttonClass = 'btn';
const segmentedContainerClass = 'segmented';
const segmentButtonClass = 'seg';
const activeSegmentClass = 'seg-active';
const inactiveSegmentClass = 'seg-inactive';

export const Toolbar = ({
  paneMode,
  themeMode,
  hasContent,
  searchQuery,
  onNew,
  onPaneModeChange,
  onCollapseAll,
  onExpandAll,
  onSave,
  onCopy,
  onSearchChange,
  onThemeModeChange,
}: ToolbarProps) => {
  const isOutput = paneMode === 'output';
  const isOutputSegmentDisabled = paneMode === 'input' && !hasContent;
  const areOutputActionsDisabled = !isOutput;

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button className={buttonClass} onClick={onNew} type="button">
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
            type="button"
          >
            Output
          </button>
        </div>

        <>
          <button
            className={buttonClass}
            disabled={areOutputActionsDisabled}
            onClick={onExpandAll}
            type="button"
          >
            Expand
          </button>
          <button
            className={buttonClass}
            disabled={areOutputActionsDisabled}
            onClick={onCollapseAll}
            type="button"
          >
            Collapse
          </button>
          <button
            className={buttonClass}
            disabled={areOutputActionsDisabled}
            onClick={onSave}
            type="button"
          >
            Save
          </button>
          <button
            className={buttonClass}
            disabled={areOutputActionsDisabled}
            onClick={onCopy}
            type="button"
          >
            Copy
          </button>
        </>
      </div>

      <div className="toolbar-right">
        <input
          className="toolbar-search"
          placeholder={isOutput ? 'Search output' : 'Search input'}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          data-testid="search-input"
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
            type="button"
          >
            Dark
          </button>
        </div>
      </div>
    </header>
  );
};
