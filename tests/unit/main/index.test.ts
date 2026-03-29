// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { IPCChannels } from '../../../src/shared/ipc-contracts';

const {
  appEventHandlers,
  appExitMock,
  appGetPathMock,
  appOnMock,
  appSetNameMock,
  appWhenReadyMock,
  browserWindowConstructorMock,
  browserWindowGetFocusedWindowMock,
  browserWindowLoadFileMock,
  browserWindowLoadURLMock,
  buildFromTemplateMock,
  focusedWindowSendMock,
  dialogShowOpenDialogMock,
  dialogShowSaveDialogMock,
  existsSyncMock,
  ipcHandleMock,
  setApplicationMenuMock,
  shellOpenPathMock,
  showErrorBoxMock,
  screenGetDisplayMatchingMock,
  terminateAllFallbackProcessesMock,
  writeTextMock,
} = vi.hoisted(() => {
  return {
    appEventHandlers: new Map<string, (...args: unknown[]) => void>(),
    appExitMock: vi.fn(),
    appGetPathMock: vi.fn(),
    appOnMock: vi.fn(),
    appSetNameMock: vi.fn(),
    appWhenReadyMock: vi.fn(),
    browserWindowConstructorMock: vi.fn(),
    browserWindowGetFocusedWindowMock: vi.fn(),
    browserWindowLoadFileMock: vi.fn(),
    browserWindowLoadURLMock: vi.fn(),
    buildFromTemplateMock: vi.fn(),
    focusedWindowSendMock: vi.fn(),
    dialogShowOpenDialogMock: vi.fn(),
    dialogShowSaveDialogMock: vi.fn(),
    existsSyncMock: vi.fn(),
    ipcHandleMock: vi.fn(),
    setApplicationMenuMock: vi.fn(),
    shellOpenPathMock: vi.fn(),
    showErrorBoxMock: vi.fn(),
    screenGetDisplayMatchingMock: vi.fn(),
    terminateAllFallbackProcessesMock: vi.fn().mockReturnValue(0),
    writeTextMock: vi.fn(),
  };
});

const browserWindows: BrowserWindowMock[] = [];
let focusedWindow: BrowserWindowMock | null = null;

class BrowserWindowMock {
  id: number;
  bounds = {
    x: 100,
    y: 100,
    width: 1600,
    height: 1050,
  };
  webContents = {
    send: focusedWindowSendMock,
    focus: vi.fn(),
  };

  constructor(options: unknown) {
    this.id = browserWindows.length + 1;
    browserWindows.push(this);
    focusedWindow = browserWindows.at(-1) ?? null;
    browserWindowConstructorMock(options);
  }

  async loadFile(...args: unknown[]): Promise<void> {
    await browserWindowLoadFileMock(...args);
  }

  async loadURL(...args: unknown[]): Promise<void> {
    await browserWindowLoadURLMock(...args);
  }

  focus(): void {}

  isDestroyed(): boolean {
    return false;
  }

  getNormalBounds(): typeof this.bounds {
    return this.bounds;
  }
}

