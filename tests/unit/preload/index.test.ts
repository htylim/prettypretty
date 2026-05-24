// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { exposeInMainWorldMock, invokeMock, onMock, removeListenerMock } = vi.hoisted(() => {
  return {
    exposeInMainWorldMock: vi.fn(),
    invokeMock: vi.fn(),
    onMock: vi.fn(),
    removeListenerMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
    contextBridge: {
      exposeInMainWorld: exposeInMainWorldMock,
    },
    ipcRenderer: {
      invoke: invokeMock,
      on: onMock,
      removeListener: removeListenerMock,
    },
  };
});

const originalArgv = [...process.argv];

const loadPreloadApi = async () => {
  vi.resetModules();
  await import('../../../src/preload/index');
  const exposedApi = exposeInMainWorldMock.mock.calls[0]?.[1] as {
    app: {
      initialThemeMode: string | null;
      openWindow: () => Promise<void>;
      consumeInitialOpenFile: () => Promise<{ path: string; content: string } | null>;
      onResetCurrentWindow: (listener: () => void) => () => void;
      onRefreshCurrentWindow: (listener: () => void) => () => void;
      onNavigationCommand: (
        listener: (command: 'browser-backward' | 'browser-forward') => void,
      ) => () => void;
    };
    logs: { onLine: (listener: (line: string) => void) => () => void };
    file: {
      refreshOpenFile: (request: { path: string; sourceToken: string }) => Promise<unknown>;
      commitOpenFileSource: (request: { path: string; sourceToken: string }) => Promise<boolean>;
      clearOpenFileSource: (request: {
        path: string;
        sourceToken: string;
        scope: 'pending' | 'committed';
      }) => Promise<boolean>;
    };
    prettifier: {
      cancel: (request: { requestId: number }) => Promise<boolean>;
      onProgress: (listener: (event: { requestId: number; line: string }) => void) => () => void;
    };
  };
  return exposedApi;
};

