// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPCChannels } from '../../../../src/shared/ipc-contracts';
import type { Preferences } from '../../../../src/shared/preferences';
import { registerIpcHandlers } from '../../../../src/main/ipc';

const { handleMock } = vi.hoisted(() => {
  return {
    handleMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
    app: {
      getName: vi.fn().mockReturnValue('prettypretty'),
      getVersion: vi.fn().mockReturnValue('0.1.0'),
    },
    clipboard: {
      writeText: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
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
  const preferences: Preferences = { version: 1, themeMode: 'dark' };
  const preferencesService = {
    getAll: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  };

  beforeEach(() => {
    handleMock.mockReset();
    preferencesService.getAll.mockReset().mockResolvedValue(preferences);
    preferencesService.update.mockReset().mockResolvedValue(preferences);
    preferencesService.reset.mockReset().mockResolvedValue({ version: 1, themeMode: 'light' });

    registerIpcHandlers({ preferencesService });
  });

  it('registers preferences handlers', () => {
    const channels = handleMock.mock.calls.map(([channel]) => channel);

    expect(channels).toContain(IPCChannels.preferencesGetAll);
    expect(channels).toContain(IPCChannels.preferencesUpdate);
    expect(channels).toContain(IPCChannels.preferencesReset);
  });

  it('forwards valid preferences update payloads to service', async () => {
    const updateHandler = getRegisteredHandler(IPCChannels.preferencesUpdate);
    const result = await updateHandler({}, { themeMode: 'dark' });

    expect(preferencesService.update).toHaveBeenCalledWith({ themeMode: 'dark' });
    expect(result).toEqual(preferences);
  });

  it('rejects invalid preferences payloads', async () => {
    const updateHandler = getRegisteredHandler(IPCChannels.preferencesUpdate);

    await expect(updateHandler({}, { invalid: true })).rejects.toThrow(
      'Invalid preferences patch payload',
    );
    expect(preferencesService.update).not.toHaveBeenCalled();
  });
});
