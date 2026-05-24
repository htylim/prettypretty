import { BrowserWindow, app, dialog, type Rectangle } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPCChannels, type OpenTextFile } from '../shared/ipc-contracts';
import type { ThemeMode } from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { resolveLaunchFilePaths } from './launch/launchFilePaths';
import { readOpenTextFile } from './launch/openTextFile';
import { createLogger } from './logging/logger';
import { parseRuntimeFlags } from './logging/runtimeFlags';
import { SessionLogStore } from './logging/sessionLogStore';
import { configureApplicationMenu } from './menu/applicationMenu';
import { PreferencesService } from './preferences/preferencesService';
import { PreferencesStore } from './preferences/preferencesStore';
import { createAgentFallbackExecutor } from './prettifier/agentFallbackExecutor';
import { createFallbackProcessRegistry } from './prettifier/fallbackProcessRegistry';
import { createPrettifierService } from './prettifier/prettifierService';
import { resolveE2EWindowMode } from './e2eWindowMode';
import { openOrFocusLogWindow } from './windows/logWindow';
import { createMainWindow, isMainWindow } from './windows/mainWindow';

type WindowOpenSource = 'bootstrap' | 'ipc' | 'launch' | 'menu' | 'open-file' | 'second-instance';

let terminateFallbackProcesses:
  | ((source: 'before-quit' | 'will-quit' | 'window-all-closed') => void)
  | null = null;
let processQueuedEmptyLaunches: ((source: 'second-instance') => Promise<number>) | null = null;
let processQueuedLaunchFiles:
  | ((source: 'launch' | 'open-file' | 'second-instance') => Promise<number>)
  | null = null;
const pendingLaunchFilePaths = resolveLaunchFilePaths();
let pendingEmptyLaunchCount = 0;

