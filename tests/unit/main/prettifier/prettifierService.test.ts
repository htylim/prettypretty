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
  it('returns local result and does not call fallback executor when local parsing succeeds', async () => {
    const preferencesService = {
      getAll: vi.fn().mockResolvedValue(createDefaultPreferences()),
    };
    const fallbackExecutor = {
      execute: vi.fn(),
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      inputText: '{"a":1}',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'applied-local',
      fallbackStatus: 'not-attempted',
      localDetection: 'json',
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
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'passthrough-no-fallback',
      fallbackStatus: 'skipped-no-fallback',
      outputText: '{bad',
      localDetection: 'malformed',
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
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
      inputText: '{bad',
      indentSize: 2,
      trigger: 'switch-output',
    });

    expect(response).toMatchObject({
      status: 'passthrough-no-fallback',
      fallbackStatus: 'skipped-invalid-agent',
      outputText: '{bad',
      localDetection: 'malformed',
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
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
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
    };
    const logger = createLogger();
    const service = createPrettifierService({
      preferencesService,
      logger,
      fallbackExecutor,
    });

    const response = await service.run({
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
});
