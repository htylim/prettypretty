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

const buttonClass =
  'rounded-xl border border-stone-300 bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-800 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50';
const segmentedContainerClass = 'flex rounded-xl border border-stone-300 bg-stone-100 p-1';
const segmentButtonClass =
  'rounded-lg px-3 py-1 text-sm font-semibold text-stone-700 transition disabled:cursor-not-allowed disabled:opacity-50';
const activeSegmentClass = 'bg-stone-200 text-stone-900 shadow-sm';
const inactiveSegmentClass = 'bg-transparent hover:bg-stone-200/70';

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

  return (
    <header className="flex items-center gap-2 rounded-2xl border border-stone-300 bg-stone-50 p-3 shadow-sm">
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

      {isOutput ? (
        <>
          <button className={buttonClass} onClick={onCollapseAll} type="button">
            Collapse
          </button>
          <button className={buttonClass} onClick={onExpandAll} type="button">
            Expand
          </button>
          <button className={buttonClass} onClick={onSave} type="button">
            Save
          </button>
          <button className={buttonClass} onClick={onCopy} type="button">
            Copy
          </button>
        </>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <input
          className="w-72 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 outline-none ring-amber-200 focus:ring"
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
