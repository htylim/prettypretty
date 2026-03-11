// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserWindowConstructorMock,
  browserWindowGetFocusedWindowMock,
  loadFileMock,
  loadURLMock,
  existsSyncMock,
  screenGetDisplayMatchingMock,
} = vi.hoisted(() => {
  return {
    browserWindowConstructorMock: vi.fn(),
    browserWindowGetFocusedWindowMock: vi.fn(),
    loadFileMock: vi.fn(),
    loadURLMock: vi.fn(),
    existsSyncMock: vi.fn(),
    screenGetDisplayMatchingMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  class BrowserWindowMock {
    constructor(options: unknown) {
      browserWindowConstructorMock(options);
    }

    async loadURL(url: string): Promise<void> {
      await loadURLMock(url);
    }

    async loadFile(path: string): Promise<void> {
      await loadFileMock(path);
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
    loadFileMock.mockReset().mockResolvedValue(undefined);
    loadURLMock.mockReset().mockResolvedValue(undefined);
    existsSyncMock.mockReset().mockReturnValue(false);
    screenGetDisplayMatchingMock.mockReset().mockReturnValue({
      workArea: {
        x: 0,
        y: 0,
        width: 1600,
        height: 1200,
      },
    });
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('creates a secure window and loads file renderer entry by default', async () => {
    const { createMainWindow, isMainWindow } =
      await import('../../../../src/main/windows/mainWindow');
    const mainWindow = await createMainWindow('dark');

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      backgroundColor: string;
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

    expect(windowOptions.backgroundColor).toBe('#121316');
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
    expect(loadFileMock).toHaveBeenCalledTimes(1);
    expect(loadURLMock).not.toHaveBeenCalled();
    expect(isMainWindow(mainWindow)).toBe(true);
  });

  it('loads ELECTRON_RENDERER_URL when provided', async () => {
    process.env.ELECTRON_RENDERER_URL = 'http://127.0.0.1:5173';
    browserWindowGetFocusedWindowMock.mockReturnValue({
      isDestroyed: () => false,
      getNormalBounds: () => ({
        x: 100,
        y: 80,
        width: 1280,
        height: 840,
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
        width: 1280,
        height: 840,
      }),
    });
    screenGetDisplayMatchingMock.mockReturnValue({
      workArea: {
        x: 100,
        y: 40,
        width: 1600,
        height: 1200,
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
        width: 1280,
        height: 840,
      },
    });

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      x: number;
      y: number;
    };

    expect(windowOptions.x).toBe(32);
    expect(windowOptions.y).toBe(32);
  });
});
