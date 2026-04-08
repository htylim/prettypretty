// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createDefaultPreferences } from '../../../../src/main/preferences/preferencesDefaults';
import { createPrettifierService } from '../../../../src/main/prettifier/prettifierService';

const createLogger = () => ({
  isVerboseEnabled: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe('prettifierService', () => {
  it('treats plain text as applied-local and skips fallback execution', async () => {
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue(createDefaultPreferences()),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: 'hello world',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-local',
      fallbackStatus: 'not-attempted',
      outputText: 'hello world',
      localResult: {
        kind: 'applied',
        family: 'text',
        mode: 'passthrough',
        variant: 'text',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('returns local result and does not call fallback executor when local parsing succeeds', async () => {
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue(createDefaultPreferences()),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{"a":1}',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-local',
      fallbackStatus: 'not-attempted',
      localResult: {
        kind: 'applied',
        family: 'json-like',
        mode: 'canonical',
        variant: 'json',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('treats supported malformed json as an applied local result', async () => {
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue(createDefaultPreferences()),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{"a":1,"b"',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-local',
      fallbackStatus: 'not-attempted',
      outputText: '{\n  "a": 1,\n  "b"',
      localResult: {
        kind: 'applied',
        family: 'json-like',
        mode: 'token-preserving',
        variant: 'json-like-token-preserving',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('treats newline-delimited JSON as a local format', async () => {
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue(createDefaultPreferences()),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{"a":1}\n{"b":2}',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-local',
      fallbackStatus: 'not-attempted',
      outputText: '{\n  "a": 1\n}\n{\n  "b": 2\n}',
      localResult: {
        kind: 'applied',
        family: 'json-like',
        mode: 'canonical',
        variant: 'ndjson',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('treats graphql documents as a local format', async () => {
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue(createDefaultPreferences()),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: 'type Shipment{id:ID! request_id:String}',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-local',
      fallbackStatus: 'not-attempted',
      outputText: 'type Shipment {\n  id: ID!\n  request_id: String\n}',
      localResult: {
        kind: 'applied',
        family: 'graphql',
        mode: 'canonical',
        variant: 'graphql',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('returns passthrough-no-fallback when local parsing fails and fallback is not configured', async () => {
    const preferences = createDefaultPreferences();
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue({ ...preferences, fallbackAgentId: null }),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'passthrough-no-fallback',
      fallbackStatus: 'skipped-no-fallback',
      outputText: '{bad',
      localResult: {
        kind: 'failed',
        family: 'json-like',
        reason: 'malformed',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('returns passthrough-no-fallback when fallback agent is missing', async () => {
    const preferences = createDefaultPreferences();
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue({ ...preferences, fallbackAgentId: 'missing' }),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'passthrough-no-fallback',
      fallbackStatus: 'skipped-invalid-agent',
      outputText: '{bad',
      localResult: {
        kind: 'failed',
        family: 'json-like',
        reason: 'malformed',
      },
    });
    expect(fallbackExecutor.execute).not.toHaveBeenCalled();
  });

  it('returns fallback output when fallback execution succeeds', async () => {
    const preferences = createDefaultPreferences();
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue({
        ...preferences,
        fallbackAgentId: 'codex',
      }),
    };
    const fallbackExecutor = {
      execute: vi.fn().mockResolvedValue({
        status: 'applied',
        outputText: '{\n  "a": 1\n}',
        exitCode: 0,
        stderrLength: 0,
        durationMs: 25,
      }),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-fallback',
      fallbackStatus: 'applied',
      outputText: '{\n  "a": 1\n}',
      agentId: 'codex',
    });
    expect(fallbackExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it('uses a one-shot fallback override when provided', async () => {
    const preferences = createDefaultPreferences();
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue({
        ...preferences,
        fallbackAgentId: null,
      }),
    };
    const fallbackExecutor = {
      execute: vi.fn().mockResolvedValue({
        status: 'applied',
        outputText: '{\n  "agent": "amp"\n}',
        exitCode: 0,
        stderrLength: 0,
        durationMs: 25,
      }),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
      fallbackAgentIdOverride: 'amp',
    });

    expect(response).toMatchObject({
      status: 'applied-fallback',
      fallbackStatus: 'applied',
      outputText: '{\n  "agent": "amp"\n}',
      agentId: 'amp',
    });
    expect(fallbackExecutor.execute).toHaveBeenCalledTimes(1);
  });

  it('forwards fallback progress callback to executor', async () => {
    const preferences = createDefaultPreferences();
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue({
        ...preferences,
        fallbackAgentId: 'codex',
      }),
    };
    const fallbackExecutor = {
      execute: vi
        .fn()
        .mockImplementation(async (input: { onProgressLine?: (line: string) => void }) => {
          input.onProgressLine?.('thinking...');
          return {
            status: 'applied',
            outputText: '{\n  "a": 1\n}',
            exitCode: 0,
            stderrLength: 0,
            durationMs: 25,
          };
        }),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });
    const onFallbackProgress = vi.fn();

    await service.run(
      {
        requestId: 1,
        inputText: '{bad',
        indentSize: 2,
        trigger: 'switch-output',
      },
      { onFallbackProgress },
    );

    expect(onFallbackProgress).toHaveBeenCalledWith('thinking...');
  });

  it('returns passthrough-fallback-failed when fallback execution fails', async () => {
    const preferences = createDefaultPreferences();
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue({
        ...preferences,
        fallbackAgentId: 'codex',
      }),
    };
    const fallbackExecutor = {
      execute: vi.fn().mockResolvedValue({
        status: 'failed-timeout',
        outputText: null,
        exitCode: null,
        stderrLength: 0,
        durationMs: 30_000,
      }),
      cancel: vi.fn().mockReturnValue(false),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      requestId: 1,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'passthrough-fallback-failed',
      fallbackStatus: 'failed-timeout',
      outputText: '{bad',
      agentId: 'codex',
    });
  });

  it('forwards request-scoped cancellation to the fallback executor', () => {
    const fallbackExecutor = {
      execute: vi.fn(),
      cancel: vi.fn().mockReturnValue(true),
    };
    const service = createPrettifierService({
      preferencesService: { getAll: vi.fn().mockResolvedValue(createDefaultPreferences()) },
      logger: createLogger(),
      fallbackExecutor,
    });

    expect(service.cancel(9)).toBe(true);
    expect(fallbackExecutor.cancel).toHaveBeenCalledWith(9);
  });
});