vi.mock('electron', () => {
  return {
    BrowserWindow: Object.assign(BrowserWindowMock, {
      getFocusedWindow: browserWindowGetFocusedWindowMock,
      fromWebContents: vi.fn(),
    }),
    Menu: {
      buildFromTemplate: buildFromTemplateMock,
      setApplicationMenu: setApplicationMenuMock,
    },
    app: {
      dock: {
        setIcon: vi.fn(),
      },
      getName: vi.fn().mockReturnValue('prettypretty'),
      getPath: appGetPathMock,
      getVersion: vi.fn().mockReturnValue('0.1.0'),
      on: appOnMock,
      exit: appExitMock,
      setName: appSetNameMock,
      whenReady: appWhenReadyMock,
    },
    clipboard: {
      writeText: writeTextMock,
    },
    dialog: {
      showErrorBox: showErrorBoxMock,
      showOpenDialog: dialogShowOpenDialogMock,
      showSaveDialog: dialogShowSaveDialogMock,
    },
    ipcMain: {
      handle: ipcHandleMock,
    },
    shell: {
      openPath: shellOpenPathMock,
    },
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

vi.mock('../../../src/main/prettifier/fallbackProcessRegistry', () => {
  return {
    createFallbackProcessRegistry: vi.fn(() => {
      return {
        track: vi.fn(),
        terminate: vi.fn(),
        terminateAll: terminateAllFallbackProcessesMock,
      };
    }),
  };
});

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const waitForWindowCreation = async (): Promise<void> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (browserWindowConstructorMock.mock.calls.length > 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error('Timed out waiting for main window creation');
};

const getAppEventHandler = (event: string): ((...args: unknown[]) => void) => {
  const handler = appEventHandlers.get(event);
  if (!handler) {
    throw new Error(`Expected app.on handler for ${event}`);
  }

  return handler;
};

const getRegisteredHandler = (channel: string): ((...args: unknown[]) => unknown) => {
  const call = ipcHandleMock.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel,
  );
  if (!call || typeof call[1] !== 'function') {
    throw new Error(`Expected handler for ${channel}`);
  }

  return call[1] as (...args: unknown[]) => unknown;
};

const getMenuItem = (label: string): MenuItemConstructorOptions => {
  const [template] = buildFromTemplateMock.mock.calls.at(-1) as [MenuItemConstructorOptions[]];
  const fileMenu = template.find((item) => item.label === 'File');
  const submenu = (fileMenu?.submenu ?? []) as MenuItemConstructorOptions[];
  const item = submenu.find((entry) => entry.label === label);
  if (!item) {
    throw new Error(`Missing menu item ${label}`);
  }

  return item;
};

const loadMainEntry = async (): Promise<void> => {
  await import('../../../src/main/index');
  await flushMicrotasks();
  await waitForWindowCreation();
};

describe('main process window lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    appEventHandlers.clear();
    browserWindows.length = 0;
    focusedWindow = null;

    appGetPathMock.mockReset().mockReturnValue('/tmp/prettypretty-user-data');
    appOnMock
      .mockReset()
      .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        appEventHandlers.set(event, handler);
      });
    appExitMock.mockReset();
    appSetNameMock.mockReset();
    appWhenReadyMock.mockReset().mockResolvedValue(undefined);
    browserWindowConstructorMock.mockReset();
    browserWindowGetFocusedWindowMock.mockReset().mockImplementation(() => focusedWindow);
    browserWindowLoadFileMock.mockReset().mockResolvedValue(undefined);
    browserWindowLoadURLMock.mockReset().mockResolvedValue(undefined);
    buildFromTemplateMock.mockReset().mockReturnValue({});
    focusedWindowSendMock.mockReset();
    dialogShowOpenDialogMock.mockReset().mockResolvedValue({ canceled: true, filePaths: [] });
    dialogShowSaveDialogMock.mockReset().mockResolvedValue({ canceled: true, filePath: null });
    existsSyncMock.mockReset().mockReturnValue(false);
    ipcHandleMock.mockReset();
    setApplicationMenuMock.mockReset();
    shellOpenPathMock.mockReset().mockResolvedValue('');
    showErrorBoxMock.mockReset();
    screenGetDisplayMatchingMock.mockReset().mockReturnValue({
      workArea: {
        x: 0,
        y: 0,
        width: 1920,
        height: 1440,
      },
    });
    terminateAllFallbackProcessesMock.mockReset().mockReturnValue(0);
    writeTextMock.mockReset();
  });

  it('creates one document window on startup and can open more via IPC and menu callbacks', async () => {
    await loadMainEntry();

    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(1);
    const firstWindowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      webPreferences?: { additionalArguments?: string[] };
    };
    expect(firstWindowOptions.webPreferences?.additionalArguments).toContain(
      '--prettypretty-theme-mode=light',
    );
    expect(appEventHandlers.has('activate')).toBe(false);
    const openWindowHandler = getRegisteredHandler(IPCChannels.appOpenWindow);

    await openWindowHandler({});
    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(2);

    getMenuItem('New Window').click?.(undefined as never, undefined, {} as never);
    await flushMicrotasks();
    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(3);
  });

  it('captures menu window bounds before async creation yields control', async () => {
    await loadMainEntry();

    const firstWindow = browserWindows[0];
    if (!firstWindow) {
      throw new Error('Expected startup window');
    }

    firstWindow.bounds = {
      x: 140,
      y: 180,
      width: 1600,
      height: 1050,
    };

    getMenuItem('New Window').click?.(undefined as never, undefined, {} as never);
    focusedWindow = {
      isDestroyed: () => false,
      getNormalBounds: () => ({
        x: 520,
        y: 560,
        width: 1600,
        height: 1050,
      }),
    } as unknown as BrowserWindowMock;

    await flushMicrotasks();

    const secondWindowOptions = browserWindowConstructorMock.mock.calls[1]?.[0] as {
      x: number;
      y: number;
    };
    expect(secondWindowOptions.x).toBe(172);
    expect(secondWindowOptions.y).toBe(212);
  });

  it('resets only the focused document window through the File menu callback', async () => {
    await loadMainEntry();

    getMenuItem('Reset Window').click?.(undefined as never, undefined, {} as never);

    expect(focusedWindowSendMock).toHaveBeenCalledWith(IPCChannels.appResetCurrentWindow);
  });

  it('quits on window-all-closed without platform exceptions', async () => {
    await loadMainEntry();

    const windowAllClosed = getAppEventHandler('window-all-closed');
    windowAllClosed();

    expect(terminateAllFallbackProcessesMock).toHaveBeenCalledTimes(1);
    expect(terminateAllFallbackProcessesMock).toHaveBeenCalledWith();
    expect(appExitMock).toHaveBeenCalledTimes(1);
    expect(appExitMock).toHaveBeenCalledWith(0);
  });

  it('terminates fallback children on before-quit and will-quit', async () => {
    await loadMainEntry();

    getAppEventHandler('before-quit')();
    getAppEventHandler('will-quit')();

    expect(terminateAllFallbackProcessesMock).toHaveBeenCalledTimes(2);
  });
});
