// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserWindowConstructorMock,
  browserWindowGetFocusedWindowMock,
  browserWindowOnMock,
  loadFileMock,
  loadURLMock,
  existsSyncMock,
  screenGetDisplayMatchingMock,
  webContentsSendMock,
  webContentsFocusMock,
  browserWindowFocusMock,
} = vi.hoisted(() => {
  return {
    browserWindowConstructorMock: vi.fn(),
    browserWindowGetFocusedWindowMock: vi.fn(),
    browserWindowOnMock: vi.fn(),
    loadFileMock: vi.fn(),
    loadURLMock: vi.fn(),
    existsSyncMock: vi.fn(),
    screenGetDisplayMatchingMock: vi.fn(),
    webContentsSendMock: vi.fn(),
    webContentsFocusMock: vi.fn(),
    browserWindowFocusMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  class BrowserWindowMock {
    webContents = {
      send: webContentsSendMock,
      focus: webContentsFocusMock,
    };

    constructor(options: unknown) {
      browserWindowConstructorMock(options);
    }

    async loadURL(url: string): Promise<void> {
      await loadURLMock(url);
    }

    async loadFile(path: string): Promise<void> {
      await loadFileMock(path);
    }

    on(eventName: string, listener: (...args: unknown[]) => void): this {
      browserWindowOnMock(eventName, listener);
      return this;
    }

    focus(): void {
      browserWindowFocusMock();
    }
  }

  return {
    BrowserWindow: Object.assign(BrowserWindowMock, {
      getFocusedWindow: browserWindowGetFocusedWindowMock,
    }),
    screen: {
      getDisplayMatching: screenGetDisplayMatchingMock,
    },
  };
});

vi.mock('node:fs', () => {
  return {
    existsSync: existsSyncMock,
  };
});

describe('createMainWindow', () => {
  beforeEach(() => {
    vi.resetModules();
    browserWindowConstructorMock.mockReset();
    browserWindowGetFocusedWindowMock.mockReset().mockReturnValue(null);
    browserWindowOnMock.mockReset();
    webContentsSendMock.mockReset();
    loadFileMock.mockReset().mockResolvedValue(undefined);
    loadURLMock.mockReset().mockResolvedValue(undefined);
    existsSyncMock.mockReset().mockReturnValue(false);
    screenGetDisplayMatchingMock.mockReset().mockReturnValue({
      workArea: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1440,
      },
    });
    webContentsFocusMock.mockReset();
    browserWindowFocusMock.mockReset();
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('creates a secure window and loads file renderer entry by default', async () => {
    const { createMainWindow, isMainWindow } =
      await import('../../../../src/main/windows/mainWindow');
    const mainWindow = await createMainWindow('dark');

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      backgroundColor: string;
      show: boolean;
      paintWhenInitiallyHidden: boolean;
      x?: number;
      y?: number;
      webPreferences: {
        contextIsolation: boolean;
        nodeIntegration: boolean;
        sandbox: boolean;
        additionalArguments: string[];
      };
      icon?: string;
    };

    expect(browserWindowOnMock).toHaveBeenCalledWith('app-command', expect.any(Function));
    expect(browserWindowOnMock).toHaveBeenCalledWith('swipe', expect.any(Function));
    expect(windowOptions.backgroundColor).toBe('#121316');
    expect(windowOptions.show).toBe(true);
    expect(windowOptions.paintWhenInitiallyHidden).toBe(true);
    expect(windowOptions.x).toBeUndefined();
    expect(windowOptions.y).toBeUndefined();
    expect(windowOptions.webPreferences.contextIsolation).toBe(true);
    expect(windowOptions.webPreferences.nodeIntegration).toBe(false);
    expect(windowOptions.webPreferences.sandbox).toBe(true);
    expect(windowOptions.webPreferences.additionalArguments).toContain(
      '--prettypretty-theme-mode=dark',
    );
    if (process.platform === 'darwin') {
      expect(windowOptions.icon).toBeUndefined();
    }
    expect(browserWindowFocusMock).toHaveBeenCalledTimes(1);
    expect(webContentsFocusMock).toHaveBeenCalledTimes(1);
    expect(loadFileMock).toHaveBeenCalledTimes(1);
    expect(loadURLMock).not.toHaveBeenCalled();
    expect(isMainWindow(mainWindow)).toBe(true);
  });

  it('creates hidden E2E windows without focusing them', async () => {
    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light', {
      windowMode: 'hidden',
    });

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      show: boolean;
      paintWhenInitiallyHidden: boolean;
    };

    expect(windowOptions.show).toBe(false);
    expect(windowOptions.paintWhenInitiallyHidden).toBe(true);
    expect(browserWindowFocusMock).not.toHaveBeenCalled();
    expect(webContentsFocusMock).not.toHaveBeenCalled();
  });

  it('loads ELECTRON_RENDERER_URL when provided', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';
    browserWindowGetFocusedWindowMock.mockReturnValue({
      isDestroyed: () => false,
      getNormalBounds: () => ({
        x: 100,
        y: 80,
        width: 1600,
        height: 1050,
      }),
    });
    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light');

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      backgroundColor: string;
      x: number;
      y: number;
    };
    expect(windowOptions.backgroundColor).toBe('#f5f1eb');
    expect(windowOptions.x).toBe(132);
    expect(windowOptions.y).toBe(112);
    expect(loadURLMock).toHaveBeenCalledWith('http://127.0.0.1:5173');
    expect(loadFileMock).not.toHaveBeenCalled();
  });

  it('wraps staggered windows back into the display work area when near the edge', async () => {
    browserWindowGetFocusedWindowMock.mockReturnValue({
      isDestroyed: () => false,
      getNormalBounds: () => ({
        x: 420,
        y: 300,
        width: 1600,
        height: 1050,
      }),
    });
    screenGetDisplayMatchingMock.mockReturnValue({
      workArea: {
        x: 100,
        y: 40,
        width: 1920,
        height: 1440,
      },
    });

    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light');

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      x: number;
      y: number;
    };

    expect(windowOptions.x).toBe(132);
    expect(windowOptions.y).toBe(332);
  });

  it('clamps off-screen reference bounds back into the display before staggering', async () => {
    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light', {
      referenceBounds: {
        x: -240,
        y: -120,
        width: 1600,
        height: 1050,
      },
    });

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      x: number;
      y: number;
    };

    expect(windowOptions.x).toBe(32);
    expect(windowOptions.y).toBe(32);
  });

  it('forwards browser back and forward app commands to the renderer bridge', async () => {
    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light');

    const appCommandListener = browserWindowOnMock.mock.calls.find(
      ([eventName]) => eventName === 'app-command',
    )?.[1] as ((event: { preventDefault: () => void }, command: string) => void) | undefined;

    const preventDefaultMock = vi.fn();
    appCommandListener?.({ preventDefault: preventDefaultMock }, 'browser-backward');
    appCommandListener?.({ preventDefault: preventDefaultMock }, 'browser-forward');
    appCommandListener?.({ preventDefault: preventDefaultMock }, 'media-play-pause');

    expect(preventDefaultMock).toHaveBeenCalledTimes(2);
    expect(webContentsSendMock).toHaveBeenNthCalledWith(
      1,
      'app:navigation-command',
      'browser-backward',
    );
    expect(webContentsSendMock).toHaveBeenNthCalledWith(
      2,
      'app:navigation-command',
      'browser-forward',
    );
  });

  it('maps macOS swipe directions to browser navigation commands', async () => {
    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light');

    const swipeListener = browserWindowOnMock.mock.calls.find(
      ([eventName]) => eventName === 'swipe',
    )?.[1] as
      | ((event: { preventDefault: () => void }, direction: 'left' | 'right') => void)
      | undefined;

    const preventDefaultMock = vi.fn();
    swipeListener?.({ preventDefault: preventDefaultMock }, 'left');
    swipeListener?.({ preventDefault: preventDefaultMock }, 'right');

    expect(preventDefaultMock).toHaveBeenCalledTimes(2);
    expect(webContentsSendMock).toHaveBeenNthCalledWith(
      1,
      'app:navigation-command',
      'browser-backward',
    );
    expect(webContentsSendMock).toHaveBeenNthCalledWith(
      2,
      'app:navigation-command',
      'browser-forward',
    );
  });
});
