import { app, clipboard, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { IPCChannels } from '../../shared/ipc-contracts';

export const registerIpcHandlers = (): void => {
  ipcMain.handle(IPCChannels.dialogOpenFile, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open file',
      properties: ['openFile'],
      filters: [
        {
          name: 'Supported Text Files',
          extensions: ['json', 'js', 'ts', 'py', 'txt', 'md', 'yaml', 'yml'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const [path] = result.filePaths;
    if (!path) {
      return null;
    }

    const content = await readFile(path, 'utf8');

    return { path, content };
  });

  ipcMain.handle(IPCChannels.fileSave, async (_event, content: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Save prettified text',
      defaultPath: 'prettified.txt',
      filters: [
        {
          name: 'Text Files',
          extensions: ['txt', 'json', 'js', 'ts', 'py', 'md', 'yaml', 'yml'],
        },
      ],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await writeFile(result.filePath, content, 'utf8');

    return { path: result.filePath };
  });

  ipcMain.handle(IPCChannels.clipboardCopy, (_event, content: string) => {
    clipboard.writeText(content);
  });

  ipcMain.handle(IPCChannels.appGetInfo, () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
    };
  });
};
