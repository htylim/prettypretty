import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useCallback, useImperativeHandle, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import type { ThemeMode } from '../../../../src/shared/types';
import type { WindowApi } from '../../../../src/shared/window-api';
import { usePreferencesFlow } from '../../../../src/renderer/app/usePreferencesFlow';

const createPreferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  version: 2,
  themeMode: 'light',
  indentSize: 2,
  fallbackWarningLineThreshold: 300,
  agents: [
    {
      id: 'amp',
      name: 'Amp',
      executable: 'amp',
      argsTemplate: ['-x'],
      promptTemplate: '{input}',
      promptDelivery: 'stdin',
      enabled: true,
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
    },
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

const baseAmpAgent = createPreferences().agents[0]!;
const baseCodexAgent = createPreferences().agents[1]!;

type HarnessHandle = {
  getThemeMode: () => ThemeMode;
  getIndentSize: () => number;
  getFallbackWarningLineThreshold: () => number;
  getFallbackAgentId: () => string | null;
  getFallbackAgentOptionIds: () => string[];
  persistThemeMode: (mode: ThemeMode) => Promise<void>;
  persistFallbackAgentId: (id: string | null) => Promise<void>;
};

type HarnessProps = {
  api: WindowApi | null;
};

const PreferencesHarness = forwardRef<HarnessHandle, HarnessProps>(({ api }, ref) => {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [indentSize, setIndentSize] = useState(2);
  const getWindowApi = useCallback(() => api, [api]);
  const flow = usePreferencesFlow({
    themeMode,
    setThemeMode,
    setIndentSize,
    getWindowApi,
  });

  useImperativeHandle(
    ref,
    () => ({
      getThemeMode: () => themeMode,
      getIndentSize: () => indentSize,
      getFallbackWarningLineThreshold: () => flow.fallbackWarningLineThreshold,
      getFallbackAgentId: () => flow.fallbackAgentId,
      getFallbackAgentOptionIds: () => flow.fallbackAgentOptions.map((option) => option.id),
      persistThemeMode: flow.persistThemeMode,
      persistFallbackAgentId: flow.persistFallbackAgentId,
    }),
    [flow, indentSize, themeMode],
  );

  return null;
});

PreferencesHarness.displayName = 'PreferencesHarness';

const createWindowApi = (
  getAll: () => Promise<Preferences>,
  update: (patch: Record<string, unknown>) => Promise<Preferences>,
): WindowApi => {
  return {
    dialog: { openFile: vi.fn() },
    file: { save: vi.fn() },
    clipboard: { copy: vi.fn() },
    app: {
      getInfo: vi.fn(),
      openWindow: vi.fn(),
      onResetCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
      initialThemeMode: null,
    },
    logs: { getHistory: vi.fn(), onLine: vi.fn() },
    preferences: {
      getAll,
      update,
      reset: vi.fn(),
    },
    prettifier: { run: vi.fn(), cancel: vi.fn(), onProgress: vi.fn() },
    telemetry: { log: vi.fn() },
  };
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

describe('usePreferencesFlow', () => {
  it('hydrates theme, indent size, fallback id, and fallback options from preferences', async () => {
    const getAll = vi.fn().mockResolvedValue(
      createPreferences({
        themeMode: 'dark',
        indentSize: 4,
        fallbackWarningLineThreshold: 420,
        fallbackAgentId: 'amp',
      }),
    );
    const update = vi.fn().mockResolvedValue(createPreferences());
    const api = createWindowApi(getAll, update);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PreferencesHarness, { api, ref }));

    await waitFor(() => {
      expect(ref.current?.getThemeMode()).toBe('dark');
    });
    expect(ref.current?.getIndentSize()).toBe(4);
    expect(ref.current?.getFallbackWarningLineThreshold()).toBe(420);
    expect(ref.current?.getFallbackAgentId()).toBe('amp');
    expect(ref.current?.getFallbackAgentOptionIds()).toEqual(['amp', 'codex']);
  });

  it('rolls back optimistic theme update when persistence fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const getAll = vi.fn().mockResolvedValue(createPreferences({ themeMode: 'light' }));
    const update = vi.fn().mockRejectedValue(new Error('failed update'));
    const api = createWindowApi(getAll, update);
    const ref = { current: null as HarnessHandle | null };

    try {
      render(createElement(PreferencesHarness, { api, ref }));

      await waitFor(() => {
        expect(ref.current?.getThemeMode()).toBe('light');
      });

      await act(async () => {
        await ref.current?.persistThemeMode('dark');
      });

      expect(update).toHaveBeenCalledWith({ themeMode: 'dark' });
      expect(ref.current?.getThemeMode()).toBe('light');
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('persists fallback agent selection and updates mapped options', async () => {
    const getAll = vi.fn().mockResolvedValue(createPreferences({ fallbackAgentId: 'codex' }));
    const update = vi.fn().mockResolvedValue(
      createPreferences({
        fallbackAgentId: 'amp',
        agents: [
          {
            ...baseAmpAgent,
            id: 'amp',
            name: 'Amp',
            enabled: true,
          },
          {
            ...baseCodexAgent,
            id: 'codex',
            name: 'Codex',
            enabled: false,
          },
        ],
      }),
    );
    const api = createWindowApi(getAll, update);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PreferencesHarness, { api, ref }));

    await waitFor(() => {
      expect(ref.current?.getFallbackAgentId()).toBe('codex');
    });

    await act(async () => {
      await ref.current?.persistFallbackAgentId('amp');
    });

    expect(update).toHaveBeenCalledWith({ fallbackAgentId: 'amp' });
    expect(ref.current?.getFallbackAgentId()).toBe('amp');
    expect(ref.current?.getFallbackAgentOptionIds()).toEqual(['amp', 'codex']);
  });

  it('ignores stale theme persistence responses when overlapping requests resolve out of order', async () => {
    const getAll = vi.fn().mockResolvedValue(createPreferences({ themeMode: 'light' }));
    const firstUpdate = createDeferred<Preferences>();
    const secondUpdate = createDeferred<Preferences>();
    const update = vi
      .fn()
      .mockReturnValueOnce(firstUpdate.promise)
      .mockReturnValueOnce(secondUpdate.promise);
    const api = createWindowApi(getAll, update);
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PreferencesHarness, { api, ref }));

    await waitFor(() => {
      expect(ref.current?.getThemeMode()).toBe('light');
    });

    const firstPersist = ref.current?.persistThemeMode('dark');
    await waitFor(() => {
      expect(ref.current?.getThemeMode()).toBe('dark');
    });

    const secondPersist = ref.current?.persistThemeMode('light');
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondUpdate.resolve(createPreferences({ themeMode: 'light' }));
      firstUpdate.resolve(createPreferences({ themeMode: 'dark' }));
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.all([firstPersist, secondPersist]);
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(ref.current?.getThemeMode()).toBe('light');
  });

  it('keeps optimistic theme update when preload bridge is unavailable', async () => {
    const ref = { current: null as HarnessHandle | null };

    render(createElement(PreferencesHarness, { api: null, ref }));

    await act(async () => {
      await ref.current?.persistThemeMode('dark');
    });

    expect(ref.current?.getThemeMode()).toBe('dark');
  });
});
