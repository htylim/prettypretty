import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useCallback, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import type { PrettifyRunResponse, PrettifyTrigger } from '../../../../src/shared/prettifier';
import type { PaneMode } from '../../../../src/shared/types';
import type { WindowApi } from '../../../../src/shared/window-api';
import type {
  FallbackWaitState,
  IngestRejectionPrompt,
  IngestSource,
} from '../../../../src/renderer/app/appDomain';
import { createInitialDocumentSessionState } from '../../../../src/renderer/app/session/documentSessionDomain';
import {
  selectFallbackWaitState,
  selectIngestRejectionPrompt,
  selectIngestNotice,
  selectInputText,
  selectOutputLanguageOverride,
  selectPaneMode,
  selectOutputText,
} from '../../../../src/renderer/app/session/documentSessionSelectors';
import { useDocumentSession } from '../../../../src/renderer/app/session/useDocumentSession';
import {
  type IngestInputTextResult,
  usePrettifierFlow,
} from '../../../../src/renderer/app/usePrettifierFlow';
import { MONACO_MAX_TOKENIZATION_LINE_LENGTH } from '../../../../src/renderer/app/appDomain';

const createPreferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  version: 2,
  themeMode: 'light',
  indentSize: 2,
  fallbackWarningLineThreshold: 300,
  agents: [
    {
      id: 'codex',
      name: 'Codex',
      executable: 'codex',
      argsTemplate: ['exec', '--skip-git-repo-check', '-'],
      promptTemplate: '{input}',
      promptDelivery: 'stdin',
      enabled: true,
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
    },
  ],
  fallbackAgentId: 'codex',
  ...overrides,
});

const createPrettifierResponse = (
  overrides: Partial<PrettifyRunResponse> = {},
): PrettifyRunResponse => ({
  status: 'applied-fallback',
  outputText: '{\n  "fallback": true\n}',
  localResult: {
    kind: 'failed',
    family: 'json-like',
    reason: 'malformed',
  },
  fallbackStatus: 'applied',
  agentId: 'codex',
  durationMs: 5,
  ...overrides,
});

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
};

type HarnessHandle = {
  ingestInputText: (
    nextText: string,
    source: IngestSource,
    options?: {
      fileSource?: {
        sourceToken: string;
        path: string;
        sourceKind: 'dialog-open-file' | 'startup-open-file' | 'refresh-file';
        baselineText: string;
      };
      switchToOutputOnComplete?: boolean;
      awaitPrettifierCompletion?: boolean;
      isCurrent?: () => boolean;
    },
  ) => Promise<IngestInputTextResult>;
  openReadableIngestSlice: () => void;
  dismissIngestRejection: () => void;
  cancelActiveFallback: () => Promise<void>;
  resetPrettifierState: () => void;
  runPrettifier: (
    nextInputText: string,
    trigger: PrettifyTrigger,
    options: { switchToOutputOnComplete: boolean; isResponseCurrent?: () => boolean },
  ) => Promise<void>;
  getPaneMode: () => PaneMode;
  getInputText: () => string;
  getOutputText: () => string;
  getOutputLanguageOverride: () => ReturnType<typeof selectOutputLanguageOverride>;
  getIngestNotice: () => string | null;
  getIngestRejectionPrompt: () => IngestRejectionPrompt | null;
  getIsLlmRunning: () => boolean;
  getFallbackWaitState: () => FallbackWaitState | null;
  isInputAlreadyPrettified: (input: string) => boolean;
};

type HarnessProps = {
  api: WindowApi | null;
  logTelemetry: (
    name: string,
    meta: Record<string, string | number | boolean | null>,
  ) => Promise<void>;
  requestFallbackConfirmation?: (lineCount: number) => Promise<boolean>;
  requestFallbackAgentSelection?: () => Promise<string | null>;
  fallbackWarningLineThreshold?: number;
  fallbackAgentId?: string | null;
  fallbackAgentOptions?: { id: string; name: string; enabled: boolean }[];
  indentSize?: 2 | 4 | 6 | 8;
};