const getDocumentWindowReferenceBounds = (window: BrowserWindow | null): Rectangle | null => {
  if (!window || window.isDestroyed() || !isMainWindow(window)) {
    return null;
  }

  return {
    ...window.getNormalBounds(),
  };
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const reportLaunchFileError = (path: string, error: unknown): void => {
  dialog.showErrorBox('Unable to open file', `${path}\n\n${toErrorMessage(error)}`);
};

const bootstrap = async (): Promise<void> => {
  const runtimeFlags = parseRuntimeFlags();
  const e2eWindowMode = resolveE2EWindowMode();
  const sessionLogStore = new SessionLogStore(2_000);
  const logger = createLogger({
    verbose: runtimeFlags.verbose,
    onLine: (line) => {
      sessionLogStore.append(line);
    },
  });
  logger.info('app.bootstrap.start', {
    verbose: runtimeFlags.verbose,
  });

  app.setName('prettypretty');

  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = join(process.cwd(), 'build/icon.png');
    if (existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath);
    }
  }

  const preferencesStore = new PreferencesStore(app.getPath('userData'));
  const preferencesService = new PreferencesService(preferencesStore);
  const fallbackProcessRegistry = createFallbackProcessRegistry();
  const fallbackExecutor = createAgentFallbackExecutor({
    processRegistry: fallbackProcessRegistry,
  });
  const prettifierService = createPrettifierService({
    preferencesService,
    logger,
    fallbackExecutor,
  });
  terminateFallbackProcesses = (
    source: 'before-quit' | 'will-quit' | 'window-all-closed',
  ): void => {
    const terminatedProcessCount = fallbackProcessRegistry.terminateAll();
    if (terminatedProcessCount === 0) {
      return;
    }

    logger.info('app.shutdown.fallback-processes-terminated', {
      source,
      terminatedProcessCount,
    });
  };
  const resolveInitialThemeMode = async (): Promise<ThemeMode> => {
    const fallbackThemeMode: ThemeMode = 'light';

    try {
      const preferences = await preferencesService.getAll();
      return preferences.themeMode;
    } catch (error) {
      logger.error('app.preferences.initial-load-failed', {
        reason: error instanceof Error ? error.message : 'unknown',
        fallbackThemeMode,
      });
      return fallbackThemeMode;
    }
  };
  const initialOpenFilesByWindowId = new Map<number, OpenTextFile>();

  const openDocumentWindow = async (
    source: WindowOpenSource,
    referenceBounds: Rectangle | null = null,
    initialOpenFile: OpenTextFile | null = null,
  ): Promise<BrowserWindow> => {
    const initialThemeMode = await resolveInitialThemeMode();
    const window = await createMainWindow(initialThemeMode, {
      onWindowCreated: (createdWindow) => {
        if (!initialOpenFile) {
          return;
        }

        initialOpenFilesByWindowId.set(createdWindow.id, initialOpenFile);
      },
      referenceBounds,
      windowMode: e2eWindowMode,
    });
    logger.info('app.window.created', {
      source,
    });
    return window;
  };
  let isProcessingQueuedEmptyLaunches = false;
  processQueuedEmptyLaunches = async (source: 'second-instance'): Promise<number> => {
    if (isProcessingQueuedEmptyLaunches) {
      return 0;
    }

    isProcessingQueuedEmptyLaunches = true;
    let openedWindowCount = 0;

    try {
      while (pendingEmptyLaunchCount > 0) {
        pendingEmptyLaunchCount -= 1;
        const referenceBounds =
          openedWindowCount === 0
            ? getDocumentWindowReferenceBounds(BrowserWindow.getFocusedWindow())
            : null;
        await openDocumentWindow(source, referenceBounds);
        openedWindowCount += 1;
      }
    } finally {
      isProcessingQueuedEmptyLaunches = false;
    }

    return openedWindowCount;
  };

  let isProcessingQueuedLaunchFiles = false;
  processQueuedLaunchFiles = async (
    source: 'launch' | 'open-file' | 'second-instance',
  ): Promise<number> => {
    if (isProcessingQueuedLaunchFiles) {
      return 0;
    }

    isProcessingQueuedLaunchFiles = true;
    let openedWindowCount = 0;

    try {
      while (pendingLaunchFilePaths.length > 0) {
        const launchFilePaths = pendingLaunchFilePaths.splice(0);

        for (const path of launchFilePaths) {
          try {
            const file = await readOpenTextFile(path, logger);
            await openDocumentWindow(source, null, file);
            openedWindowCount += 1;
          } catch (error) {
            logger.error('app.window.open-file-failed', {
              source,
              path,
              reason: toErrorMessage(error),
            });
            reportLaunchFileError(path, error);
          }
        }
      }
    } finally {
      isProcessingQueuedLaunchFiles = false;
    }

    return openedWindowCount;
  };

  const resetFocusedDocumentWindow = (): void => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow || !isMainWindow(focusedWindow)) {
      return;
    }

    focusedWindow.webContents.send(IPCChannels.appResetCurrentWindow);
    logger.info('app.window.reset-requested', {
      source: 'menu',
      windowId: focusedWindow.id,
    });
  };

  const refreshFocusedDocumentWindow = (): void => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow || !isMainWindow(focusedWindow)) {
      return;
    }

    focusedWindow.webContents.send(IPCChannels.appRefreshCurrentWindow);
    logger.info('app.window.refresh-requested', {
      source: 'menu',
      windowId: focusedWindow.id,
    });
  };

  configureApplicationMenu({
    onNewWindow: () => {
      const referenceBounds = getDocumentWindowReferenceBounds(BrowserWindow.getFocusedWindow());
      void openDocumentWindow('menu', referenceBounds).catch((error: unknown) => {
        logger.error('app.window.open-failed', {
          source: 'menu',
          reason: error instanceof Error ? error.message : 'unknown',
        });
      });
    },
    onRefreshWindow: refreshFocusedDocumentWindow,
    onResetWindow: resetFocusedDocumentWindow,
    onViewLog: () => {
      void openOrFocusLogWindow(sessionLogStore, {
        windowMode: e2eWindowMode,
      }).catch((error: unknown) => {
        logger.error('app.log-window.open-failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      });
    },
  });
  registerIpcHandlers({
    preferencesService,
    prettifierService,
    logger,
    logStore: sessionLogStore,
    onOpenWindow: async (window) => {
      await openDocumentWindow('ipc', getDocumentWindowReferenceBounds(window));
    },
    onConsumeInitialOpenFile: async (window) => {
      if (!window) {
        return null;
      }

      const file = initialOpenFilesByWindowId.get(window.id) ?? null;
      initialOpenFilesByWindowId.delete(window.id);
      return file;
    },
  });
  logger.info('app.bootstrap.ipc-registered');
  app.on('before-quit', () => {
    terminateFallbackProcesses?.('before-quit');
  });
  app.on('will-quit', () => {
    terminateFallbackProcesses?.('will-quit');
  });
  const openedLaunchWindowCount = await processQueuedLaunchFiles('launch');
  await processQueuedEmptyLaunches('second-instance');
  if (openedLaunchWindowCount === 0) {
    await openDocumentWindow('bootstrap');
  }
};

const acquiredSingleInstanceLock = app.requestSingleInstanceLock();

if (!acquiredSingleInstanceLock) {
  app.quit();
} else {
  app.on('open-file', (event, path) => {
    event.preventDefault();
    pendingLaunchFilePaths.push(path);

    if (!processQueuedLaunchFiles) {
      return;
    }

    void processQueuedLaunchFiles('open-file').catch(() => undefined);
  });

  app.on('second-instance', (_event, argv, workingDirectory) => {
    const launchFilePaths = resolveLaunchFilePaths({
      argv,
      currentWorkingDirectory: workingDirectory,
    });

    if (launchFilePaths.length === 0) {
      pendingEmptyLaunchCount += 1;
      if (!processQueuedEmptyLaunches) {
        return;
      }

      void processQueuedEmptyLaunches('second-instance').catch(() => undefined);
      return;
    }

    pendingLaunchFilePaths.push(...launchFilePaths);
    if (!processQueuedLaunchFiles) {
      return;
    }

    void processQueuedLaunchFiles('second-instance').catch(() => undefined);
  });

  app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  terminateFallbackProcesses?.('window-all-closed');
  app.exit(0);
});
