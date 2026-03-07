import { BrowserWindow, app, clipboard, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { IPCChannels } from '../../shared/ipc-contracts';
import type { Logger } from '../logging/logger';
import type { SessionLogStore } from '../logging/sessionLogStore';
import { isTelemetryEvent } from '../logging/telemetryTypes';
import { isPreferencesPatch } from '../preferences/preferencesTypes';
import type { PrettifierService } from '../prettifier/prettifierService';
import { isPrettifyCancelRequest, isPrettifyRunRequest } from '../prettifier/prettifierTypes';
import type { PreferencesService } from '../preferences/preferencesService';

type IpcDependencies = {
  preferencesService: Pick<PreferencesService, 'getAll' | 'update' | 'reset'>;
  prettifierService: Pick<PrettifierService, 'run' | 'cancel'>;
  logger: Logger;
  logStore: Pick<SessionLogStore, 'getSnapshot'>;
  onOpenWindow: () => Promise<void>;
};

const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

export const registerIpcHandlers = ({
  preferencesService,
  prettifierService,
  logger,
  logStore,
  onOpenWindow,
}: IpcDependencies): void => {
  ipcMain.handle(IPCChannels.dialogOpenFile, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, {
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
        })
      : await dialog.showOpenDialog({
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
    logger.info('ingest.open-file', {
      fileExtension: extname(path),
      contentLength: content.length,
      isEmpty: content.length === 0,
    });

    return { path, content };
  });

  ipcMain.handle(IPCChannels.fileSave, async (event, content: unknown) => {
    if (!isString(content)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.fileSave,
      });
      throw new Error('Invalid file save payload');
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showSaveDialog(window, {
          title: 'Save prettified text',
          defaultPath: 'prettified.txt',
          filters: [
            {
              name: 'Text Files',
              extensions: ['txt', 'json', 'js', 'ts', 'py', 'md', 'yaml', 'yml'],
            },
          ],
        })
      : await dialog.showSaveDialog({
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
    if (!isString(content)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.clipboardCopy,
      });
      throw new Error('Invalid clipboard payload');
    }

    clipboard.writeText(content);
  });

  ipcMain.handle(IPCChannels.appGetInfo, () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
    };
  });

  ipcMain.handle(IPCChannels.appOpenWindow, async () => {
    await onOpenWindow();
  });

  ipcMain.handle(IPCChannels.logsGetHistory, () => {
    return logStore.getSnapshot();
  });

  ipcMain.handle(IPCChannels.preferencesGetAll, async () => {
    return await preferencesService.getAll();
  });

  ipcMain.handle(IPCChannels.preferencesUpdate, async (_event, patch: unknown) => {
    if (!isPreferencesPatch(patch)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.preferencesUpdate,
      });
      throw new Error('Invalid preferences patch payload');
    }

    return await preferencesService.update(patch);
  });

  ipcMain.handle(IPCChannels.preferencesReset, async () => {
    return await preferencesService.reset();
  });

  ipcMain.handle(IPCChannels.prettifierRun, async (event, request: unknown) => {
    if (!isPrettifyRunRequest(request)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.prettifierRun,
      });
      throw new Error('Invalid prettifier request payload');
    }

    return await prettifierService.run(request, {
      onFallbackProgress: (line) => {
        event.sender.send(IPCChannels.prettifierProgress, {
          requestId: request.requestId,
          line,
        });
      },
    });
  });

  ipcMain.handle(IPCChannels.prettifierCancel, async (_event, request: unknown) => {
    if (!isPrettifyCancelRequest(request)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.prettifierCancel,
      });
      throw new Error('Invalid prettifier cancel payload');
    }

    return prettifierService.cancel(request.requestId);
  });

  ipcMain.handle(IPCChannels.telemetryLogEvent, async (_event, event: unknown) => {
    if (!isTelemetryEvent(event)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.telemetryLogEvent,
      });
      throw new Error('Invalid telemetry event payload');
    }

    logger.info(event.name, event.meta);
  });
};
