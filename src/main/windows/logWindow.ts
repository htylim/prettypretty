import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPCChannels } from '../../shared/ipc-contracts';
import type { SessionLogStore } from '../logging/sessionLogStore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rendererEntryFile = join(__dirname, '../renderer/index.html');
const preloadPath = join(__dirname, '../preload/index.js');

let logWindow: BrowserWindow | null = null;
let unsubscribeFromLogs: (() => void) | null = null;

const createLogWindowOptions = (): BrowserWindowConstructorOptions => ({
  width: 960,
  height: 680,
  minWidth: 760,
  minHeight: 480,
  title: 'prettypretty logs',
  backgroundColor: '#1a1a1a',
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
});

const loadLogWindow = async (window: BrowserWindow): Promise<void> => {
  if (process.env.ELECTRON_RENDERER_URL) {
    const logWindowUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    logWindowUrl.searchParams.set('window', 'log');
    await window.loadURL(logWindowUrl.toString());
    return;
  }

  await window.loadFile(rendererEntryFile, {
    query: {
      window: 'log',
    },
  });
};

export const openOrFocusLogWindow = async (logStore: SessionLogStore): Promise<void> => {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow(createLogWindowOptions());

  logWindow.on('closed', () => {
    unsubscribeFromLogs?.();
    unsubscribeFromLogs = null;
    logWindow = null;
  });

  try {
    await loadLogWindow(logWindow);
    unsubscribeFromLogs = logStore.subscribe((line) => {
      if (!logWindow || logWindow.isDestroyed()) {
        return;
      }

      logWindow.webContents.send(IPCChannels.logsLineAppended, line);
    });
  } catch (error) {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.close();
    }

    logWindow = null;
    unsubscribeFromLogs?.();
    unsubscribeFromLogs = null;
    throw error;
  }
};
