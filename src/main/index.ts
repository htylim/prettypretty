import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc';
import { createLogger } from './logging/logger';
import { parseRuntimeFlags } from './logging/runtimeFlags';
import { SessionLogStore } from './logging/sessionLogStore';
import { configureApplicationMenu } from './menu/applicationMenu';
import { PreferencesService } from './preferences/preferencesService';
import { PreferencesStore } from './preferences/preferencesStore';
import { createPrettifierService } from './prettifier/prettifierService';
import { openOrFocusLogWindow } from './windows/logWindow';
import { createMainWindow } from './windows/mainWindow';

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
  configureApplicationMenu({
    onViewLog: () => {
      void openOrFocusLogWindow(sessionLogStore).catch((error: unknown) => {
        logger.error('app.log-window.open-failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        });
      });
    },
  });

  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = join(process.cwd(), 'build/icon.png');
    if (existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath);
    }
  }

  const preferencesStore = new PreferencesStore(app.getPath('userData'));
  const preferencesService = new PreferencesService(preferencesStore);
  const prettifierService = createPrettifierService({ preferencesService, logger });

  registerIpcHandlers({ preferencesService, prettifierService, logger, logStore: sessionLogStore });
  logger.info('app.bootstrap.ipc-registered');
  const mainWindow = await createMainWindow();
  mainWindow.once('close', () => {
    logger.info('app.window.close-requested', {
      source: 'main',
    });
    app.exit(0);
  });
  logger.info('app.window.created', {
    source: 'bootstrap',
  });
};

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  app.exit(0);
});
