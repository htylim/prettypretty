// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPCChannels } from '../../../../src/shared/ipc-contracts';
import type { Preferences } from '../../../../src/shared/preferences';
import { createDefaultPreferences } from '../../../../src/main/preferences/preferencesDefaults';
import { registerIpcHandlers } from '../../../../src/main/ipc';

const {
  handleMock,
  fromWebContentsMock,
  parentWindow,
  readFileMock,
  writeFileMock,
  writeTextMock,
  showOpenDialogMock,
  showSaveDialogMock,
} = vi.hoisted(() => {
  return {
    handleMock: vi.fn(),
    fromWebContentsMock: vi.fn(),
    parentWindow: { id: 99 },
    readFileMock: vi.fn(),
    writeFileMock: vi.fn(),
    writeTextMock: vi.fn(),
    showOpenDialogMock: vi.fn(),
    showSaveDialogMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
    BrowserWindow: {
      fromWebContents: fromWebContentsMock,
    },
    app: {
      getName: vi.fn().mockReturnValue('prettypretty'),
      getVersion: vi.fn().mockReturnValue('0.1.0'),
    },
    clipboard: {
      writeText: writeTextMock,
    },
    dialog: {
      showOpenDialog: showOpenDialogMock,
      showSaveDialog: showSaveDialogMock,
    },
    ipcMain: {
      handle: handleMock,
    },
  };
});

vi.mock('node:fs/promises', () => {
  return {
    readFile: readFileMock,
    writeFile: writeFileMock,
  };
});

const getRegisteredHandler = (channel: string): ((...args: unknown[]) => unknown) => {
  const call = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
  if (!call) {
    throw new Error(`Missing handler for channel ${channel}`);
  }

  const handler = call[1];
  if (typeof handler !== 'function') {
    throw new TypeError(`Expected function handler for channel ${channel}`);
  }

  return handler;
};

describe('registerIpcHandlers preferences channels', () => {
  const defaults = createDefaultPreferences();
  const preferences: Preferences = {
    ...defaults,
    themeMode: 'dark',
    indentSize: 4,
    fallbackWarningLineThreshold: 350,
  };
  const preferencesService = {
    getAll: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  };
  const prettifierService = {
    run: vi.fn(),
    cancel: vi.fn(),
  };
  const logStore = {
    getSnapshot: vi.fn().mockReturnValue(['{"event":"app.bootstrap.start"}']),
  };
  const onOpenWindow = vi.fn().mockResolvedValue(undefined);
  const logger = {
    isVerboseEnabled: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    handleMock.mockReset();
    preferencesService.getAll.mockReset().mockResolvedValue(preferences);
    preferencesService.update.mockReset().mockResolvedValue(preferences);
    preferencesService.reset.mockReset().mockResolvedValue(defaults);
    prettifierService.run.mockReset();
    prettifierService.cancel.mockReset();
    logStore.getSnapshot.mockClear();
    logger.isVerboseEnabled.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    writeTextMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    showOpenDialogMock.mockReset();
    showSaveDialogMock.mockReset();
    fromWebContentsMock.mockReset().mockReturnValue(parentWindow);

    registerIpcHandlers({ preferencesService, prettifierService, logger, logStore, onOpenWindow });
  });

  it('registers preferences handlers', () => {
    const channels = handleMock.mock.calls.map(([channel]) => channel);

    expect(channels).toContain(IPCChannels.preferencesGetAll);
    expect(channels).toContain(IPCChannels.preferencesUpdate);
    expect(channels).toContain(IPCChannels.preferencesReset);
    expect(channels).toContain(IPCChannels.logsGetHistory);
  });

  it('forwards valid preferences update payloads to service', async () => {
    const updateHandler = getRegisteredHandler(IPCChannels.preferencesUpdate);
    const result = await updateHandler(
      {},
      {
        themeMode: 'dark',
        indentSize: 6,
        fallbackWarningLineThreshold: 410,
      },
    );

    expect(preferencesService.update).toHaveBeenCalledWith({
      themeMode: 'dark',
      indentSize: 6,
      fallbackWarningLineThreshold: 410,
    });
    expect(result).toEqual(preferences);
  });

  it('returns opened file content on valid open dialog selection', async () => {
    const openFileHandler = getRegisteredHandler(IPCChannels.dialogOpenFile);
    showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/sample.json'],
    });
    readFileMock.mockResolvedValue('{"a":1}');

    const result = await openFileHandler({});

    expect(showOpenDialogMock).toHaveBeenCalledTimes(1);
    expect(showOpenDialogMock).toHaveBeenCalledWith(
      parentWindow,
      expect.objectContaining({ title: 'Open file' }),
    );
    expect(readFileMock).toHaveBeenCalledWith('/tmp/sample.json', 'utf8');
    expect(result).toEqual({ path: '/tmp/sample.json', content: '{"a":1}' });
    expect(logger.info).toHaveBeenCalledWith('ingest.open-file', {
      fileExtension: '.json',
      contentLength: 7,
      isEmpty: false,
    });
  });

  it('returns null when open dialog is canceled', async () => {
    const openFileHandler = getRegisteredHandler(IPCChannels.dialogOpenFile);
    showOpenDialogMock.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });

    const result = await openFileHandler({});

    expect(result).toBeNull();
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('writes file and returns path on successful save', async () => {
    const fileSaveHandler = getRegisteredHandler(IPCChannels.fileSave);
    showSaveDialogMock.mockResolvedValue({
      canceled: false,
      filePath: '/tmp/prettified.json',
    });

    const result = await fileSaveHandler({}, '{"saved":true}');

    expect(showSaveDialogMock).toHaveBeenCalledTimes(1);
    expect(showSaveDialogMock).toHaveBeenCalledWith(
      parentWindow,
      expect.objectContaining({ title: 'Save prettified text' }),
    );
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/prettified.json', '{"saved":true}', 'utf8');
    expect(result).toEqual({ path: '/tmp/prettified.json' });
  });

  it('returns null when save dialog is canceled', async () => {
    const fileSaveHandler = getRegisteredHandler(IPCChannels.fileSave);
    showSaveDialogMock.mockResolvedValue({
      canceled: true,
      filePath: null,
    });

    const result = await fileSaveHandler({}, '{"saved":true}');

    expect(result).toBeNull();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('rejects invalid preferences payloads', async () => {
    const updateHandler = getRegisteredHandler(IPCChannels.preferencesUpdate);

    await expect(updateHandler({}, { invalid: true })).rejects.toThrow(
      'Invalid preferences patch payload',
    );
    expect(preferencesService.update).not.toHaveBeenCalled();
  });

  it('rejects invalid file save payloads', async () => {
    const fileSaveHandler = getRegisteredHandler(IPCChannels.fileSave);

    await expect(fileSaveHandler({}, { bad: true })).rejects.toThrow('Invalid file save payload');
    expect(showSaveDialogMock).not.toHaveBeenCalled();
  });

  it('rejects invalid clipboard payloads', async () => {
    const clipboardHandler = getRegisteredHandler(IPCChannels.clipboardCopy);

    expect(() => clipboardHandler({}, { bad: true })).toThrow('Invalid clipboard payload');
    expect(writeTextMock).not.toHaveBeenCalled();
  });
});
