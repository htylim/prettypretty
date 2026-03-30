import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useCallback, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import type { PrettifyRunResponse, PrettifyTrigger } from '../../../../src/shared/prettifier';
import type { PaneMode } from '../../../../src/shared/types';
import type { WindowApi } from '../../../../src/shared/window-api';
import type { FallbackWaitState, IngestSource } from '../../../../src/renderer/app/appDomain';
import { createInitialDocumentSessionState } from '../../../../src/renderer/app/session/documentSessionDomain';
import {
  selectFallbackWaitState,
  selectIngestNotice,
  selectInputText,
  selectPaneMode,
  selectOutputText,
} from '../../../../src/renderer/app/session/documentSessionSelectors';
import { useDocumentSession } from '../../../../src/renderer/app/session/useDocumentSession';
import { usePrettifierFlow } from '../../../../src/renderer/app/usePrettifierFlow';

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
  localDetection: 'malformed',
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
  ingestInputText: (nextText: string, source: IngestSource) => void;
  cancelActiveFallback: () => Promise<void>;
  runPrettifier: (
    nextInputText: string,
    trigger: PrettifyTrigger,
    options: { switchToOutputOnComplete: boolean },
  ) => Promise<void>;
  getPaneMode: () => PaneMode;
  getInputText: () => string;
  getOutputText: () => string;
  getIngestNotice: () => string | null;
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
    const ingestNotice = useDocumentSession(selectIngestNotice);
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
        cancelActiveFallback: flow.cancelActiveFallback,
        runPrettifier: flow.runPrettifier,
        getPaneMode: () => paneMode,
        getInputText: () => inputText,
        getOutputText: () => outputText,
        getIngestNotice: () => ingestNotice,
        getIsLlmRunning: () => flow.isLlmRunning,
        getFallbackWaitState: () => fallbackWaitState,
        isInputAlreadyPrettified: flow.isInputAlreadyPrettified,
      }),
      [fallbackWaitState, flow, ingestNotice, inputText, outputText, paneMode],
    );

    return null;
  },
);

PrettifierHarness.displayName = 'PrettifierHarness';

const createAppApi = () => ({
  getInfo: vi.fn(),
  openWindow: vi.fn(),
  onResetCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
  onNavigationCommand: vi.fn().mockImplementation(() => vi.fn()),
  initialThemeMode: null,
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
      file: { save: vi.fn() },
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
    expect(run).not.toHaveBeenCalled();
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
      file: { save: vi.fn() },
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
      file: { save: vi.fn() },
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
      file: { save: vi.fn() },
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
      file: { save: vi.fn() },
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
});
