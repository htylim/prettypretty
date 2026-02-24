import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { WindowApi } from '../shared/window-api';
import type { ThemeMode } from '../shared/types';
import { EditorShell } from './components/EditorShell';
import type { InputEditorHandle } from './components/InputEditor';
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
  const inputEditorRef = useRef<InputEditorHandle>(null);
  const outputEditorRef = useRef<OutputEditorHandle>(null);
  const latestThemeRequestIdRef = useRef(0);
  const paneMode = useUiStore((state) => state.paneMode);
  const themeMode = useUiStore((state) => state.themeMode);
  const inputText = useUiStore((state) => state.inputText);
  const reset = useUiStore((state) => state.reset);
  const setPaneMode = useUiStore((state) => state.setPaneMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setInputText = useUiStore((state) => state.setInputText);

  const outputText = useMemo(() => formatText(inputText), [inputText]);
  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const hasContent = inputText.trim().length > 0;
  const isOutputMode = paneMode === 'output';
  const ingestInputText = useCallback(
    (nextText: string): void => {
      setInputText(nextText);
      setPaneMode('output');
    },
    [setInputText, setPaneMode],
  );

  const openFile = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    const file = await api.dialog.openFile();
    if (file) {
      ingestInputText(file.content);
    }
  }, [ingestInputText]);

  const saveOutput = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api || !outputText) {
      return;
    }

    await api.file.save(outputText);
  }, [outputText]);

  const copyOutput = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api || !outputText) {
      return;
    }

    await api.clipboard.copy(outputText);
  }, [outputText]);

  const handleNew = useCallback((): void => {
    reset();
  }, [reset]);

  const collapseActiveEditor = useCallback((): void => {
    if (paneMode === 'input') {
      inputEditorRef.current?.collapseAll();
      return;
    }

    outputEditorRef.current?.collapseAll();
  }, [paneMode]);

  const expandActiveEditor = useCallback((): void => {
    if (paneMode === 'input') {
      inputEditorRef.current?.expandAll();
      return;
    }

    outputEditorRef.current?.expandAll();
  }, [paneMode]);

  const persistThemeMode = useCallback(
    async (nextThemeMode: ThemeMode): Promise<void> => {
      const previousThemeMode = themeMode;
      if (nextThemeMode === previousThemeMode) {
        return;
      }

      setThemeMode(nextThemeMode);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = latestThemeRequestIdRef.current + 1;
      latestThemeRequestIdRef.current = requestId;

      try {
        const updatedPreferences = await api.preferences.update({ themeMode: nextThemeMode });

        if (requestId === latestThemeRequestIdRef.current) {
          setThemeMode(updatedPreferences.themeMode);
        }
      } catch (error) {
        if (requestId === latestThemeRequestIdRef.current) {
          setThemeMode(previousThemeMode);
        }

        console.error('Failed to persist theme preferences', error);
      }
    },
    [setThemeMode, themeMode],
  );

  useEffect(() => {
    let cancelled = false;
    const api = getWindowApi();

    if (!api) {
      return;
    }

    void (async () => {
      try {
        const preferences = await api.preferences.getAll();
        if (!cancelled) {
          setThemeMode(preferences.themeMode);
        }
      } catch (error) {
        console.error('Failed to load preferences', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setThemeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (!event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.shiftKey && key === 'c') {
        event.preventDefault();
        if (!isOutputMode) {
          return;
        }
        void copyOutput();
        return;
      }

      if (event.shiftKey) {
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        handleNew();
        return;
      }

      if (key === 'i') {
        event.preventDefault();
        if (paneMode !== 'input') {
          setPaneMode('input');
        }
        return;
      }

      if (key === 'o') {
        event.preventDefault();
        const canSwitchToOutput = paneMode === 'output' || hasContent;
        if (!canSwitchToOutput) {
          return;
        }
        if (paneMode !== 'output') {
          setPaneMode('output');
        }
        return;
      }

      if (key === 's') {
        event.preventDefault();
        if (!isOutputMode) {
          return;
        }
        void saveOutput();
        return;
      }

      if (key === 'f') {
        if (!isOutputMode) {
          return;
        }
        event.preventDefault();
        outputEditorRef.current?.openFind();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [copyOutput, handleNew, hasContent, isOutputMode, paneMode, saveOutput, setPaneMode]);

  return (
    <main className="app-root">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-shell">
        <Toolbar
          paneMode={paneMode}
          themeMode={themeMode}
          hasContent={hasContent}
          onNew={handleNew}
          onPaneModeChange={setPaneMode}
          onCollapseAll={collapseActiveEditor}
          onExpandAll={expandActiveEditor}
          onSave={() => void saveOutput()}
          onCopy={() => void copyOutput()}
          onThemeModeChange={(mode) => void persistThemeMode(mode)}
        />

        <EditorShell
          paneMode={paneMode}
          themeMode={themeMode}
          inputText={inputText}
          outputText={outputText}
          outputDocumentId={outputDocumentId}
          inputEditorRef={inputEditorRef}
          outputEditorRef={outputEditorRef}
          onEditInputChange={setInputText}
          onIngestInput={ingestInputText}
          onOpenFile={openFile}
        />
      </div>
    </main>
  );
};
