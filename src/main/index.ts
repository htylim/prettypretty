import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc';
import { createLogger } from './logging/logger';
import { parseRuntimeFlags } from './logging/runtimeFlags';
import { configureApplicationMenu } from './menu/applicationMenu';
import { PreferencesService } from './preferences/preferencesService';
import { PreferencesStore } from './preferences/preferencesStore';
import { createPrettifierService } from './prettifier/prettifierService';
import { createMainWindow } from './windows/mainWindow';

const bootstrap = async (): Promise<void> => {
  const runtimeFlags = parseRuntimeFlags();
  const logger = createLogger(runtimeFlags.verbose);
  logger.info('app.bootstrap.start', {
    verbose: runtimeFlags.verbose,
  });

  app.setName('prettypretty');
  configureApplicationMenu();

  if (process.platform === 'darwin' && app.dock) {
    const dockIconPath = join(process.cwd(), 'build/icon.png');
    if (existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath);
    }
  }

  const preferencesStore = new PreferencesStore(app.getPath('userData'));
  const preferencesService = new PreferencesService(preferencesStore);
  const prettifierService = createPrettifierService({ preferencesService, logger });

  registerIpcHandlers({ preferencesService, prettifierService, logger });
  logger.info('app.bootstrap.ipc-registered');
  await createMainWindow();
  logger.info('app.window.created', {
    source: 'bootstrap',
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
      logger.info('app.window.created', {
        source: 'activate',
      });
    }
  });
};

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
