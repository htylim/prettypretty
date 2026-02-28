import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PrettifyTrigger } from '../shared/prettifier';
import type { Preferences } from '../shared/preferences';
import type { TelemetryEventName } from '../shared/telemetry';
import type { WindowApi } from '../shared/window-api';
import type { ThemeMode } from '../shared/types';
import { EditorShell } from './components/EditorShell';
import type { InputEditorHandle } from './components/InputEditor';
import type { OutputEditorHandle } from './components/OutputEditor';
import { detectFallbackFormatLabel } from './prettifier/detectFallbackFormat';
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
type PrettifierRunOptions = {
  switchToOutputOnComplete: boolean;
};
type FallbackWaitState = {
  requestId: number;
  formatLabel: string;
  agentName: string;
  progressLine: string | null;
};
type FallbackAgentOption = {
  id: string;
  name: string;
  enabled: boolean;
};

const EMPTY_FILE_NOTICE = 'File has no content.';
const UNKNOWN_FALLBACK_AGENT_NAME = 'fallback agent';

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

const getConfiguredFallbackAgent = (
  preferences: Preferences,
): { shouldWaitForFallback: boolean; agentName: string } => {
  if (!preferences.fallbackAgentId) {
    return {
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    };
  }

  const fallbackAgent = preferences.agents.find(
    (agent) => agent.id === preferences.fallbackAgentId && agent.enabled,
  );

  if (!fallbackAgent) {
    return {
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    };
  }

  return {
    shouldWaitForFallback: true,
    agentName: fallbackAgent.name,
  };
};