const PrettifierHarness = forwardRef<HarnessHandle, HarnessProps>(
  (
    {
      api,
      logTelemetry,
      requestFallbackConfirmation = async () => true,
      requestFallbackAgentSelection = async () => null,
      fallbackWarningLineThreshold = 300,
      fallbackAgentId = 'codex',
      fallbackAgentOptions = [{ id: 'codex', name: 'Codex', enabled: true }],
      indentSize = 2,
    },
    ref,
  ) => {
    const getWindowApi = useCallback(() => api, [api]);
    const paneMode = useDocumentSession(selectPaneMode);
    const inputText = useDocumentSession(selectInputText);
    const outputText = useDocumentSession(selectOutputText);
    const outputLanguageOverride = useDocumentSession(selectOutputLanguageOverride);
    const ingestNotice = useDocumentSession(selectIngestNotice);
    const ingestRejectionPrompt = useDocumentSession(selectIngestRejectionPrompt);
    const fallbackWaitState = useDocumentSession(selectFallbackWaitState);
    const flow = usePrettifierFlow({
      indentSize,
      fallbackWarningLineThreshold,
      fallbackAgentId,
      fallbackAgentOptions,
      getWindowApi,
      requestFallbackConfirmation,
      requestFallbackAgentSelection,
      logTelemetry,
    });

    useImperativeHandle(
      ref,
      () => ({
        ingestInputText: flow.ingestInputText,
        openReadableIngestSlice: flow.openReadableIngestSlice,
        dismissIngestRejection: flow.dismissIngestRejection,
        cancelActiveFallback: flow.cancelActiveFallback,
        resetPrettifierState: flow.resetPrettifierState,
        runPrettifier: flow.runPrettifier,
        getPaneMode: () => paneMode,
        getInputText: () => inputText,
        getOutputText: () => outputText,
        getOutputLanguageOverride: () => outputLanguageOverride,
        getIngestNotice: () => ingestNotice,
        getIngestRejectionPrompt: () => ingestRejectionPrompt,
        getIsLlmRunning: () => flow.isLlmRunning,
        getFallbackWaitState: () => fallbackWaitState,
        isInputAlreadyPrettified: flow.isInputAlreadyPrettified,
      }),
      [
        fallbackWaitState,
        flow,
        ingestNotice,
        ingestRejectionPrompt,
        inputText,
        outputLanguageOverride,
        outputText,
        paneMode,
      ],
    );

    return null;
  },
);

PrettifierHarness.displayName = 'PrettifierHarness';

const createAppApi = () => ({
  getInfo: vi.fn(),
  openWindow: vi.fn(),
  consumeInitialOpenFile: vi.fn().mockResolvedValue(null),
  onResetCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
  onRefreshCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
  onNavigationCommand: vi.fn().mockImplementation(() => vi.fn()),
  initialThemeMode: null,
});

const createWindowApi = (overrides: Partial<WindowApi> = {}): WindowApi =>
  ({
    dialog: { openFile: vi.fn() },
    file: {
      save: vi.fn(),
      refreshOpenFile: vi.fn(),
      commitOpenFileSource: vi.fn().mockResolvedValue(true),
      clearOpenFileSource: vi.fn().mockResolvedValue(true),
    },
    clipboard: { copy: vi.fn() },
    app: createAppApi(),
    logs: { getHistory: vi.fn(), onLine: vi.fn() },
    preferences: {
      getAll: vi.fn().mockResolvedValue(createPreferences()),
      update: vi.fn(),
      reset: vi.fn(),
    },
    prettifier: {
      run: vi.fn().mockResolvedValue(createPrettifierResponse()),
      cancel: vi.fn().mockResolvedValue(true),
      onProgress: vi.fn().mockImplementation(() => vi.fn()),
    },
    telemetry: { log: vi.fn() },
    ...overrides,
  }) as WindowApi;

