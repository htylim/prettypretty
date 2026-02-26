// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../src/main/logging/logger';

describe('createLogger', () => {
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  afterEach(() => {
    writeSpy.mockReset();
  });

  it('does not write logs when verbose mode is disabled', () => {
    const logger = createLogger(false);

    logger.info('prettifier.run.requested', { inputLength: 12 });

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes JSON lines when verbose mode is enabled', () => {
    const logger = createLogger(true);

    logger.info('prettifier.run.requested', { inputLength: 12, trigger: 'switch-output' });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const line = writeSpy.mock.calls[0]?.[0];
    expect(typeof line).toBe('string');
    const parsed = JSON.parse(String(line).trim()) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.event).toBe('prettifier.run.requested');
    expect(parsed.meta).toEqual({ inputLength: 12, trigger: 'switch-output' });
  });

  it('redacts sensitive fields', () => {
    const logger = createLogger(true);

    logger.info('prettifier.fallback.start', { prompt: 'secret prompt', inputLength: 11 });

    const line = writeSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(String(line).trim()) as { meta: Record<string, unknown> };
    expect(parsed.meta.prompt).toBe('[redacted:13]');
    expect(parsed.meta.inputLength).toBe(11);
  });
});
