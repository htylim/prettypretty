import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PrettifyTrigger } from '../shared/prettifier';
import type { TelemetryEventName } from '../shared/telemetry';
import type { WindowApi } from '../shared/window-api';
import type { ThemeMode } from '../shared/types';
import { EditorShell } from './components/EditorShell';
import type { InputEditorHandle } from './components/InputEditor';
import type { OutputEditorHandle } from './components/OutputEditor';
import { Toolbar } from './components/Toolbar';
import { createPrettifierService } from './prettifier/prettifierService';
import { useUiStore } from './state/uiStore';

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

type IngestSource = 'open-file' | 'drop' | 'paste';

const EMPTY_FILE_NOTICE = 'File has no content.';

const isFileIngestSource = (source: IngestSource): boolean => {
  return source === 'open-file' || source === 'drop';
};

const getIngestTrigger = (source: IngestSource): PrettifyTrigger => {
  if (source === 'open-file') {
    return 'ingest-open-file';
  }

  if (source === 'drop') {
    return 'ingest-drop';
  }

  return 'ingest-paste';
};

const getIngestEventName = (source: IngestSource): TelemetryEventName => {
  if (source === 'open-file') {
    return 'renderer.ingest.open-file';
  }

  if (source === 'drop') {
    return 'renderer.ingest.drop';
  }

  return 'renderer.ingest.paste';
};

