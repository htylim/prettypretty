import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';
import { PreferencesService } from './preferences/preferencesService';
import { PreferencesStore } from './preferences/preferencesStore';
import { createMainWindow } from './windows/mainWindow';

app.setName('prettypretty');

const bootstrap = async (): Promise<void> => {
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
