import type { PaneMode, ThemeMode } from '../../shared/types';

type ToolbarProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  hasContent: boolean;
  searchQuery: string;
  onNew: () => void;
  onTogglePane: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onSave: () => void;
  onCopy: () => void;
  onSearchChange: (value: string) => void;
  onToggleTheme: () => void;
};

const buttonClass =
  'rounded-xl border border-stone-300 bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-800 transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50';

export const Toolbar = ({
  paneMode,
  themeMode,
  hasContent,
  searchQuery,
  onNew,
  onTogglePane,
  onCollapseAll,
  onExpandAll,
  onSave,
  onCopy,
  onSearchChange,
  onToggleTheme,
}: ToolbarProps) => {
  const isOutput = paneMode === 'output';

  return (
    <header className="flex items-center gap-2 rounded-2xl border border-stone-300 bg-stone-50 p-3 shadow-sm">
      <button className={buttonClass} onClick={onNew} type="button">
        New
      </button>

      <button
        className={buttonClass}
        disabled={!hasContent}
        onClick={onTogglePane}
        type="button"
        data-testid="toggle-pane"
      >
        {isOutput ? 'Input' : 'Output'}
      </button>

      <button className={buttonClass} disabled={!isOutput} onClick={onCollapseAll} type="button">
        Collapse
      </button>

      <button className={buttonClass} disabled={!isOutput} onClick={onExpandAll} type="button">
        Expand
      </button>

      {isOutput ? (
        <>
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

        <button
          className={buttonClass}
          onClick={onToggleTheme}
          type="button"
          data-testid="theme-toggle"
        >
          {themeMode === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </header>
  );
};
