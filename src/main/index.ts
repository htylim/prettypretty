import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';
import { createMainWindow } from './windows/mainWindow';

app.setName('prettypretty');

const bootstrap = async (): Promise<void> => {
  registerIpcHandlers();
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
