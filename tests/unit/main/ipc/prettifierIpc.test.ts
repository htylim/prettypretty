// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../../../../src/main/ipc';
import { IPCChannels } from '../../../../src/shared/ipc-contracts';

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

describe('registerIpcHandlers prettifier channels', () => {
  const preferencesService = {
    getAll: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  };
  const prettifierService = {
    run: vi.fn(),
  };
  const logger = {
    isVerboseEnabled: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    handleMock.mockReset();
    preferencesService.getAll.mockReset();
    preferencesService.update.mockReset();
    preferencesService.reset.mockReset();
    prettifierService.run.mockReset().mockResolvedValue({
      status: 'applied-local',
      outputText: '{\n  "a": 1\n}',
      localDetection: 'json',
      fallbackStatus: 'not-attempted',
      agentId: null,
      durationMs: 5,
    });
    logger.isVerboseEnabled.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();

    registerIpcHandlers({
      preferencesService,
      prettifierService,
      logger,
    });
  });

  it('registers prettifier and telemetry handlers', () => {
    const channels = handleMock.mock.calls.map(([channel]) => channel);

    expect(channels).toContain(IPCChannels.prettifierRun);
    expect(channels).toContain(IPCChannels.telemetryLogEvent);
  });

  it('forwards valid prettifier requests to service', async () => {
    const runHandler = getRegisteredHandler(IPCChannels.prettifierRun);
    const request = {
      inputText: '{"a":1}',
      indentSize: 2,
      trigger: 'switch-output',
    };

    const result = await runHandler({}, request);

    expect(prettifierService.run).toHaveBeenCalledWith(request);
    expect(result).toEqual({
      status: 'applied-local',
      outputText: '{\n  "a": 1\n}',
      localDetection: 'json',
      fallbackStatus: 'not-attempted',
      agentId: null,
      durationMs: 5,
    });
  });

  it('rejects invalid prettifier payloads', async () => {
    const runHandler = getRegisteredHandler(IPCChannels.prettifierRun);

    await expect(runHandler({}, { trigger: 'switch-output' })).rejects.toThrow(
      'Invalid prettifier request payload',
    );
    expect(prettifierService.run).not.toHaveBeenCalled();
  });

  it('logs valid telemetry events', async () => {
    const telemetryHandler = getRegisteredHandler(IPCChannels.telemetryLogEvent);

    await telemetryHandler({}, { name: 'renderer.ingest.drop', meta: { inputLength: 42 } });

    expect(logger.info).toHaveBeenCalledWith('renderer.ingest.drop', { inputLength: 42 });
  });

  it('rejects invalid telemetry payloads', async () => {
    const telemetryHandler = getRegisteredHandler(IPCChannels.telemetryLogEvent);

    await expect(telemetryHandler({}, { name: 'bad.event', meta: {} })).rejects.toThrow(
      'Invalid telemetry event payload',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
