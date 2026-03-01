import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import type { PrettifyRunResponse, PrettifyTrigger } from '../../../../src/shared/prettifier';
import type { PaneMode } from '../../../../src/shared/types';
import type { WindowApi } from '../../../../src/shared/window-api';
import type { FallbackWaitState, IngestSource } from '../../../../src/renderer/app/appDomain';
import { usePrettifierFlow } from '../../../../src/renderer/app/usePrettifierFlow';

const createPreferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  version: 2,
  themeMode: 'light',
  indentSize: 2,
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
};

type HarnessProps = {
  api: WindowApi | null;
  logTelemetry: (
    name: string,
    meta: Record<string, string | number | boolean | null>,
  ) => Promise<void>;
};

const PrettifierHarness = forwardRef<HarnessHandle, HarnessProps>(({ api, logTelemetry }, ref) => {
  const [paneMode, setPaneMode] = useState<PaneMode>('input');
  const [inputText, setInputText] = useState('');
  const [ingestNotice, setIngestNotice] = useState<string | null>(null);
  const getWindowApi = useCallback(() => api, [api]);
  const flow = usePrettifierFlow({
    indentSize: 2,
    setPaneMode,
    setInputText,
    setIngestNotice,
    fallbackAgentId: 'codex',
    fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
    getWindowApi,
    logTelemetry,
  });

  useImperativeHandle(
    ref,
    () => ({
      ingestInputText: flow.ingestInputText,
      runPrettifier: flow.runPrettifier,
      getPaneMode: () => paneMode,
      getInputText: () => inputText,
      getOutputText: () => flow.outputText,
      getIngestNotice: () => ingestNotice,
      getIsLlmRunning: () => flow.isLlmRunning,
      getFallbackWaitState: () => flow.fallbackWaitState,
    }),
    [flow, ingestNotice, inputText, paneMode],
  );

  return null;
});

PrettifierHarness.displayName = 'PrettifierHarness';

describe('usePrettifierFlow', () => {
  it('applies local prettifier result and switches to output on ingestion', async () => {
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockResolvedValue(createPrettifierResponse());
    const onProgress = vi.fn().mockImplementation(() => vi.fn());
    const telemetry = vi.fn().mockResolvedValue(undefined);
    const api: WindowApi = {
      dialog: { openFile: vi.fn() },
      file: { save: vi.fn() },
      clipboard: { copy: vi.fn() },
      app: { getInfo: vi.fn(), initialThemeMode: null },
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, onProgress },
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

  it('shows fallback wait state and updates progress for active request', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    let onProgressListener: ((event: { requestId: number; line: string }) => void) | null = null;
    const getAll = vi.fn().mockResolvedValue(createPreferences());
    const run = vi.fn().mockReturnValue(deferred.promise);
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
      app: { getInfo: vi.fn(), initialThemeMode: null },
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, onProgress },
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
      onProgressListener?.({ requestId: request.requestId, line: 'Analyzing malformed object...' });
    });

    expect(ref.current?.getFallbackWaitState()?.progressLine).toBe('Analyzing malformed object...');

    deferred.resolve(createPrettifierResponse({ outputText: '{\n  "done": true\n}' }));

    await waitFor(() => {
      expect(ref.current?.getIsLlmRunning()).toBe(false);
    });
    expect(ref.current?.getFallbackWaitState()).toBeNull();
    expect(ref.current?.getOutputText()).toContain('"done": true');
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
      app: { getInfo: vi.fn(), initialThemeMode: null },
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll, update: vi.fn(), reset: vi.fn() },
      prettifier: { run, onProgress },
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
});
