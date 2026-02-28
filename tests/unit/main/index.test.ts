// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  appEventHandlers,
  appExitMock,
  appGetPathMock,
  appOnMock,
  appSetNameMock,
  appWhenReadyMock,
  browserWindowConstructorMock,
  browserWindowLoadFileMock,
  browserWindowLoadURLMock,
  browserWindowOnceMock,
  buildFromTemplateMock,
  dialogShowOpenDialogMock,
  dialogShowSaveDialogMock,
  existsSyncMock,
  ipcHandleMock,
  setApplicationMenuMock,
  shellOpenPathMock,
  showErrorBoxMock,
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
    browserWindowLoadFileMock: vi.fn(),
    browserWindowLoadURLMock: vi.fn(),
    browserWindowOnceMock: vi.fn(),
    buildFromTemplateMock: vi.fn(),
    dialogShowOpenDialogMock: vi.fn(),
    dialogShowSaveDialogMock: vi.fn(),
    existsSyncMock: vi.fn(),
    ipcHandleMock: vi.fn(),
    setApplicationMenuMock: vi.fn(),
    shellOpenPathMock: vi.fn(),
    showErrorBoxMock: vi.fn(),
    writeTextMock: vi.fn(),
  };
});

class BrowserWindowMock {
  constructor(options: unknown) {
    browserWindowConstructorMock(options);
  }

  async loadFile(...args: unknown[]): Promise<void> {
    await browserWindowLoadFileMock(...args);
  }

  async loadURL(...args: unknown[]): Promise<void> {
    await browserWindowLoadURLMock(...args);
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    browserWindowOnceMock(event, listener);
    return this;
  }
}

vi.mock('electron', () => {
  return {
    BrowserWindow: BrowserWindowMock,
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
  };
});

vi.mock('node:fs', () => {
  return {
    existsSync: existsSyncMock,
  };
});

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const getAppEventHandler = (event: string): ((...args: unknown[]) => void) => {
  const handler = appEventHandlers.get(event);
  if (!handler) {
    throw new Error(`Expected app.on handler for ${event}`);
  }

  return handler;
};

const getMainWindowClosedHandler = (): (() => void) => {
  const closeCall = browserWindowOnceMock.mock.calls.find(([event]) => event === 'close');
  if (!closeCall || typeof closeCall[1] !== 'function') {
    throw new Error('Expected main window close handler');
  }

  return closeCall[1] as () => void;
};

const loadMainEntry = async (): Promise<void> => {
  await import('../../../src/main/index');
  await flushMicrotasks();
};

describe('main process window lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    appEventHandlers.clear();

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
    browserWindowLoadFileMock.mockReset().mockResolvedValue(undefined);
    browserWindowLoadURLMock.mockReset().mockResolvedValue(undefined);
    browserWindowOnceMock.mockReset();
    buildFromTemplateMock.mockReset().mockReturnValue({});
    dialogShowOpenDialogMock.mockReset().mockResolvedValue({ canceled: true, filePaths: [] });
    dialogShowSaveDialogMock.mockReset().mockResolvedValue({ canceled: true, filePath: null });
    existsSyncMock.mockReset().mockReturnValue(false);
    ipcHandleMock.mockReset();
    setApplicationMenuMock.mockReset();
    shellOpenPathMock.mockReset().mockResolvedValue('');
    showErrorBoxMock.mockReset();
    writeTextMock.mockReset();
  });

  it('quits the app when the main window is closed and does not re-create it via activate', async () => {
    await loadMainEntry();

    expect(browserWindowConstructorMock).toHaveBeenCalledTimes(1);
    expect(appEventHandlers.has('activate')).toBe(false);

    const closedHandler = getMainWindowClosedHandler();
    closedHandler();

    expect(appExitMock).toHaveBeenCalledTimes(1);
    expect(appExitMock).toHaveBeenCalledWith(0);
  });

  it('quits on window-all-closed without platform exceptions', async () => {
    await loadMainEntry();

    const windowAllClosed = getAppEventHandler('window-all-closed');
    windowAllClosed();

    expect(appExitMock).toHaveBeenCalledTimes(1);
    expect(appExitMock).toHaveBeenCalledWith(0);
  });
});
