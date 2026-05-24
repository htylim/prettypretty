import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useCallback, useImperativeHandle } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  PrettifierProgressEvent,
  PrettifyRunResponse,
} from '../../../../../src/shared/prettifier';
import type { WindowApi } from '../../../../../src/shared/window-api';
import { usePrettifierRuntime } from '../../../../../src/renderer/app/session/usePrettifierRuntime';

type HarnessHandle = {
  runPrettifier: (requestId: number) => Promise<PrettifyRunResponse | null>;
  cancelPrettifierFallback: (requestId: number) => Promise<void>;
};

type HarnessProps = {
  api: WindowApi | null;
  onProgress: (event: PrettifierProgressEvent) => void;
};

const RuntimeHarness = forwardRef<HarnessHandle, HarnessProps>(({ api, onProgress }, ref) => {
  const getWindowApi = useCallback(() => api, [api]);
  const runtime = usePrettifierRuntime({ getWindowApi, onProgress });

  useImperativeHandle(
    ref,
    () => ({
      runPrettifier: (requestId: number) =>
        runtime.runPrettifier({
          requestId,
          inputText: '{"a":1}',
          indentSize: 2,
          trigger: 'switch-output',
        }),
      cancelPrettifierFallback: runtime.cancelPrettifierFallback,
    }),
    [runtime],
  );

  return null;
});

RuntimeHarness.displayName = 'RuntimeHarness';

describe('usePrettifierRuntime', () => {
  it('subscribes to progress events and delegates run/cancel IPC', async () => {
    const onProgressListener = vi.fn();
    let progressListener: ((event: PrettifierProgressEvent) => void) | null = null;
    const run = vi.fn().mockResolvedValue({
      status: 'applied-local',
      outputText: '{\n  "a": 1\n}',
      localResult: {
        kind: 'applied',
        family: 'json-like',
        mode: 'canonical',
        variant: 'json',
      },
      fallbackStatus: 'not-attempted',
      agentId: null,
      durationMs: 1,
    } satisfies PrettifyRunResponse);
    const cancel = vi.fn().mockResolvedValue(true);
    const onProgress = vi
      .fn()
      .mockImplementation((listener: (event: PrettifierProgressEvent) => void) => {
        progressListener = listener;
        return () => {
          progressListener = null;
        };
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
      app: {
        getInfo: vi.fn(),
        openWindow: vi.fn(),
        consumeInitialOpenFile: vi.fn().mockResolvedValue(null),
        onResetCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
        onRefreshCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
        onNavigationCommand: vi.fn().mockImplementation(() => vi.fn()),
        initialThemeMode: null,
      },
      logs: { getHistory: vi.fn(), onLine: vi.fn() },
      preferences: { getAll: vi.fn(), update: vi.fn(), reset: vi.fn() },
      prettifier: { run, cancel, onProgress },
      telemetry: { log: vi.fn() },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(RuntimeHarness, { api, onProgress: onProgressListener, ref }));

    act(() => {
      progressListener?.({ requestId: 7, line: 'line 1' });
    });
    expect(onProgressListener).toHaveBeenCalledWith({ requestId: 7, line: 'line 1' });

    await act(async () => {
      await ref.current?.runPrettifier(9);
      await ref.current?.cancelPrettifierFallback(9);
    });

    expect(run).toHaveBeenCalledWith({
      requestId: 9,
      inputText: '{"a":1}',
      indentSize: 2,
      trigger: 'switch-output',
    });
    expect(cancel).toHaveBeenCalledWith({ requestId: 9 });
  });

  it('returns null when no bridge is available', async () => {
    const ref = { current: null as HarnessHandle | null };

    render(
      createElement(RuntimeHarness, {
        api: null,
        onProgress: vi.fn(),
        ref,
      }),
    );

    await waitFor(async () => {
      expect(await ref.current?.runPrettifier(1)).toBeNull();
    });
  });
});
