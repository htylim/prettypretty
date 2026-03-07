// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../../../../src/main/ipc';
import { IPCChannels } from '../../../../src/shared/ipc-contracts';

const { handleMock, parentWindow } = vi.hoisted(() => {
  return {
    handleMock: vi.fn(),
    parentWindow: { id: 1 },
  };
});

vi.mock('electron', () => {
  return {
    BrowserWindow: {
      fromWebContents: vi.fn().mockReturnValue(parentWindow),
    },
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
    logStore.getSnapshot.mockClear();
    logger.isVerboseEnabled.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();

    registerIpcHandlers({
      preferencesService,
      prettifierService,
      logger,
      logStore,
      onOpenWindow,
    });
  });

  it('registers prettifier and telemetry handlers', () => {
    const channels = handleMock.mock.calls.map(([channel]) => channel);

    expect(channels).toContain(IPCChannels.prettifierRun);
    expect(channels).toContain(IPCChannels.telemetryLogEvent);
    expect(channels).toContain(IPCChannels.logsGetHistory);
    expect(channels).toContain(IPCChannels.appOpenWindow);
  });

  it('opens a new window through the app IPC channel', async () => {
    const openWindowHandler = getRegisteredHandler(IPCChannels.appOpenWindow);

    await openWindowHandler({});

    expect(onOpenWindow).toHaveBeenCalledTimes(1);
  });

  it('returns session log history', async () => {
    const logsHandler = getRegisteredHandler(IPCChannels.logsGetHistory);

    const result = await logsHandler({});

    expect(logStore.getSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['{"event":"app.bootstrap.start"}']);
  });

  it('forwards valid prettifier requests to service', async () => {
    const runHandler = getRegisteredHandler(IPCChannels.prettifierRun);
    const request = {
      requestId: 1,
      inputText: '{"a":1}',
      indentSize: 2,
      trigger: 'switch-output',
    };
    const sender = { send: vi.fn() };

    const result = await runHandler({ sender }, request);

    expect(prettifierService.run).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ onFallbackProgress: expect.any(Function) }),
    );
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

    await expect(
      runHandler({ sender: { send: vi.fn() } }, { trigger: 'switch-output' }),
    ).rejects.toThrow('Invalid prettifier request payload');
    await expect(
      runHandler(
        { sender: { send: vi.fn() } },
        {
          requestId: 1,
          inputText: '{bad',
          indentSize: 2,
          trigger: 'switch-output',
          fallbackAgentIdOverride: 42,
        },
      ),
    ).rejects.toThrow('Invalid prettifier request payload');
    expect(prettifierService.run).not.toHaveBeenCalled();
  });

  it('streams prettifier progress events over IPC for the active request', async () => {
    const runHandler = getRegisteredHandler(IPCChannels.prettifierRun);
    const request = {
      requestId: 9,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    };
    const sender = { send: vi.fn() };

    prettifierService.run.mockImplementationOnce(
      async (
        _request: unknown,
        options?: {
          onFallbackProgress?: (line: string) => void;
        },
      ) => {
        options?.onFallbackProgress?.('thinking step');
        return {
          status: 'applied-fallback',
          outputText: '{\n  "ok": true\n}',
          localDetection: 'malformed',
          fallbackStatus: 'applied',
          agentId: 'codex',
          durationMs: 12,
        };
      },
    );

    await runHandler({ sender }, request);

    expect(sender.send).toHaveBeenCalledWith(IPCChannels.prettifierProgress, {
      requestId: 9,
      line: 'thinking step',
    });
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
