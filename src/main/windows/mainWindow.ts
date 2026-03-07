import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ThemeMode } from '../../shared/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appIconPath = join(process.cwd(), 'build/icon.png');
const mainWindowIcon =
  process.platform === 'darwin' || !existsSync(appIconPath) ? undefined : appIconPath;
const INITIAL_THEME_MODE_ARG_PREFIX = '--prettypretty-theme-mode=';
const mainWindows = new WeakSet<BrowserWindow>();

const getMainWindowBackgroundColor = (themeMode: ThemeMode): string => {
  return themeMode === 'dark' ? '#121316' : '#f5f1eb';
};

export const createMainWindow = async (initialThemeMode: ThemeMode): Promise<BrowserWindow> => {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'prettypretty',
    backgroundColor: getMainWindowBackgroundColor(initialThemeMode),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`${INITIAL_THEME_MODE_ARG_PREFIX}${initialThemeMode}`],
    },
  };

  if (mainWindowIcon) {
    windowOptions.icon = mainWindowIcon;
  }

  const win = new BrowserWindow(windowOptions);
  mainWindows.add(win);

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
};

export const isMainWindow = (window: BrowserWindow): boolean => {
  return mainWindows.has(window);
};
