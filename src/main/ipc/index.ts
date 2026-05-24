import type { FileFilter, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { BrowserWindow, app, clipboard, dialog, ipcMain } from 'electron';
import type { WebContents } from 'electron';
import { writeFile } from 'node:fs/promises';
import {
  IPCChannels,
  type ClearOpenFileSourceRequest,
  type CommitOpenFileSourceRequest,
  type FileSourceKind,
  type OpenTextFile,
  type RefreshOpenFileRequest,
  type RefreshableOpenTextFile,
} from '../../shared/ipc-contracts';
import type { Logger } from '../logging/logger';
import type { SessionLogStore } from '../logging/sessionLogStore';
import { readOpenTextFile } from '../launch/openTextFile';
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
  onOpenWindow: (window: BrowserWindow | null) => Promise<void>;
  onConsumeInitialOpenFile: (window: BrowserWindow | null) => Promise<OpenTextFile | null>;
};

const isString = (value: unknown): value is string => {
  return typeof value === 'string';
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const isRefreshOpenFileRequest = (value: unknown): value is RefreshOpenFileRequest => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RefreshOpenFileRequest>;
  return isNonEmptyString(candidate.path) && isNonEmptyString(candidate.sourceToken);
};

const isCommitOpenFileSourceRequest = (value: unknown): value is CommitOpenFileSourceRequest => {
  return isRefreshOpenFileRequest(value);
};

const isClearOpenFileSourceRequest = (value: unknown): value is ClearOpenFileSourceRequest => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ClearOpenFileSourceRequest>;
  return (
    isNonEmptyString(candidate.path) &&
    isNonEmptyString(candidate.sourceToken) &&
    (candidate.scope === 'pending' || candidate.scope === 'committed')
  );
};

const TEXT_FILE_FILTERS: FileFilter[] = [
  {
    name: 'Supported Text Files',
    extensions: ['json', 'js', 'ts', 'py', 'txt', 'md', 'yaml', 'yml'],
  },
  {
    name: 'All Files',
    extensions: ['*'],
  },
];

const SAVE_FILE_FILTERS: FileFilter[] = [
  {
    name: 'Text Files',
    extensions: ['txt', 'json', 'js', 'ts', 'py', 'md', 'yaml', 'yml'],
  },
];

// Dialogs should stay parented to the invoking window when multiple document
// windows are open; Electron falls back to app-level dialogs when no window exists.
const getSenderWindow = (sender: WebContents): BrowserWindow | null => {
  return BrowserWindow.fromWebContents(sender);
};

const showOpenTextFileDialog = async (window: BrowserWindow | null) => {
  const options: OpenDialogOptions = {
    title: 'Open file',
    properties: ['openFile'],
    filters: TEXT_FILE_FILTERS,
  };

  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
};

const showSaveTextFileDialog = async (window: BrowserWindow | null) => {
  const options: SaveDialogOptions = {
    title: 'Save prettified text',
    defaultPath: 'prettified.txt',
    filters: SAVE_FILE_FILTERS,
  };

  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
};

const throwInvalidPayload = (logger: Logger, channel: string, message: string): never => {
  logger.warn('ipc.validation.error', {
    channel,
  });
  throw new Error(message);
};

// Every renderer-originated payload is validated at the IPC boundary so the main
// process never operates on unchecked `unknown` input.
const expectPayload = <T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
  options: {
    logger: Logger;
    channel: string;
    message: string;
  },
): T => {
  if (!guard(value)) {
    throwInvalidPayload(options.logger, options.channel, options.message);
  }

  return value as T;
};

