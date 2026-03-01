// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPCChannels } from '../../../../src/shared/ipc-contracts';
import type { Preferences } from '../../../../src/shared/preferences';
import { createDefaultPreferences } from '../../../../src/main/preferences/preferencesDefaults';
import { registerIpcHandlers } from '../../../../src/main/ipc';

const { handleMock, writeTextMock, showOpenDialogMock, showSaveDialogMock } = vi.hoisted(() => {
  return {
    handleMock: vi.fn(),
    writeTextMock: vi.fn(),
    showOpenDialogMock: vi.fn(),
    showSaveDialogMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
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
  const preferences: Preferences = { ...defaults, themeMode: 'dark', indentSize: 4 };
  const preferencesService = {
    getAll: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  };
  const prettifierService = {
    run: vi.fn(),
  };
  const logStore = {
    getSnapshot: vi.fn().mockReturnValue(['{"event":"app.bootstrap.start"}']),
  };
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
    logStore.getSnapshot.mockClear();
    logger.isVerboseEnabled.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
    writeTextMock.mockReset();
    showOpenDialogMock.mockReset();
    showSaveDialogMock.mockReset();

    registerIpcHandlers({ preferencesService, prettifierService, logger, logStore });
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
    const result = await updateHandler({}, { themeMode: 'dark', indentSize: 6 });

    expect(preferencesService.update).toHaveBeenCalledWith({ themeMode: 'dark', indentSize: 6 });
    expect(result).toEqual(preferences);
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
