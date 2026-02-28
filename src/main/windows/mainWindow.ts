import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appIconPath = join(process.cwd(), 'build/icon.png');
const mainWindowIcon =
  process.platform === 'darwin' || !existsSync(appIconPath) ? undefined : appIconPath;

export const createMainWindow = async (): Promise<BrowserWindow> => {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'prettypretty',
    backgroundColor: '#f5f1eb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (mainWindowIcon) {
    windowOptions.icon = mainWindowIcon;
  }

  const win = new BrowserWindow(windowOptions);

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
};
