// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserWindowConstructorMock, loadFileMock, loadURLMock, existsSyncMock } = vi.hoisted(
  () => {
    return {
      browserWindowConstructorMock: vi.fn(),
      loadFileMock: vi.fn(),
      loadURLMock: vi.fn(),
      existsSyncMock: vi.fn(),
    };
  },
);

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
    BrowserWindow: BrowserWindowMock,
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
    loadFileMock.mockReset().mockResolvedValue(undefined);
    loadURLMock.mockReset().mockResolvedValue(undefined);
    existsSyncMock.mockReset().mockReturnValue(false);
    delete process.env.ELECTRON_RENDERER_URL;
  });

  it('creates a secure window and loads file renderer entry by default', async () => {
    const { createMainWindow, isMainWindow } =
      await import('../../../../src/main/windows/mainWindow');
    const mainWindow = await createMainWindow('dark');

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      backgroundColor: string;
      webPreferences: {
        contextIsolation: boolean;
        nodeIntegration: boolean;
        sandbox: boolean;
        additionalArguments: string[];
      };
      icon?: string;
    };

    expect(windowOptions.backgroundColor).toBe('#121316');
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
    const { createMainWindow } = await import('../../../../src/main/windows/mainWindow');
    await createMainWindow('light');

    const windowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      backgroundColor: string;
    };
    expect(windowOptions.backgroundColor).toBe('#f5f1eb');
    expect(loadURLMock).toHaveBeenCalledWith('http://127.0.0.1:5173');
    expect(loadFileMock).not.toHaveBeenCalled();
  });
});
