import {
  BrowserWindow,
  screen,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPCChannels } from '../../shared/ipc-contracts';
import type { ThemeMode } from '../../shared/types';
import { shouldShowWindow, type E2EWindowMode } from '../e2eWindowMode';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appIconPath = join(process.cwd(), 'build/icon.png');
const mainWindowIcon =
  process.platform === 'darwin' || !existsSync(appIconPath) ? undefined : appIconPath;
const INITIAL_THEME_MODE_ARG_PREFIX = '--prettypretty-theme-mode=';
const MAIN_WINDOW_WIDTH = 1600;
const MAIN_WINDOW_HEIGHT = 1050;
const WINDOW_STAGGER_OFFSET = 32;
const mainWindows = new WeakSet<BrowserWindow>();
const isBrowserNavigationCommand = (
  command: string,
): command is 'browser-backward' | 'browser-forward' => {
  return command === 'browser-backward' || command === 'browser-forward';
};

const isSwipeDirection = (direction: string): direction is 'left' | 'right' => {
  return direction === 'left' || direction === 'right';
};

const getBrowserNavigationCommandForSwipe = (
  direction: 'left' | 'right',
): 'browser-backward' | 'browser-forward' => {
  return direction === 'left' ? 'browser-backward' : 'browser-forward';
};

const getMainWindowBackgroundColor = (themeMode: ThemeMode): string => {
  return themeMode === 'dark' ? '#121316' : '#f5f1eb';
};

const getReferenceWindowBounds = (): Rectangle | null => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow || focusedWindow.isDestroyed()) {
    return null;
  }

  return {
    ...focusedWindow.getNormalBounds(),
  };
};

const clampAxisPosition = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
};

const getWrappedAxisPosition = (
  origin: number,
  min: number,
  max: number,
  offset: number,
): number => {
  const clampedOrigin = clampAxisPosition(origin, min, max);
  const next = clampedOrigin + offset;
  if (next <= max) {
    return next;
  }

  return min + Math.min(offset, Math.max(max - min, 0));
};

const getStaggeredWindowPosition = (
  referenceBounds: Rectangle | null,
): Pick<BrowserWindowConstructorOptions, 'x' | 'y'> => {
  if (!referenceBounds) {
    return {};
  }

  const { workArea } = screen.getDisplayMatching(referenceBounds);
  const maxX = workArea.x + Math.max(workArea.width - MAIN_WINDOW_WIDTH, 0);
  const maxY = workArea.y + Math.max(workArea.height - MAIN_WINDOW_HEIGHT, 0);

  return {
    x: getWrappedAxisPosition(referenceBounds.x, workArea.x, maxX, WINDOW_STAGGER_OFFSET),
    y: getWrappedAxisPosition(referenceBounds.y, workArea.y, maxY, WINDOW_STAGGER_OFFSET),
  };
};

type CreateMainWindowOptions = {
  onWindowCreated?: (window: BrowserWindow) => void;
  referenceBounds?: Rectangle | null;
  windowMode?: E2EWindowMode;
};

export const createMainWindow = async (
  initialThemeMode: ThemeMode,
  options: CreateMainWindowOptions = {},
): Promise<BrowserWindow> => {
  const referenceBounds = options.referenceBounds ?? getReferenceWindowBounds();
  const shouldShowInitially = shouldShowWindow(options.windowMode ?? 'visible');
  const windowOptions: BrowserWindowConstructorOptions = {
    width: MAIN_WINDOW_WIDTH,
    height: MAIN_WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 640,
    title: 'prettypretty',
    show: shouldShowInitially,
    paintWhenInitiallyHidden: true,
    backgroundColor: getMainWindowBackgroundColor(initialThemeMode),
    ...getStaggeredWindowPosition(referenceBounds),
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
  options.onWindowCreated?.(win);
  win.on?.('app-command', (event, command) => {
    if (!isBrowserNavigationCommand(command)) {
      return;
    }

    event.preventDefault();
    win.webContents.send(IPCChannels.appNavigationCommand, command);
  });
  win.on?.('swipe', (event, direction) => {
    if (!isSwipeDirection(direction)) {
      return;
    }

    event.preventDefault();
    win.webContents.send(
      IPCChannels.appNavigationCommand,
      getBrowserNavigationCommandForSwipe(direction),
    );
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  if (shouldShowInitially) {
    win.focus();
    win.webContents.focus();
  }

  return win;
};

export const isMainWindow = (window: BrowserWindow): boolean => {
  return mainWindows.has(window);
};
