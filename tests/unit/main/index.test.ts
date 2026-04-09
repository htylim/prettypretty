// @vitest-environment node

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { IPCChannels } from '../../../src/shared/ipc-contracts';

const {
  appEventHandlers,
  appExitMock,
  appGetPathMock,
  appOnMock,
  appQuitMock,
  appRequestSingleInstanceLockMock,
  appSetNameMock,
  appWhenReadyMock,
  browserWindowConstructorMock,
  browserWindowFromWebContentsMock,
  browserWindowGetFocusedWindowMock,
  browserWindowLoadFileMock,
  browserWindowLoadURLMock,
  buildFromTemplateMock,
  focusedWindowSendMock,
  dialogShowOpenDialogMock,
  dialogShowSaveDialogMock,
  existsSyncMock,
  ipcHandleMock,
  readFileMock,
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
    appQuitMock: vi.fn(),
    appRequestSingleInstanceLockMock: vi.fn(),
    appSetNameMock: vi.fn(),
    appWhenReadyMock: vi.fn(),
    browserWindowConstructorMock: vi.fn(),
    browserWindowFromWebContentsMock: vi.fn(),
    browserWindowGetFocusedWindowMock: vi.fn(),
    browserWindowLoadFileMock: vi.fn(),
    browserWindowLoadURLMock: vi.fn(),
    buildFromTemplateMock: vi.fn(),
    focusedWindowSendMock: vi.fn(),
    dialogShowOpenDialogMock: vi.fn(),
    dialogShowSaveDialogMock: vi.fn(),
    existsSyncMock: vi.fn(),
    ipcHandleMock: vi.fn(),
    readFileMock: vi.fn(),
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
const originalDefaultAppDescriptor = Object.getOwnPropertyDescriptor(process, 'defaultApp');

const setDefaultApp = (value: boolean): void => {
  Object.defineProperty(process, 'defaultApp', {
    configurable: true,
    value,
    writable: true,
  });
};

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
      fromWebContents: browserWindowFromWebContentsMock,
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
      getVersion: vi.fn().mockReturnValue('0.3.0'),
      on: appOnMock,
      exit: appExitMock,
      quit: appQuitMock,
      requestSingleInstanceLock: appRequestSingleInstanceLockMock,
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

vi.mock('node:fs/promises', () => {
  return {
    readFile: readFileMock,
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

const waitForWindowCount = async (expectedCount: number): Promise<void> => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (browserWindowConstructorMock.mock.calls.length >= expectedCount) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  throw new Error(`Timed out waiting for ${expectedCount} windows`);
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

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};

describe('main process window lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    appEventHandlers.clear();
    browserWindows.length = 0;
    focusedWindow = null;
    setDefaultApp(true);

    appGetPathMock.mockReset().mockReturnValue('/tmp/prettypretty-user-data');
    appOnMock
      .mockReset()
      .mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        appEventHandlers.set(event, handler);
      });
    appExitMock.mockReset();
    appQuitMock.mockReset();
    appRequestSingleInstanceLockMock.mockReset().mockReturnValue(true);
    appSetNameMock.mockReset();
    appWhenReadyMock.mockReset().mockResolvedValue(undefined);
    browserWindowConstructorMock.mockReset();
    browserWindowFromWebContentsMock.mockReset().mockImplementation(() => focusedWindow);
    browserWindowGetFocusedWindowMock.mockReset().mockImplementation(() => focusedWindow);
    browserWindowLoadFileMock.mockReset().mockResolvedValue(undefined);
    browserWindowLoadURLMock.mockReset().mockResolvedValue(undefined);
    buildFromTemplateMock.mockReset().mockReturnValue({});
    focusedWindowSendMock.mockReset();
    dialogShowOpenDialogMock.mockReset().mockResolvedValue({ canceled: true, filePaths: [] });
    dialogShowSaveDialogMock.mockReset().mockResolvedValue({ canceled: true, filePath: null });
    existsSyncMock.mockReset().mockReturnValue(false);
    ipcHandleMock.mockReset();
    readFileMock.mockReset();
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
    process.argv = ['electron', 'app'];
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
    await waitForWindowCount(3);
    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(3);
  });

  it('opens a startup launch file from packaged app argv and exposes it once to the window', async () => {
    const launchPath = '/tmp/launch.json';
    setDefaultApp(false);
    process.argv = ['/Applications/prettypretty.app/Contents/MacOS/prettypretty', launchPath];
    readFileMock.mockResolvedValue('{"launch":true}');

    await loadMainEntry();

    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(1);
    const consumeInitialOpenFileHandler = getRegisteredHandler(
      IPCChannels.appConsumeInitialOpenFile,
    );
    browserWindowFromWebContentsMock.mockReturnValue(browserWindows[0]);

    const firstResult = await consumeInitialOpenFileHandler({ sender: {} });
    const secondResult = await consumeInitialOpenFileHandler({ sender: {} });

    expect(readFileMock).toHaveBeenCalledWith('/tmp/launch.json', 'utf8');
    expect(firstResult).toEqual({
      path: '/tmp/launch.json',
      content: '{"launch":true}',
    });
    expect(secondResult).toBeNull();
  });

  it('passes hidden E2E window mode through bootstrap window creation when requested', async () => {
    process.argv = ['electron', 'app', '--prettypretty-e2e-window-mode=hidden'];

    await loadMainEntry();

    const firstWindowOptions = browserWindowConstructorMock.mock.calls[0]?.[0] as {
      show?: boolean;
      paintWhenInitiallyHidden?: boolean;
    };

    expect(firstWindowOptions.show).toBe(false);
    expect(firstWindowOptions.paintWhenInitiallyHidden).toBe(true);
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

    await waitForWindowCount(2);

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

  it('opens a new empty window when a second terminal invocation has no file path', async () => {
    await loadMainEntry();

    getAppEventHandler('second-instance')(
      {},
      ['/Applications/prettypretty.app/Contents/MacOS/prettypretty'],
      '/tmp',
    );
    await waitForWindowCount(2);

    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(2);
  });

  it('queues empty second-instance launches that arrive before bootstrap is ready', async () => {
    const whenReady = createDeferred<void>();
    appWhenReadyMock.mockReset().mockReturnValue(whenReady.promise);

    await import('../../../src/main/index');
    await flushMicrotasks();

    getAppEventHandler('second-instance')(
      {},
      ['/Applications/prettypretty.app/Contents/MacOS/prettypretty'],
      '/tmp',
    );

    whenReady.resolve(undefined);
    await flushMicrotasks();
    await waitForWindowCount(2);

    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(2);
  });

  it('opens launch files from second-instance argv in a new window', async () => {
    const launchPath = '/tmp/second-instance.json';
    setDefaultApp(false);
    process.argv = ['/Applications/prettypretty.app/Contents/MacOS/prettypretty'];

    await loadMainEntry();

    readFileMock.mockResolvedValueOnce('{"second":true}');
    getAppEventHandler('second-instance')(
      {},
      ['/Applications/prettypretty.app/Contents/MacOS/prettypretty', launchPath],
      '/tmp',
    );
    await waitForWindowCount(2);

    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(2);
    const consumeInitialOpenFileHandler = getRegisteredHandler(
      IPCChannels.appConsumeInitialOpenFile,
    );
    browserWindowFromWebContentsMock.mockReturnValue(browserWindows[1]);

    const result = await consumeInitialOpenFileHandler({ sender: {} });

    expect(result).toEqual({
      path: launchPath,
      content: '{"second":true}',
    });
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

afterAll(() => {
  if (originalDefaultAppDescriptor) {
    Object.defineProperty(process, 'defaultApp', originalDefaultAppDescriptor);
  }
});
