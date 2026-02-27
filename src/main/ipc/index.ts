import { app, clipboard, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { IPCChannels } from '../../shared/ipc-contracts';
import type { Logger } from '../logging/logger';
import type { SessionLogStore } from '../logging/sessionLogStore';
import { isTelemetryEvent } from '../logging/telemetryTypes';
import { isPreferencesPatch } from '../preferences/preferencesTypes';
import type { PrettifierService } from '../prettifier/prettifierService';
import { isPrettifyRunRequest } from '../prettifier/prettifierTypes';
import type { PreferencesService } from '../preferences/preferencesService';

type IpcDependencies = {
  preferencesService: Pick<PreferencesService, 'getAll' | 'update' | 'reset'>;
  prettifierService: Pick<PrettifierService, 'run'>;
  logger: Logger;
  logStore: Pick<SessionLogStore, 'getSnapshot'>;
};

export const registerIpcHandlers = ({
  preferencesService,
  prettifierService,
  logger,
  logStore,
}: IpcDependencies): void => {
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
    logger.info('ingest.open-file', {
      fileExtension: extname(path),
      contentLength: content.length,
      isEmpty: content.length === 0,
    });

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

  ipcMain.handle(IPCChannels.prettifierRun, async (_event, request: unknown) => {
    if (!isPrettifyRunRequest(request)) {
      logger.warn('ipc.validation.error', {
        channel: IPCChannels.prettifierRun,
      });
      throw new Error('Invalid prettifier request payload');
    }

    return await prettifierService.run(request);
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
