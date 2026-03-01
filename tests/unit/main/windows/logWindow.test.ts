// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

type BrowserWindowListenerMap = Map<string, () => void>;

const {
  browserWindowConstructorMock,
  focusMock,
  isDestroyedMock,
  loadFileMock,
  loadURLMock,
  onMock,
  closeMock,
  webContentsSendMock,
} = vi.hoisted(() => {
  return {
    browserWindowConstructorMock: vi.fn(),
    focusMock: vi.fn(),
    isDestroyedMock: vi.fn(),
    loadFileMock: vi.fn(),
    loadURLMock: vi.fn(),
    onMock: vi.fn(),
    closeMock: vi.fn(),
    webContentsSendMock: vi.fn(),
  };
});

const windowListeners: BrowserWindowListenerMap = new Map();

vi.mock('electron', () => {
  class BrowserWindowMock {
    webContents = {
      send: webContentsSendMock,
    };

    constructor(options: unknown) {
      browserWindowConstructorMock(options);
    }

    on(event: string, listener: () => void): this {
      windowListeners.set(event, listener);
      onMock(event, listener);
      return this;
    }

    focus(): void {
      focusMock();
    }

    isDestroyed(): boolean {
      return isDestroyedMock();
    }

    close(): void {
      closeMock();
    }

    async loadFile(path: string, options?: unknown): Promise<void> {
      await loadFileMock(path, options);
    }

    async loadURL(url: string): Promise<void> {
      await loadURLMock(url);
    }
  }

  return {
    BrowserWindow: BrowserWindowMock,
  };
});

type SessionLogStoreLike = {
  subscribe: (listener: (line: string) => void) => () => void;
};

const getSubscribedListener = (
  subscribeMock: ReturnType<typeof vi.fn>,
): ((line: string) => void) | undefined => {
  return subscribeMock.mock.calls[0]?.[0] as ((line: string) => void) | undefined;
};

describe('openOrFocusLogWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    windowListeners.clear();
    browserWindowConstructorMock.mockReset();
    focusMock.mockReset();
    isDestroyedMock.mockReset().mockReturnValue(false);
    loadFileMock.mockReset().mockResolvedValue(undefined);
    loadURLMock.mockReset().mockResolvedValue(undefined);
    onMock.mockReset();
    closeMock.mockReset();
    webContentsSendMock.mockReset();
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('creates log window once, forwards appended lines, and focuses existing window', async () => {
    const subscribeUnsubscribeMock = vi.fn();
    const subscribeMock = vi.fn().mockImplementation(() => subscribeUnsubscribeMock);
    const logStore: SessionLogStoreLike = {
      subscribe: subscribeMock,
    };
    const { openOrFocusLogWindow } = await import('../../../../src/main/windows/logWindow');

    await openOrFocusLogWindow(logStore as never);
    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(1);
    expect(loadFileMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    const subscribedListener = getSubscribedListener(subscribeMock);
    subscribedListener?.('{"event":"runtime"}');
    expect(webContentsSendMock).toHaveBeenCalledWith('logs:line-appended', '{"event":"runtime"}');

    await openOrFocusLogWindow(logStore as never);
    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(1);
    expect(focusMock).toHaveBeenCalledTimes(1);

    windowListeners.get('closed')?.();
    expect(subscribeUnsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('loads log window via ELECTRON_RENDERER_URL when set', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';
    const subscribeMock = vi.fn().mockImplementation(() => vi.fn());
    const logStore: SessionLogStoreLike = {
      subscribe: subscribeMock,
    };
    const { openOrFocusLogWindow } = await import('../../../../src/main/windows/logWindow');

    await openOrFocusLogWindow(logStore as never);

    expect(loadURLMock).toHaveBeenCalledTimes(1);
    expect(loadFileMock).not.toHaveBeenCalled();
    const loadedUrl = loadURLMock.mock.calls[0]?.[0] as string;
    expect(loadedUrl).toContain('window=log');
  });
});
