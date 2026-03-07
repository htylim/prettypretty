import { BrowserWindow, app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { IPCChannels } from '../shared/ipc-contracts';
import type { ThemeMode } from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { createLogger } from './logging/logger';
import { parseRuntimeFlags } from './logging/runtimeFlags';
import { SessionLogStore } from './logging/sessionLogStore';
import { configureApplicationMenu } from './menu/applicationMenu';
import { PreferencesService } from './preferences/preferencesService';
import { PreferencesStore } from './preferences/preferencesStore';
import { createAgentFallbackExecutor } from './prettifier/agentFallbackExecutor';
import { createFallbackProcessRegistry } from './prettifier/fallbackProcessRegistry';
import { createPrettifierService } from './prettifier/prettifierService';
import { openOrFocusLogWindow } from './windows/logWindow';
import { createMainWindow, isMainWindow } from './windows/mainWindow';

let terminateFallbackProcesses:
  | ((source: 'before-quit' | 'will-quit' | 'window-all-closed') => void)
  | null = null;

const bootstrap = async (): Promise<void> => {
  const runtimeFlags = parseRuntimeFlags();
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

  const openDocumentWindow = async (source: 'bootstrap' | 'ipc' | 'menu'): Promise<void> => {
    const initialThemeMode = await resolveInitialThemeMode();
    await createMainWindow(initialThemeMode);
    logger.info('app.window.created', {
      source,
    });
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
  configureApplicationMenu({
    onNewWindow: () => {
      void openDocumentWindow('menu').catch((error: unknown) => {
        logger.error('app.window.open-failed', {
          source: 'menu',
          reason: error instanceof Error ? error.message : 'unknown',
        });
      });
    },
    onResetWindow: resetFocusedDocumentWindow,
    onViewLog: () => {
      void openOrFocusLogWindow(sessionLogStore).catch((error: unknown) => {
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
    onOpenWindow: async () => {
      await openDocumentWindow('ipc');
    },
  });
  logger.info('app.bootstrap.ipc-registered');
  app.on('before-quit', () => {
    terminateFallbackProcesses?.('before-quit');
  });
  app.on('will-quit', () => {
    terminateFallbackProcesses?.('will-quit');
  });
  await openDocumentWindow('bootstrap');
};

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  terminateFallbackProcesses?.('window-all-closed');
  app.exit(0);
});