export const App = () => {
  const inputEditorRef = useRef<InputEditorHandle>(null);
  const outputEditorRef = useRef<OutputEditorHandle>(null);
  const latestThemeRequestIdRef = useRef(0);
  const latestFallbackAgentRequestIdRef = useRef(0);
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
  const [fallbackWaitState, setFallbackWaitState] = useState<FallbackWaitState | null>(null);
  const [fallbackAgentId, setFallbackAgentId] = useState<string | null>(null);
  const [fallbackAgentOptions, setFallbackAgentOptions] = useState<FallbackAgentOption[]>([]);

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
    async (
      nextInputText: string,
      trigger: PrettifyTrigger,
      options: PrettifierRunOptions,
    ): Promise<void> => {
      const requestId = latestPrettifyRequestIdRef.current + 1;
      latestPrettifyRequestIdRef.current = requestId;
      setIsLlmRunning(false);
      setFallbackWaitState(null);
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
        if (options.switchToOutputOnComplete) {
          setPaneMode('output');
        }
        return;
      }

      const api = getWindowApi();
      if (!api) {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(nextInputText);
        lastPrettifiedInputRef.current = nextInputText;
        if (options.switchToOutputOnComplete) {
          setPaneMode('output');
        }
        return;
      }

      let shouldWaitForFallback = true;
      let fallbackAgentName = UNKNOWN_FALLBACK_AGENT_NAME;

      try {
        const preferences = await api.preferences.getAll();

        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        const fallbackAgent = getConfiguredFallbackAgent(preferences);
        shouldWaitForFallback = fallbackAgent.shouldWaitForFallback;
        fallbackAgentName = fallbackAgent.agentName;
      } catch (error) {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        console.error('Failed to resolve fallback agent before prettifier run', error);
      }

      if (shouldWaitForFallback) {
        setFallbackWaitState({
          requestId,
          formatLabel: detectFallbackFormatLabel(nextInputText),
          agentName: fallbackAgentName,
          progressLine: null,
        });
        setIsLlmRunning(true);
      }

      try {
        const response = await api.prettifier.run({
          requestId,
          inputText: nextInputText,
          indentSize,
          trigger,
        });

        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(response.outputText);
        lastPrettifiedInputRef.current = nextInputText;
        if (options.switchToOutputOnComplete) {
          setPaneMode('output');
        }
      } catch (error) {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(nextInputText);
        lastPrettifiedInputRef.current = nextInputText;
        if (options.switchToOutputOnComplete) {
          setPaneMode('output');
        }
        console.error('Failed to run prettifier fallback', error);
      } finally {
        if (requestId === latestPrettifyRequestIdRef.current) {
          setIsLlmRunning(false);
          setFallbackWaitState(null);
        }
      }
    },
    [indentSize, logTelemetry, prettifierService, setPaneMode],
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
        setFallbackWaitState(null);
        setOutputText('');
        setPaneMode('input');
        setIngestNotice(EMPTY_FILE_NOTICE);
        return;
      }

      if (nextText.trim().length === 0) {
        latestPrettifyRequestIdRef.current += 1;
        lastPrettifiedInputRef.current = null;
        setIsLlmRunning(false);
        setFallbackWaitState(null);
        setOutputText('');
        setPaneMode('input');
        if (source !== 'paste') {
          setIngestNotice(null);
        }
        return;
      }

      setIngestNotice(null);
      void runPrettifier(nextText, getIngestTrigger(source), {
        switchToOutputOnComplete: true,
      });
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
    setFallbackWaitState(null);
    setOutputText('');
    reset();
  }, [reset]);

  const handlePaneModeChange = useCallback(
    (nextMode: 'input' | 'output'): void => {
      if (isLlmRunning) {
        return;
      }

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

      void runPrettifier(inputText, 'switch-output', {
        switchToOutputOnComplete: false,
      });
    },
    [hasContent, inputText, isLlmRunning, logTelemetry, paneMode, runPrettifier, setPaneMode],
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

  const persistFallbackAgentId = useCallback(
    async (nextFallbackAgentId: string | null): Promise<void> => {
      const previousFallbackAgentId = fallbackAgentId;
      if (nextFallbackAgentId === previousFallbackAgentId) {
        return;
      }

      setFallbackAgentId(nextFallbackAgentId);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = latestFallbackAgentRequestIdRef.current + 1;
      latestFallbackAgentRequestIdRef.current = requestId;

      try {
        const updatedPreferences = await api.preferences.update({
          fallbackAgentId: nextFallbackAgentId,
        });

        if (requestId === latestFallbackAgentRequestIdRef.current) {
          setFallbackAgentId(updatedPreferences.fallbackAgentId);
          setFallbackAgentOptions(
            updatedPreferences.agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              enabled: agent.enabled,
            })),
          );
        }
      } catch (error) {
        if (requestId === latestFallbackAgentRequestIdRef.current) {
          setFallbackAgentId(previousFallbackAgentId);
        }

        console.error('Failed to persist fallback agent preferences', error);
      }
    },
    [fallbackAgentId],
  );

  useEffect(() => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    return api.prettifier.onProgress((event) => {
      setFallbackWaitState((currentState) => {
        if (!currentState || currentState.requestId !== event.requestId) {
          return currentState;
        }

        return {
          ...currentState,
          progressLine: event.line,
        };
      });
    });
  }, []);

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
          setFallbackAgentId(preferences.fallbackAgentId);
          setFallbackAgentOptions(
            preferences.agents.map((agent) => ({
              id: agent.id,
              name: agent.name,
              enabled: agent.enabled,
            })),
          );
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
          fallbackAgentId={fallbackAgentId}
          fallbackAgentOptions={fallbackAgentOptions}
          hasContent={hasContent}
          onNew={handleNew}
          onPaneModeChange={handlePaneModeChange}
          onCollapseAll={collapseActiveEditor}
          onExpandAll={expandActiveEditor}
          onSave={() => void saveOutput()}
          onCopy={() => void copyOutput()}
          onThemeModeChange={(mode) => void persistThemeMode(mode)}
          onFallbackAgentIdChange={(agentId) => void persistFallbackAgentId(agentId)}
        />

        <EditorShell
          paneMode={paneMode}
          themeMode={themeMode}
          indentSize={indentSize}
          inputText={inputText}
          outputText={outputText}
          outputDocumentId={outputDocumentId}
          ingestNotice={ingestNotice}
          fallbackWaitState={fallbackWaitState}
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
