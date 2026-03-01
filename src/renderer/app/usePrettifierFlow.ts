import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import { detectFallbackFormatLabel } from '../prettifier/detectFallbackFormat';
import { createPrettifierService } from '../prettifier/prettifierService';
import {
  EMPTY_FILE_NOTICE,
  type FallbackAgentOption,
  type FallbackWaitState,
  type IngestSource,
  getConfiguredFallbackAgentFromSelection,
  getIngestEventName,
  getIngestTrigger,
  isFileIngestSource,
} from './appDomain';
import { reportRendererError } from './reportRendererError';

type PrettifierRunOptions = {
  switchToOutputOnComplete: boolean;
};

type TelemetryMeta = Record<string, string | number | boolean | null>;

type UsePrettifierFlowOptions = {
  indentSize: IndentSize;
  setPaneMode: (mode: PaneMode) => void;
  setInputText: (text: string) => void;
  setIngestNotice: (notice: string | null) => void;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  getWindowApi: () => WindowApi | null;
  logTelemetry: (name: TelemetryEventName, meta: TelemetryMeta) => Promise<void>;
};

export type UsePrettifierFlowResult = {
  outputText: string;
  isLlmRunning: boolean;
  fallbackWaitState: FallbackWaitState | null;
  runPrettifier: (
    nextInputText: string,
    trigger: PrettifyTrigger,
    options: PrettifierRunOptions,
  ) => Promise<void>;
  ingestInputText: (nextText: string, source: IngestSource) => void;
  resetPrettifierState: () => void;
  isInputAlreadyPrettified: (input: string) => boolean;
};

export const usePrettifierFlow = ({
  indentSize,
  setPaneMode,
  setInputText,
  setIngestNotice,
  fallbackAgentId,
  fallbackAgentOptions,
  getWindowApi,
  logTelemetry,
}: UsePrettifierFlowOptions): UsePrettifierFlowResult => {
  const latestPrettifyRequestIdRef = useRef(0);
  const lastPrettifiedInputRef = useRef<string | null>(null);
  const [outputText, setOutputText] = useState('');
  const [isLlmRunning, setIsLlmRunning] = useState(false);
  const [fallbackWaitState, setFallbackWaitState] = useState<FallbackWaitState | null>(null);

  const prettifierService = useMemo(() => createPrettifierService(indentSize), [indentSize]);

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

      const fallbackAgent = getConfiguredFallbackAgentFromSelection(
        fallbackAgentId,
        fallbackAgentOptions,
      );

      if (fallbackAgent.shouldWaitForFallback) {
        setFallbackWaitState({
          requestId,
          formatLabel: detectFallbackFormatLabel(nextInputText),
          agentName: fallbackAgent.agentName,
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
        reportRendererError('Failed to run prettifier fallback', error);
      } finally {
        if (requestId === latestPrettifyRequestIdRef.current) {
          setIsLlmRunning(false);
          setFallbackWaitState(null);
        }
      }
    },
    [
      fallbackAgentId,
      fallbackAgentOptions,
      getWindowApi,
      indentSize,
      logTelemetry,
      prettifierService,
      setPaneMode,
    ],
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

  const resetPrettifierState = useCallback(() => {
    latestPrettifyRequestIdRef.current += 1;
    lastPrettifiedInputRef.current = null;
    setIsLlmRunning(false);
    setFallbackWaitState(null);
    setOutputText('');
  }, []);

  const isInputAlreadyPrettified = useCallback((input: string): boolean => {
    return lastPrettifiedInputRef.current === input;
  }, []);

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
  }, [getWindowApi]);

  return {
    outputText,
    isLlmRunning,
    fallbackWaitState,
    runPrettifier,
    ingestInputText,
    resetPrettifierState,
    isInputAlreadyPrettified,
  };
};
