import { useEffect, useMemo, useRef } from 'react';
import type { WindowApi } from '../shared/window-api';
import { EditorShell } from './components/EditorShell';
import type { OutputEditorHandle } from './components/OutputEditor';
import { OUTPUT_INDENT_SIZE } from './output/outputEditorConfig';
import { Toolbar } from './components/Toolbar';
import { useUiStore } from './state/uiStore';

const formatText = (rawText: string): string => {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed, null, OUTPUT_INDENT_SIZE);
  } catch {
    return rawText;
  }
};

const getWindowApi = (): WindowApi | null => {
  const candidate = (window as Window & { prettypretty?: WindowApi }).prettypretty;
  return candidate ?? null;
};

const getOutputDocumentId = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `output-${(hash >>> 0).toString(16)}-${value.length}`;
};

export const App = () => {
  const outputEditorRef = useRef<OutputEditorHandle>(null);
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
  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
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
    <main className="app-root">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-shell">
        <Toolbar
          paneMode={paneMode}
          themeMode={themeMode}
          hasContent={hasContent}
          searchQuery={searchQuery}
          onNew={handleNew}
          onPaneModeChange={setPaneMode}
          onCollapseAll={() => outputEditorRef.current?.collapseAll()}
          onExpandAll={() => outputEditorRef.current?.expandAll()}
          onSave={() => void saveOutput()}
          onCopy={() => void copyOutput()}
          onSearchChange={setSearchQuery}
          onThemeModeChange={setThemeMode}
        />

        <EditorShell
          paneMode={paneMode}
          themeMode={themeMode}
          inputText={inputText}
          outputText={outputText}
          outputDocumentId={outputDocumentId}
          searchQuery={searchQuery}
          outputEditorRef={outputEditorRef}
          onEditInputChange={setInputText}
          onIngestInput={ingestInputText}
          onOpenFile={openFile}
        />
      </div>
    </main>
  );
};
