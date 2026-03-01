import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PrettifyRunStatus, PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';
import type { PaneMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import { detectFallbackFormatLabel } from '../prettifier/detectFallbackFormat';
import { createPrettifierService } from '../prettifier/prettifierService';
import { reindentText } from '../prettifier/reindentText';
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

type OutputFormattingState = {
  isPrettified: boolean;
  indentSize: IndentSize | null;
};

type OutputReindentSnapshot = {
  outputText: string;
  formattingState: OutputFormattingState;
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
  reindentOutputIfPrettified: (options: {
    paneMode: PaneMode;
    inputText: string;
    nextIndentSize: IndentSize;
  }) => OutputReindentSnapshot | null;
  restoreOutputFromSnapshot: (snapshot: OutputReindentSnapshot | null) => void;
  alignOutputIndentAfterPersist: (
    requestedIndentSize: IndentSize,
    persistedIndentSize: IndentSize,
  ) => void;
};

const createEmptyFormattingState = (): OutputFormattingState => ({
  isPrettified: false,
  indentSize: null,
});

const isAppliedPrettifyStatus = (status: PrettifyRunStatus): boolean => {
  return status === 'applied-local' || status === 'applied-fallback';
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
  const outputFormattingRef = useRef<OutputFormattingState>(createEmptyFormattingState());
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
      outputFormattingRef.current = createEmptyFormattingState();

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
        outputFormattingRef.current = {
          isPrettified: true,
          indentSize,
        };
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
        outputFormattingRef.current = createEmptyFormattingState();
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
        outputFormattingRef.current = {
          isPrettified: isAppliedPrettifyStatus(response.status),
          indentSize: isAppliedPrettifyStatus(response.status) ? indentSize : null,
        };
        if (options.switchToOutputOnComplete) {
          setPaneMode('output');
        }
      } catch (error) {
        if (requestId !== latestPrettifyRequestIdRef.current) {
          return;
        }

        setOutputText(nextInputText);
        lastPrettifiedInputRef.current = nextInputText;
        outputFormattingRef.current = createEmptyFormattingState();
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
        outputFormattingRef.current = createEmptyFormattingState();
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
        outputFormattingRef.current = createEmptyFormattingState();
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
    outputFormattingRef.current = createEmptyFormattingState();
  }, []);

  const isInputAlreadyPrettified = useCallback((input: string): boolean => {
    return lastPrettifiedInputRef.current === input;
  }, []);

  const reindentOutputIfPrettified = useCallback(
    (options: { paneMode: PaneMode; inputText: string; nextIndentSize: IndentSize }) => {
      const currentFormatting = outputFormattingRef.current;
      const hasInputContent = options.inputText.trim().length > 0;
      const canReindent =
        options.paneMode === 'output' &&
        hasInputContent &&
        currentFormatting.isPrettified &&
        currentFormatting.indentSize !== null &&
        currentFormatting.indentSize !== options.nextIndentSize;

      if (!canReindent || currentFormatting.indentSize === null) {
        return null;
      }
      const currentIndentSize = currentFormatting.indentSize;

      const snapshot: OutputReindentSnapshot = {
        outputText,
        formattingState: { ...currentFormatting },
      };

      setOutputText((currentOutputText) =>
        reindentText(currentOutputText, currentIndentSize, options.nextIndentSize),
      );
      outputFormattingRef.current = {
        isPrettified: true,
        indentSize: options.nextIndentSize,
      };

      return snapshot;
    },
    [outputText],
  );

  const restoreOutputFromSnapshot = useCallback((snapshot: OutputReindentSnapshot | null): void => {
    if (!snapshot) {
      return;
    }

    setOutputText(snapshot.outputText);
    outputFormattingRef.current = { ...snapshot.formattingState };
  }, []);

  const alignOutputIndentAfterPersist = useCallback(
    (requestedIndentSize: IndentSize, persistedIndentSize: IndentSize): void => {
      if (requestedIndentSize === persistedIndentSize) {
        return;
      }

      const currentFormatting = outputFormattingRef.current;
      if (!currentFormatting.isPrettified || currentFormatting.indentSize !== requestedIndentSize) {
        return;
      }

      setOutputText((currentOutputText) =>
        reindentText(currentOutputText, requestedIndentSize, persistedIndentSize),
      );
      outputFormattingRef.current = {
        isPrettified: true,
        indentSize: persistedIndentSize,
      };
    },
    [],
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
  }, [getWindowApi]);

  return {
    outputText,
    isLlmRunning,
    fallbackWaitState,
    runPrettifier,
    ingestInputText,
    resetPrettifierState,
    isInputAlreadyPrettified,
    reindentOutputIfPrettified,
    restoreOutputFromSnapshot,
    alignOutputIndentAfterPersist,
  };
};