export const registerIpcHandlers = ({
  preferencesService,
  prettifierService,
  logger,
  logStore,
  onOpenWindow,
  onConsumeInitialOpenFile,
}: IpcDependencies): void => {
  type AuthorizedFileSource = {
    sourceToken: string;
    path: string;
    sourceKind: FileSourceKind;
  };

  const pendingFileSourcesByWindowId = new Map<number, AuthorizedFileSource>();
  const committedFileSourcesByWindowId = new Map<number, AuthorizedFileSource>();
  const cleanupTrackedWindowIds = new Set<number>();
  let nextSourceToken = 0;

  const createSourceToken = (): string => {
    nextSourceToken += 1;
    return `file-source-${nextSourceToken}`;
  };

  const trackWindowSourceCleanup = (window: BrowserWindow): void => {
    if (cleanupTrackedWindowIds.has(window.id)) {
      return;
    }

    cleanupTrackedWindowIds.add(window.id);
    if (typeof window.on !== 'function') {
      return;
    }

    window.on('closed', () => {
      pendingFileSourcesByWindowId.delete(window.id);
      committedFileSourcesByWindowId.delete(window.id);
      cleanupTrackedWindowIds.delete(window.id);
    });
  };

  const createPendingFileSource = (
    window: BrowserWindow,
    path: string,
    sourceKind: FileSourceKind,
  ): AuthorizedFileSource => {
    trackWindowSourceCleanup(window);
    const source = {
      sourceToken: createSourceToken(),
      path,
      sourceKind,
    };
    pendingFileSourcesByWindowId.set(window.id, source);
    return source;
  };

  const attachPendingFileSource = (
    window: BrowserWindow | null,
    file: OpenTextFile | null,
    sourceKind: FileSourceKind,
  ): RefreshableOpenTextFile | null => {
    if (!file) {
      return null;
    }

    if (!window) {
      throw new Error('Unable to authorize open file source without a document window');
    }

    const source = createPendingFileSource(window, file.path, sourceKind);
    return {
      ...file,
      sourceToken: source.sourceToken,
      sourceKind: source.sourceKind,
    };
  };

  const matchesSource = (
    source: AuthorizedFileSource | undefined,
    payload: Pick<AuthorizedFileSource, 'sourceToken' | 'path'>,
  ): source is AuthorizedFileSource => {
    return source?.sourceToken === payload.sourceToken && source.path === payload.path;
  };

  const getAuthorizedSourceWindow = (sender: WebContents): BrowserWindow => {
    const window = getSenderWindow(sender);
    if (!window) {
      throw new Error('Unauthorized refresh file request');
    }

    return window;
  };

  // Register once at startup. Each handler keeps platform APIs and filesystem
  // access in main while renderer code talks through typed contracts.
  ipcMain.handle(IPCChannels.dialogOpenFile, async (event) => {
    const window = getSenderWindow(event.sender);
    const result = await showOpenTextFileDialog(window);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const [path] = result.filePaths;
    if (!path) {
      return null;
    }

    return attachPendingFileSource(
      window,
      await readOpenTextFile(path, logger),
      'dialog-open-file',
    );
  });

  ipcMain.handle(IPCChannels.fileRefreshOpenFile, async (event, request: unknown) => {
    const safeRequest = expectPayload(request, isRefreshOpenFileRequest, {
      logger,
      channel: IPCChannels.fileRefreshOpenFile,
      message: 'Invalid refresh file payload',
    });
    const window = getAuthorizedSourceWindow(event.sender);
    const committedSource = committedFileSourcesByWindowId.get(window.id);

    if (!matchesSource(committedSource, safeRequest)) {
      throw new Error('Unauthorized refresh file request');
    }

    const file = await readOpenTextFile(safeRequest.path, logger);
    return attachPendingFileSource(window, file, 'refresh-file');
  });

  ipcMain.handle(IPCChannels.fileCommitOpenFileSource, async (event, request: unknown) => {
    const safeRequest = expectPayload(request, isCommitOpenFileSourceRequest, {
      logger,
      channel: IPCChannels.fileCommitOpenFileSource,
      message: 'Invalid file source commit payload',
    });
    const window = getAuthorizedSourceWindow(event.sender);
    const pendingSource = pendingFileSourcesByWindowId.get(window.id);

    if (!matchesSource(pendingSource, safeRequest)) {
      throw new Error('Invalid file source commit payload');
    }

    pendingFileSourcesByWindowId.delete(window.id);
    committedFileSourcesByWindowId.set(window.id, pendingSource);
    return true;
  });

  ipcMain.handle(IPCChannels.fileClearOpenFileSource, async (event, request: unknown) => {
    const safeRequest = expectPayload(request, isClearOpenFileSourceRequest, {
      logger,
      channel: IPCChannels.fileClearOpenFileSource,
      message: 'Invalid file source clear payload',
    });
    const window = getAuthorizedSourceWindow(event.sender);
    const sourceMap =
      safeRequest.scope === 'pending'
        ? pendingFileSourcesByWindowId
        : committedFileSourcesByWindowId;
    const source = sourceMap.get(window.id);

    if (!matchesSource(source, safeRequest)) {
      throw new Error('Invalid file source clear payload');
    }

    sourceMap.delete(window.id);
    return true;
  });

  ipcMain.handle(IPCChannels.fileSave, async (event, content: unknown) => {
    const safeContent = expectPayload(content, isString, {
      logger,
      channel: IPCChannels.fileSave,
      message: 'Invalid file save payload',
    });
    const result = await showSaveTextFileDialog(getSenderWindow(event.sender));

    if (result.canceled || !result.filePath) {
      return null;
    }

    await writeFile(result.filePath, safeContent, 'utf8');

    return { path: result.filePath };
  });

  ipcMain.handle(IPCChannels.clipboardCopy, (_event, content: unknown) => {
    const safeContent = expectPayload(content, isString, {
      logger,
      channel: IPCChannels.clipboardCopy,
      message: 'Invalid clipboard payload',
    });

    clipboard.writeText(safeContent);
  });

  ipcMain.handle(IPCChannels.appGetInfo, () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
    };
  });

  ipcMain.handle(IPCChannels.appOpenWindow, async (event) => {
    await onOpenWindow(getSenderWindow(event.sender));
  });

  ipcMain.handle(IPCChannels.appConsumeInitialOpenFile, async (event) => {
    const window = getSenderWindow(event.sender);
    return attachPendingFileSource(
      window,
      await onConsumeInitialOpenFile(window),
      'startup-open-file',
    );
  });

  ipcMain.handle(IPCChannels.logsGetHistory, () => {
    return logStore.getSnapshot();
  });

  ipcMain.handle(IPCChannels.preferencesGetAll, async () => {
    return preferencesService.getAll();
  });

  ipcMain.handle(IPCChannels.preferencesUpdate, async (_event, patch: unknown) => {
    const safePatch = expectPayload(patch, isPreferencesPatch, {
      logger,
      channel: IPCChannels.preferencesUpdate,
      message: 'Invalid preferences patch payload',
    });

    return preferencesService.update(safePatch);
  });

  ipcMain.handle(IPCChannels.preferencesReset, async () => {
    return preferencesService.reset();
  });

  ipcMain.handle(IPCChannels.prettifierRun, async (event, request: unknown) => {
    const safeRequest = expectPayload(request, isPrettifyRunRequest, {
      logger,
      channel: IPCChannels.prettifierRun,
      message: 'Invalid prettifier request payload',
    });

    return prettifierService.run(safeRequest, {
      onFallbackProgress: (line) => {
        event.sender.send(IPCChannels.prettifierProgress, {
          requestId: safeRequest.requestId,
          line,
        });
      },
    });
  });

  ipcMain.handle(IPCChannels.prettifierCancel, async (_event, request: unknown) => {
    const safeRequest = expectPayload(request, isPrettifyCancelRequest, {
      logger,
      channel: IPCChannels.prettifierCancel,
      message: 'Invalid prettifier cancel payload',
    });

    return prettifierService.cancel(safeRequest.requestId);
  });

  ipcMain.handle(IPCChannels.telemetryLogEvent, async (_event, event: unknown) => {
    const safeEvent = expectPayload(event, isTelemetryEvent, {
      logger,
      channel: IPCChannels.telemetryLogEvent,
      message: 'Invalid telemetry event payload',
    });

    logger.info(safeEvent.name, safeEvent.meta);
  });
};