const createPendingFileSource = (
  overrides: Partial<{
    sourceToken: string;
    path: string;
    sourceKind: 'dialog-open-file' | 'startup-open-file' | 'refresh-file';
    baselineText: string;
  }> = {},
) => ({
  sourceToken: 'token-1',
  path: '/tmp/source.json',
  sourceKind: 'dialog-open-file' as const,
  baselineText: '{"a":1}',
  ...overrides,
});

describe('usePrettifierFlow', () => {
  beforeEach(() => {
    useDocumentSession.setState(createInitialDocumentSessionState());
  });

  it('applies local prettifier result and switches to output on ingestion', async () => {
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockResolvedValue(createPrettifierResponse());
    const onProgress = vi.fn().mockImplementation(() => vi.fn());
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, cancel: vi.fn().mockResolvedValue(true), onProgress },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: telemetry, ref }));

    act(() => {
      ref.current?.ingestInputText('{"a":1}', 'paste');
    });

    await waitFor(() => {
      expect(ref.current?.getPaneMode()).toBe('output');
    });
    expect(ref.current?.getInputText()).toBe('{"a":1}');
    expect(ref.current?.getOutputText()).toContain('"a": 1');
    expect(ref.current?.getIngestRejectionPrompt()).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('awaits prettifier completion when ingestion requests it', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    const run = vi.fn().mockReturnValue(deferred.promise);
    const api = createWindowApi({
      prettifier: {
        run,
        cancel: vi.fn().mockResolvedValue(true),
        onProgress: vi.fn().mockImplementation(() => vi.fn()),
      },
    });
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    let settled = false;
    let ingestPromise!: Promise<IngestInputTextResult>;
    act(() => {
      ingestPromise = ref.current!.ingestInputText('{bad', 'refresh-file', {
        awaitPrettifierCompletion: true,
      });
      void ingestPromise.then(() => {
        settled = true;
      });
    });

    await waitFor(() => {
      expect(run).toHaveBeenCalled();
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await act(async () => {
      deferred.resolve(createPrettifierResponse());
      await expect(ingestPromise).resolves.toBe('accepted');
    });
    expect(settled).toBe(true);
  });

  it('does not apply prettifier output when the response guard turns stale after request', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    const run = vi.fn().mockReturnValue(deferred.promise);
    const api = createWindowApi({
      prettifier: {
        run,
        cancel: vi.fn().mockResolvedValue(true),
        onProgress: vi.fn().mockImplementation(() => vi.fn()),
      },
    });
    const ref = { current: null as HarnessHandle | null };
    let isResponseCurrent = true;

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    let prettifierPromise!: Promise<void>;
    act(() => {
      prettifierPromise = ref.current!.runPrettifier('{bad', 'refresh-file', {
        switchToOutputOnComplete: true,
        isResponseCurrent: () => isResponseCurrent,
      });
    });

    await waitFor(() => {
      expect(run).toHaveBeenCalled();
    });

    isResponseCurrent = false;
    await act(async () => {
      deferred.resolve(createPrettifierResponse());
      await prettifierPromise;
    });

    expect(ref.current?.getOutputText()).toBe('{bad');
    expect(ref.current?.getPaneMode()).toBe('input');
  });

  it('prompts before opening a readable slice for oversized ingest input', async () => {
    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      paneMode: 'output',
      inputText: '{"existing":true}',
      outputText: '{\n  "existing": true\n}',
      lastPrettifiedInput: '{"existing":true}',
    });
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockResolvedValue(createPrettifierResponse());
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, cancel: vi.fn().mockResolvedValue(true), onProgress: vi.fn() },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: telemetry, ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'paste');
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()?.message).toContain("won't open");
    });
    expect(ref.current?.getPaneMode()).toBe('output');
    expect(ref.current?.getInputText()).toBe('{"existing":true}');
    expect(ref.current?.getOutputText()).toContain('"existing": true');
    expect(run).not.toHaveBeenCalled();
  });

  it('opens the readable slice after the oversized-ingest prompt is accepted', async () => {
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api: null, logTelemetry: telemetry, ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'paste');
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).not.toBeNull();
    });

    act(() => {
      ref.current?.openReadableIngestSlice();
    });

    await waitFor(() => {
      expect(ref.current?.getPaneMode()).toBe('output');
    });
    expect(ref.current?.getIngestRejectionPrompt()).toBeNull();
    expect(ref.current?.getInputText()).toHaveLength(MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1);
    expect(ref.current?.getOutputText()).toHaveLength(MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1);
    expect(telemetry).toHaveBeenCalledWith(
      'renderer.ingest.paste',
      expect.objectContaining({
        inputLength: MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1,
        openedReadableSlice: true,
        originalInputLength: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
      }),
    );
  });

  it('shows fallback wait state and keeps the last five progress lines for the active request', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    let onProgressListener: ((event: { requestId: number; line: string }) => void) | null = null;
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockReturnValue(deferred.promise);
    const cancel = vi.fn().mockResolvedValue(true);
    const onProgress = vi.fn().mockImplementation((listener) => {
      onProgressListener = listener;
      return () => {
        onProgressListener = null;
      };
    });
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, cancel, onProgress },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: telemetry, ref }));

    act(() => {
      void ref.current?.runPrettifier('{bad', 'switch-output', {
        switchToOutputOnComplete: false,
      });
    });

    await waitFor(() => {
      expect(ref.current?.getFallbackWaitState()).not.toBeNull();
    });
    expect(ref.current?.getIsLlmRunning()).toBe(true);

    const request = run.mock.calls[0]?.[0] as { requestId: number };
    act(() => {
      onProgressListener?.({ requestId: request.requestId, line: 'line 1' });
      onProgressListener?.({ requestId: request.requestId, line: 'line 2' });
      onProgressListener?.({ requestId: request.requestId, line: 'line 3' });
      onProgressListener?.({ requestId: request.requestId, line: 'line 4' });
      onProgressListener?.({ requestId: request.requestId, line: 'line 5' });
      onProgressListener?.({ requestId: request.requestId, line: 'line 6' });
    });

    expect(ref.current?.getFallbackWaitState()?.progressLines).toEqual([
      'line 2',
      'line 3',
      'line 4',
      'line 5',
      'line 6',
    ]);

    deferred.resolve(createPrettifierResponse({ outputText: '{\n  "done": true\n}' }));

    await waitFor(() => {
      expect(ref.current?.getIsLlmRunning()).toBe(false);
    });
    expect(ref.current?.getFallbackWaitState()).toBeNull();
    expect(ref.current?.getOutputText()).toContain('"done": true');
  });

  it('clears the root output language override as soon as a new prettify run starts', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockReturnValue(deferred.promise);
    const telemetry = vi.fn().mockResolvedValue(undefined);

    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      paneMode: 'output',
      outputText: '{\n  "existing": true\n}',
      outputLanguageOverride: 'json',
      lastPrettifiedInput: '{"existing":true}',
    });

    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, cancel: vi.fn().mockResolvedValue(true), onProgress: vi.fn() },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: telemetry, ref }));

    act(() => {
      void ref.current?.runPrettifier('{bad', 'switch-output', {
        switchToOutputOnComplete: false,
      });
    });

    expect(ref.current?.getOutputText()).toBe('{bad');
    expect(ref.current?.getOutputLanguageOverride()).toBeNull();

    deferred.resolve(createPrettifierResponse({ outputText: '{\n  "done": true\n}' }));

    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it('treats non-remappable prettified output with a stale indent as needing a fresh prettify', () => {
    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      inputText: 'query Shipment{id}',
      outputText: 'query Shipment {\n  id\n}',
      outputFormattingState: {
        isPrettified: true,
        indentSize: 2,
        reindentStrategy: 'none',
      },
      lastPrettifiedInput: 'query Shipment{id}',
    });

    const ref = { current: null as HarnessHandle | null };

    render(
      createElement(PrettifierHarness, {
        api: null,
        indentSize: 4,
        logTelemetry: vi.fn().mockResolvedValue(undefined),
        ref,
      }),
    );

    expect(ref.current?.isInputAlreadyPrettified('query Shipment{id}')).toBe(false);
  });

  it('cancels the active fallback request and keeps passthrough output visible', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockReturnValue(deferred.promise);
    const cancel = vi.fn().mockResolvedValue(true);
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: {
        run,
        cancel,
        onProgress: vi.fn().mockImplementation(() => vi.fn()),
      },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: telemetry, ref }));

    act(() => {
      void ref.current?.runPrettifier('{bad', 'switch-output', {
        switchToOutputOnComplete: true,
      });
    });

    await waitFor(() => {
      expect(ref.current?.getFallbackWaitState()).not.toBeNull();
    });

    const request = run.mock.calls[0]?.[0] as { requestId: number };
    await act(async () => {
      await ref.current?.cancelActiveFallback();
    });

    expect(cancel).toHaveBeenCalledWith({ requestId: request.requestId });
    expect(ref.current?.getIsLlmRunning()).toBe(false);
    expect(ref.current?.getFallbackWaitState()).toBeNull();
    await waitFor(() => {
      expect(ref.current?.getPaneMode()).toBe('output');
    });
    expect(ref.current?.getOutputText()).toBe('{bad');

    deferred.resolve(createPrettifierResponse({ fallbackStatus: 'failed-canceled' }));

    await waitFor(() => {
      expect(ref.current?.getOutputText()).toBe('{bad');
    });
  });

  it('ignores stale fallback responses when a newer request is in flight', async () => {
    const first = createDeferred<PrettifyRunResponse>();
    const second = createDeferred<PrettifyRunResponse>();
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onProgress = vi.fn().mockImplementation(() => vi.fn());
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, cancel: vi.fn().mockResolvedValue(true), onProgress },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: telemetry, ref }));

    act(() => {
      void ref.current?.runPrettifier('{bad1', 'switch-output', {
        switchToOutputOnComplete: false,
      });
    });

    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    act(() => {
      void ref.current?.runPrettifier('{bad2', 'switch-output', {
        switchToOutputOnComplete: false,
      });
    });

    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });

    first.resolve(createPrettifierResponse({ outputText: '{\n  "stale": 1\n}' }));
    second.resolve(createPrettifierResponse({ outputText: '{\n  "latest": 2\n}' }));

    await waitFor(() => {
      expect(ref.current?.getOutputText()).toContain('"latest": 2');
    });
    expect(ref.current?.getOutputText()).not.toContain('"stale": 1');
  });

  it('falls back to passthrough output when bridge is unavailable', async () => {
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api: null, logTelemetry: telemetry, ref }));

    act(() => {
      ref.current?.ingestInputText('{bad', 'paste');
    });

    await waitFor(() => {
      expect(ref.current?.getPaneMode()).toBe('output');
    });
    expect(ref.current?.getOutputText()).toBe('{bad');
    expect(ref.current?.getIsLlmRunning()).toBe(false);
    expect(ref.current?.getFallbackWaitState()).toBeNull();
  });

  it('asks confirmation before fallback when line threshold is exceeded', async () => {
    const confirmation = vi.fn().mockResolvedValue(true);
    const run = vi.fn().mockResolvedValue(createPrettifierResponse());
    const onProgress = vi.fn().mockImplementation(() => vi.fn());
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
      clipboard: { copy: vi.fn() },
      app: createAppApi(),
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: {
        getAll: vi.fn().mockResolvedValue(createPreferences()),
        update: vi.fn(),
        reset: vi.fn(),
      },
      prettifier: { run, cancel: vi.fn().mockResolvedValue(true), onProgress },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(
      createElement(PrettifierHarness, {
        api,
        logTelemetry: telemetry,
        ref,
        requestFallbackConfirmation: confirmation,
        fallbackWarningLineThreshold: 1,
      }),
    );

    act(() => {
      void ref.current?.runPrettifier('{bad\nline 2\nline 3', 'switch-output', {
        switchToOutputOnComplete: false,
      });
    });

    await waitFor(() => {
      expect(confirmation).toHaveBeenCalledWith(3);
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('sets file source only after accepted open-file ingestion', async () => {
    const commitOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource,
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('{"a":1}', 'open-file', {
        fileSource: createPendingFileSource(),
      });
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource).toEqual({
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"a":1}',
      });
    });
    expect(commitOpenFileSource).toHaveBeenCalledWith({
      sourceToken: 'token-1',
      path: '/tmp/source.json',
    });
  });

  it('sets required file source token path and sourceKind for dialog and startup files', async () => {
    const api = createWindowApi();
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('{"dialog":true}', 'open-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'dialog-token',
          path: '/tmp/dialog.json',
          sourceKind: 'dialog-open-file',
          baselineText: '{"dialog":true}',
        }),
      });
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource).toMatchObject({
        sourceToken: 'dialog-token',
        path: '/tmp/dialog.json',
        sourceKind: 'dialog-open-file',
      });
    });

    act(() => {
      ref.current?.ingestInputText('{"startup":true}', 'open-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'startup-token',
          path: '/tmp/startup.json',
          sourceKind: 'startup-open-file',
          baselineText: '{"startup":true}',
        }),
      });
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource).toMatchObject({
        sourceToken: 'startup-token',
        path: '/tmp/startup.json',
        sourceKind: 'startup-open-file',
      });
    });
  });

  it('clears file source after paste ingestion', async () => {
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"a":1}',
      },
    });
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('{"pasted":true}', 'paste');
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource).toBeNull();
    });
    expect(clearOpenFileSource).toHaveBeenCalledWith({
      sourceToken: 'token-1',
      path: '/tmp/source.json',
      scope: 'committed',
    });
  });

  it('clears file source after drop ingestion without trusted path', async () => {
    const api = createWindowApi();
    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"a":1}',
      },
    });
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('{"dropped":true}', 'drop');
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource).toBeNull();
    });
  });

  it('defers file source update when file-backed ingest is blocked by Monaco limits', async () => {
    const commitOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource,
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).not.toBeNull();
    });
    expect(useDocumentSession.getState().fileSource).toBeNull();
    expect(commitOpenFileSource).not.toHaveBeenCalled();
  });

  it('sets file source to readable slice after accepting blocked file-backed ingest', async () => {
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).not.toBeNull();
    });

    act(() => {
      ref.current?.openReadableIngestSlice();
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource?.lastLoadedText).toHaveLength(
        MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1,
      );
    });
    expect(ref.current?.getIngestRejectionPrompt()).toBeNull();
    expect(clearOpenFileSource).not.toHaveBeenCalledWith({
      sourceToken: 'token-1',
      path: '/tmp/source.json',
      scope: 'pending',
    });
  });

  it('keeps oversized readable-slice refresh in input mode when requested', async () => {
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText(
        'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        'refresh-file',
        {
          fileSource: createPendingFileSource({
            sourceKind: 'refresh-file',
            baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
          }),
          switchToOutputOnComplete: false,
        },
      );
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).not.toBeNull();
    });

    act(() => {
      ref.current?.openReadableIngestSlice();
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).toBeNull();
    });
    expect(ref.current?.getPaneMode()).toBe('input');
  });

  it('keeps blocked file-backed ingest prompt when readable-slice commit fails', async () => {
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockRejectedValue(new Error('commit failed')),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'blocked-token',
          baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()?.pendingFileSource?.sourceToken).toBe(
        'blocked-token',
      );
    });

    act(() => {
      ref.current?.openReadableIngestSlice();
    });

    await waitFor(() => {
      expect(ref.current?.getIngestNotice()).toBe('Unable to refresh file.');
    });
    expect(ref.current?.getIngestRejectionPrompt()?.pendingFileSource?.sourceToken).toBe(
      'blocked-token',
    );
    expect(clearOpenFileSource).not.toHaveBeenCalledWith({
      sourceToken: 'blocked-token',
      path: '/tmp/source.json',
      scope: 'pending',
    });
  });

  it('ignores duplicate readable-slice accepts while file-source commit is in flight', async () => {
    const commitDeferred = createDeferred<boolean>();
    const commitOpenFileSource = vi.fn().mockReturnValue(commitDeferred.promise);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource,
        clearOpenFileSource: vi.fn().mockResolvedValue(true),
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).not.toBeNull();
    });

    act(() => {
      ref.current?.openReadableIngestSlice();
      ref.current?.openReadableIngestSlice();
    });

    expect(commitOpenFileSource).toHaveBeenCalledTimes(1);

    await act(async () => {
      commitDeferred.resolve(true);
      await commitDeferred.promise;
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource?.lastLoadedText).toHaveLength(
        MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1,
      );
    });
    expect(ref.current?.getIngestNotice()).toBeNull();
  });

  it('commits empty trusted file as refreshable with empty baseline', async () => {
    const api = createWindowApi();
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('', 'open-file', {
        fileSource: createPendingFileSource({ baselineText: '' }),
      });
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fileSource).toMatchObject({
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        lastLoadedText: '',
      });
    });
    expect(ref.current?.getPaneMode()).toBe('input');
    expect(ref.current?.getIngestNotice()).toBe('File has no content.');
  });

  it('stores pending file-source metadata on blocked file-backed ingest prompts', async () => {
    const ref = { current: null as HarnessHandle | null };

    render(
      createElement(PrettifierHarness, { api: createWindowApi(), logTelemetry: vi.fn(), ref }),
    );

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'blocked-token',
          path: '/tmp/blocked.json',
          sourceKind: 'refresh-file',
          baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()).toMatchObject({
        pendingFileSource: {
          sourceToken: 'blocked-token',
          path: '/tmp/blocked.json',
          sourceKind: 'refresh-file',
        },
      });
    });
  });

  it('stale dialog-open commit result does not overwrite newer input', async () => {
    const commitDeferred = createDeferred<boolean>();
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockReturnValue(commitDeferred.promise),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      void ref.current?.ingestInputText('{"file":true}', 'open-file', {
        fileSource: createPendingFileSource(),
      });
      useDocumentSession.setState({ inputText: 'newer edit' });
    });

    await act(async () => {
      commitDeferred.resolve(true);
      await commitDeferred.promise;
    });

    await waitFor(() => {
      expect(clearOpenFileSource).toHaveBeenCalledWith({
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        scope: 'committed',
      });
    });
    expect(useDocumentSession.getState().inputText).toBe('newer edit');
    expect(useDocumentSession.getState().fileSource).toBeNull();
  });

  it('stale refresh commit result does not overwrite an invalidated refresh request', async () => {
    const commitDeferred = createDeferred<boolean>();
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockReturnValue(commitDeferred.promise),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };
    let isCurrent = true;
    useDocumentSession.setState({
      inputText: '{"old":true}',
      fileSource: {
        sourceToken: 'old-token',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"old":true}',
      },
    });

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    let ingestPromise: Promise<IngestInputTextResult> | undefined;
    act(() => {
      ingestPromise = ref.current?.ingestInputText('{"file":true}', 'refresh-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'refresh-token',
          sourceKind: 'refresh-file',
          baselineText: '{"file":true}',
        }),
        isCurrent: () => isCurrent,
      });
    });

    isCurrent = false;
    await act(async () => {
      commitDeferred.resolve(true);
      await commitDeferred.promise;
    });

    await expect(ingestPromise).resolves.toBe('stale');
    expect(clearOpenFileSource).toHaveBeenCalledWith({
      sourceToken: 'refresh-token',
      path: '/tmp/source.json',
      scope: 'committed',
    });
    expect(useDocumentSession.getState().inputText).toBe('{"old":true}');
    expect(useDocumentSession.getState().fileSource).toBeNull();
  });

  it('stale dialog-open commit result does not dismiss a newer blocked prompt', async () => {
    const commitDeferred = createDeferred<boolean>();
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockReturnValue(commitDeferred.promise),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      void ref.current?.ingestInputText('{"file":true}', 'open-file', {
        fileSource: createPendingFileSource({ sourceToken: 'first-token' }),
      });
    });

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'second-token',
          path: '/tmp/second.json',
          baselineText: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
        }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()?.pendingFileSource?.sourceToken).toBe(
        'second-token',
      );
    });

    await act(async () => {
      commitDeferred.resolve(true);
      await commitDeferred.promise;
    });

    expect(ref.current?.getIngestRejectionPrompt()?.pendingFileSource?.sourceToken).toBe(
      'second-token',
    );
    expect(clearOpenFileSource).toHaveBeenCalledWith({
      sourceToken: 'first-token',
      path: '/tmp/source.json',
      scope: 'committed',
    });
    expect(clearOpenFileSource).not.toHaveBeenCalledWith({
      sourceToken: 'second-token',
      path: '/tmp/second.json',
      scope: 'pending',
    });
  });

  it('clears pending file-source token when commit fails', async () => {
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockRejectedValue(new Error('commit failed')),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      void ref.current?.ingestInputText('{"file":true}', 'open-file', {
        fileSource: createPendingFileSource(),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestNotice()).toBe('Unable to refresh file.');
    });
    expect(clearOpenFileSource).toHaveBeenCalledWith({
      sourceToken: 'token-1',
      path: '/tmp/source.json',
      scope: 'pending',
    });
    expect(useDocumentSession.getState().fileSource).toBeNull();
  });

  it('stale paste clear result does not overwrite newer input', async () => {
    const clearDeferred = createDeferred<boolean>();
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource: vi.fn().mockReturnValue(clearDeferred.promise),
      },
    } as Partial<WindowApi>);
    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      inputText: '{"old":true}',
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"old":true}',
      },
    });
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      void ref.current?.ingestInputText('{"paste":true}', 'paste');
      useDocumentSession.setState({ inputText: 'newer edit' });
    });

    await act(async () => {
      clearDeferred.resolve(true);
      await clearDeferred.promise;
    });

    expect(useDocumentSession.getState().inputText).toBe('newer edit');
    expect(useDocumentSession.getState().fileSource).toBeNull();
  });

  it('clears stale pending file-source token when a blocked prompt is replaced', async () => {
    const clearOpenFileSource = vi.fn().mockResolvedValue(true);
    const api = createWindowApi({
      file: {
        save: vi.fn(),
        refreshOpenFile: vi.fn(),
        commitOpenFileSource: vi.fn().mockResolvedValue(true),
        clearOpenFileSource,
      },
    } as Partial<WindowApi>);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PrettifierHarness, { api, logTelemetry: vi.fn(), ref }));

    act(() => {
      ref.current?.ingestInputText('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({ sourceToken: 'first-token' }),
      });
    });

    await waitFor(() => {
      expect(ref.current?.getIngestRejectionPrompt()?.pendingFileSource?.sourceToken).toBe(
        'first-token',
      );
    });

    act(() => {
      ref.current?.ingestInputText('y'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH), 'open-file', {
        fileSource: createPendingFileSource({
          sourceToken: 'second-token',
          path: '/tmp/second.json',
        }),
      });
    });

    expect(clearOpenFileSource).toHaveBeenCalledWith({
      sourceToken: 'first-token',
      path: '/tmp/source.json',
      scope: 'pending',
    });
  });
});
