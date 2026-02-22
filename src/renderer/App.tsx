import { useEffect, useMemo } from 'react';
import type { WindowApi } from '../shared/window-api';
import { EditorShell } from './components/EditorShell';
import { Toolbar } from './components/Toolbar';
import { useUiStore } from './state/uiStore';

const formatText = (rawText: string): string => {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return rawText;
  }
};

const getWindowApi = (): WindowApi | null => {
  const candidate = (window as Window & { prettypretty?: WindowApi }).prettypretty;
  return candidate ?? null;
};

export const App = () => {
  const paneMode = useUiStore((state) => state.paneMode);
  const themeMode = useUiStore((state) => state.themeMode);
  const inputText = useUiStore((state) => state.inputText);
  const searchQuery = useUiStore((state) => state.searchQuery);
  const reset = useUiStore((state) => state.reset);
  const setPaneMode = useUiStore((state) => state.setPaneMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setInputText = useUiStore((state) => state.setInputText);
  const setSearchQuery = useUiStore((state) => state.setSearchQuery);

  const outputText = useMemo(() => formatText(inputText), [inputText]);
  const hasContent = inputText.trim().length > 0;
  const ingestInputText = (nextText: string): void => {
    setInputText(nextText);
    setPaneMode('output');
  };

  const openFile = async (): Promise<void> => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    const file = await api.dialog.openFile();
    if (file) {
      ingestInputText(file.content);
    }
  };

  const saveOutput = async (): Promise<void> => {
    const api = getWindowApi();
    if (!api || !outputText) {
      return;
    }

    await api.file.save(outputText);
  };

  const copyOutput = async (): Promise<void> => {
    const api = getWindowApi();
    if (!api || !outputText) {
      return;
    }

    await api.clipboard.copy(outputText);
  };

  const handleNew = (): void => {
    reset();
  };

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return (
    <main className="h-screen w-screen bg-app-base px-3 pb-3 pt-2 text-app-foreground">
      <div className="flex h-full flex-col">
        <Toolbar
          paneMode={paneMode}
          themeMode={themeMode}
          hasContent={hasContent}
          searchQuery={searchQuery}
          onNew={handleNew}
          onPaneModeChange={setPaneMode}
          onCollapseAll={() => {}}
          onExpandAll={() => {}}
          onSave={() => void saveOutput()}
          onCopy={() => void copyOutput()}
          onSearchChange={setSearchQuery}
          onThemeModeChange={setThemeMode}
        />

        <EditorShell
          paneMode={paneMode}
          inputText={inputText}
          outputText={outputText}
          searchQuery={searchQuery}
          onEditInputChange={setInputText}
          onIngestInput={ingestInputText}
          onOpenFile={openFile}
        />
      </div>
    </main>
  );
};
