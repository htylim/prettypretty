import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc';
import { configureApplicationMenu } from './menu/applicationMenu';
import { PreferencesService } from './preferences/preferencesService';
import { PreferencesStore } from './preferences/preferencesStore';
import { createMainWindow } from './windows/mainWindow';

const bootstrap = async (): Promise<void> => {
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

  registerIpcHandlers({ preferencesService });
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
};

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