describe('preload bridge', () => {
  beforeEach(() => {
    exposeInMainWorldMock.mockReset();
    invokeMock.mockReset();
    onMock.mockReset();
    removeListenerMock.mockReset();
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.argv = [...originalArgv];
  });

  it('exposes the bridge with valid initial theme parsed from argv', async () => {
    process.argv = [...originalArgv, '--prettypretty-theme-mode=dark'];

    const api = await loadPreloadApi();

    expect(exposeInMainWorldMock).toHaveBeenCalledWith('prettypretty', expect.any(Object));
    expect(api.app.initialThemeMode).toBe('dark');
  });

  it('uses null initial theme when argv value is invalid', async () => {
    process.argv = [...originalArgv, '--prettypretty-theme-mode=sepia'];

    const api = await loadPreloadApi();

    expect(api.app.initialThemeMode).toBeNull();
  });

  it('invokes app.openWindow through ipcRenderer', async () => {
    const api = await loadPreloadApi();

    await api.app.openWindow();

    expect(invokeMock).toHaveBeenCalledWith('app:open-window');
  });

  it('invokes app.consumeInitialOpenFile through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    invokeMock.mockResolvedValueOnce({ path: '/tmp/sample.json', content: '{"a":1}' });

    const result = await api.app.consumeInitialOpenFile();

    expect(invokeMock).toHaveBeenCalledWith('app:consume-initial-open-file');
    expect(result).toEqual({ path: '/tmp/sample.json', content: '{"a":1}' });
  });

  it('wires app.onResetCurrentWindow subscription and cleanup through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    const resetListener = vi.fn();

    const unsubscribe = api.app.onResetCurrentWindow(resetListener);
    const wrappedListener = onMock.mock.calls[0]?.[1] as (() => void) | undefined;
    wrappedListener?.();

    expect(onMock).toHaveBeenCalledWith('app:reset-current-window', expect.any(Function));
    expect(resetListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith('app:reset-current-window', wrappedListener);
  });

  it('wires app.onRefreshCurrentWindow subscription and cleanup through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    const refreshListener = vi.fn();

    const unsubscribe = api.app.onRefreshCurrentWindow(refreshListener);
    const wrappedListener = onMock.mock.calls[0]?.[1] as (() => void) | undefined;
    wrappedListener?.();

    expect(onMock).toHaveBeenCalledWith('app:refresh-current-window', expect.any(Function));
    expect(refreshListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith('app:refresh-current-window', wrappedListener);
  });

  it('wires app.onNavigationCommand subscription and cleanup through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    const navigationListener = vi.fn();

    const unsubscribe = api.app.onNavigationCommand(navigationListener);
    const wrappedListener = onMock.mock.calls[0]?.[1] as
      | ((event: unknown, command: 'browser-backward' | 'browser-forward') => void)
      | undefined;
    wrappedListener?.({}, 'browser-forward');

    expect(onMock).toHaveBeenCalledWith('app:navigation-command', expect.any(Function));
    expect(navigationListener).toHaveBeenCalledWith('browser-forward');

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith('app:navigation-command', wrappedListener);
  });

  it('wires logs.onLine subscription and cleanup through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    const lineListener = vi.fn();

    const unsubscribe = api.logs.onLine(lineListener);
    const wrappedListener = onMock.mock.calls[0]?.[1] as
      | ((event: unknown, line: string) => void)
      | undefined;
    wrappedListener?.({}, '{"event":"runtime"}');

    expect(onMock).toHaveBeenCalledTimes(1);
    expect(lineListener).toHaveBeenCalledWith('{"event":"runtime"}');

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
    expect(removeListenerMock).toHaveBeenCalledWith(onMock.mock.calls[0]?.[0], wrappedListener);
  });

  it('wires prettifier.onProgress subscription and cleanup through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    const progressListener = vi.fn();

    const unsubscribe = api.prettifier.onProgress(progressListener);
    const wrappedListener = onMock.mock.calls[0]?.[1] as
      | ((event: unknown, payload: { requestId: number; line: string }) => void)
      | undefined;
    wrappedListener?.({}, { requestId: 9, line: 'progress...' });

    expect(onMock).toHaveBeenCalledTimes(1);
    expect(progressListener).toHaveBeenCalledWith({ requestId: 9, line: 'progress...' });

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledTimes(1);
    expect(removeListenerMock).toHaveBeenCalledWith(onMock.mock.calls[0]?.[0], wrappedListener);
  });

  it('invokes prettifier.cancel through ipcRenderer', async () => {
    const api = await loadPreloadApi();
    invokeMock.mockResolvedValueOnce(true);

    const result = await api.prettifier.cancel({ requestId: 12 });

    expect(invokeMock).toHaveBeenCalledWith('prettifier:cancel', { requestId: 12 });
    expect(result).toBe(true);
  });

  it('exposes refresh-open-file IPC through the file bridge', async () => {
    const api = await loadPreloadApi();
    const request = { path: '/tmp/source.json', sourceToken: 'token-1' };

    await api.file.refreshOpenFile(request);

    expect(invokeMock).toHaveBeenCalledWith('file:refresh-open-file', request);
  });

  it('exposes commit and clear file-source IPC through the file bridge', async () => {
    const api = await loadPreloadApi();
    const commitRequest = { path: '/tmp/source.json', sourceToken: 'token-1' };
    const clearRequest = {
      path: '/tmp/source.json',
      sourceToken: 'token-1',
      scope: 'pending' as const,
    };

    await api.file.commitOpenFileSource(commitRequest);
    await api.file.clearOpenFileSource(clearRequest);

    expect(invokeMock).toHaveBeenCalledWith('file:commit-open-file-source', commitRequest);
    expect(invokeMock).toHaveBeenCalledWith('file:clear-open-file-source', clearRequest);
  });
});