export const App = () => {
  const inputEditorRef = useRef<InputEditorHandle>(null);
  const outputEditorRef = useRef<OutputEditorHandle>(null);
  const latestThemeRequestIdRef = useRef(0);
  const latestPrettifyRequestIdRef = useRef(0);
  const lastPrettifiedInputRef = useRef<string | null>(null);
  const paneMode = useUiStore((state) => state.paneMode);
  const themeMode = useUiStore((state) => state.themeMode);
  const indentSize = useUiStore((state) => state.indentSize);
  const inputText = useUiStore((state) => state.inputText);
  const ingestNotice = useUiStore((state) => state.ingestNotice);
  const reset = useUiStore((state) => state.reset);
  const setPaneMode = useUiStore((state) => state.setPaneMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setIndentSize = useUiStore((state) => state.setIndentSize);
  const setInputText = useUiStore((state) => state.setInputText);
  const setIngestNotice = useUiStore((state) => state.setIngestNotice);
  const [outputText, setOutputText] = useState('');
  const [isLlmRunning, setIsLlmRunning] = useState(false);

  const prettifierService = useMemo(() => createPrettifierService(indentSize), [indentSize]);
  const outputDocumentId = useMemo(() => getOutputDocumentId(outputText), [outputText]);
  const hasContent = inputText.trim().length > 0;
  const isOutputMode = paneMode === 'output';

  const logTelemetry = useCallback(
    async (
      name: TelemetryEventName,
      meta: Record<string, string | number | boolean | null>,
    ): Promise<void> => {
      const api = getWindowApi();
      if (!api) {
        return;
      }

      try {
        await api.telemetry.log({ name, meta });
      } catch (error) {
        console.error('Failed to emit telemetry event', error);
      }
    },
    [],
  );

  const runPrettifier = useCallback(
    async (nextInputText: string, trigger: PrettifyTrigger): Promise<void> => {
      const requestId = latestPrettifyRequestIdRef.current + 1;
      latestPrettifyRequestIdRef.current = requestId;
      setIsLlmRunning(false);
      setOutputText(nextInputText);

      const localResult = prettifierService.prettifyDetailed(nextInputText);
      void logTelemetry('renderer.prettifier.local.result', {
        trigger,
        inputLength: nextInputText.length,
        localDetection: localResult.localDetection,
        localResultKind: localResult.kind,
      });

      if (localResult.kind === 'applied') {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(localResult.outputText);
        lastPrettifiedInputRef.current = nextInputText;
        return;
      }

      const api = getWindowApi();
      if (!api) {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(nextInputText);
        lastPrettifiedInputRef.current = nextInputText;
        return;
      }

      setIsLlmRunning(true);

      try {
        const response = await api.prettifier.run({
          inputText: nextInputText,
          indentSize,
          trigger,
        });

        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(response.outputText);
        lastPrettifiedInputRef.current = nextInputText;
      } catch (error) {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(nextInputText);
        lastPrettifiedInputRef.current = nextInputText;
        console.error('Failed to run prettifier fallback', error);
      } finally {
        if (requestId === latestPrettifyRequestIdRef.current) {
          setIsLlmRunning(false);
        }
      }
    },
    [indentSize, logTelemetry, prettifierService],
  );

  const ingestInputText = useCallback(
    (nextText: string, source: IngestSource): void => {
      setInputText(nextText);
      void logTelemetry(getIngestEventName(source), {
        source,
        inputLength: nextText.length,
        isEmpty: nextText.length === 0,
      });

      if (isFileIngestSource(source) && nextText.length === 0) {
        latestPrettifyRequestIdRef.current += 1;
        lastPrettifiedInputRef.current = null;
        setIsLlmRunning(false);
        setOutputText('');
        setPaneMode('input');
        setIngestNotice(EMPTY_FILE_NOTICE);
        return;
      }

      if (nextText.trim().length === 0) {
        latestPrettifyRequestIdRef.current += 1;
        lastPrettifiedInputRef.current = null;
        setIsLlmRunning(false);
        setOutputText('');
        setPaneMode('input');
        if (source !== 'paste') {
          setIngestNotice(null);
        }
        return;
      }

      setIngestNotice(null);
      setPaneMode('output');
      void runPrettifier(nextText, getIngestTrigger(source));
    },
    [logTelemetry, runPrettifier, setIngestNotice, setInputText, setPaneMode],
  );

  const openFile = useCallback(async (): Promise<void> => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    const file = await api.dialog.openFile();
    if (file) {
      ingestInputText(file.content, 'open-file');
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
    latestPrettifyRequestIdRef.current += 1;
    lastPrettifiedInputRef.current = null;
    setIsLlmRunning(false);
    setOutputText('');
    reset();
  }, [reset]);

  const handlePaneModeChange = useCallback(
    (nextMode: 'input' | 'output'): void => {
      if (nextMode === 'input') {
        setPaneMode('input');
        return;
      }

      if (!hasContent) {
        return;
      }

      setPaneMode('output');
      void logTelemetry('renderer.output.mode-switch', {
        fromMode: paneMode,
        toMode: 'output',
        inputLength: inputText.length,
      });

      if (lastPrettifiedInputRef.current === inputText) {
        return;
      }

      void runPrettifier(inputText, 'switch-output');
    },
    [hasContent, inputText, logTelemetry, paneMode, runPrettifier, setPaneMode],
  );

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
          setIndentSize(preferences.indentSize);
        }
      } catch (error) {
        console.error('Failed to load preferences', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setIndentSize, setThemeMode]);

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
          handlePaneModeChange('input');
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
          handlePaneModeChange('output');
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
  }, [copyOutput, handleNew, handlePaneModeChange, hasContent, isOutputMode, paneMode, saveOutput]);

  return (
    <main className="app-root">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-shell">
        <Toolbar
          paneMode={paneMode}
          themeMode={themeMode}
          hasContent={hasContent}
          onNew={handleNew}
          onPaneModeChange={handlePaneModeChange}
          onCollapseAll={collapseActiveEditor}
          onExpandAll={expandActiveEditor}
          onSave={() => void saveOutput()}
          onCopy={() => void copyOutput()}
          onThemeModeChange={(mode) => void persistThemeMode(mode)}
        />

        <EditorShell
          paneMode={paneMode}
          themeMode={themeMode}
          indentSize={indentSize}
          inputText={inputText}
          outputText={outputText}
          outputDocumentId={outputDocumentId}
          ingestNotice={ingestNotice}
          isLlmRunning={isLlmRunning}
          inputEditorRef={inputEditorRef}
          outputEditorRef={outputEditorRef}
          onEditInputChange={setInputText}
          onIngestInput={ingestInputText}
          onDismissIngestNotice={() => setIngestNotice(null)}
          onOpenFile={openFile}
        />
      </div>
    </main>
  );
};
