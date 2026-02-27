// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../../../src/main/logging/logger';

describe('createLogger', () => {
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const onLineMock = vi.fn();

  afterEach(() => {
    writeSpy.mockReset();
    onLineMock.mockReset();
  });

  it('does not write logs when verbose mode is disabled and still emits session line', () => {
    const logger = createLogger({ verbose: false, onLine: onLineMock });

    logger.info('prettifier.run.requested', { inputLength: 12 });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(onLineMock).toHaveBeenCalledTimes(1);
    const emitted = onLineMock.mock.calls[0]?.[0];
    expect(typeof emitted).toBe('string');
  });

  it('writes JSON lines when verbose mode is enabled', () => {
    const logger = createLogger({ verbose: true, onLine: onLineMock });

    logger.info('prettifier.run.requested', { inputLength: 12, trigger: 'switch-output' });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(onLineMock).toHaveBeenCalledTimes(1);
    const line = writeSpy.mock.calls[0]?.[0];
    expect(typeof line).toBe('string');
    const parsed = JSON.parse(String(line).trim()) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.event).toBe('prettifier.run.requested');
    expect(parsed.meta).toEqual({ inputLength: 12, trigger: 'switch-output' });
  });

  it('redacts sensitive fields', () => {
    const logger = createLogger({ verbose: true });

    logger.info('prettifier.fallback.start', { prompt: 'secret prompt', inputLength: 11 });

    const line = writeSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(String(line).trim()) as { meta: Record<string, unknown> };
    expect(parsed.meta.prompt).toBe('[redacted:13]');
    expect(parsed.meta.inputLength).toBe(11);
  });
});
