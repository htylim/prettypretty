import { describe, expect, it, vi } from 'vitest';
import { reportRendererError } from '../../../../src/renderer/app/reportRendererError';

describe('reportRendererError', () => {
  it('logs error payloads through console.error with context message', () => {
    const error = new Error('boom');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      reportRendererError('renderer.test.failed', error);
      expect(consoleErrorSpy).toHaveBeenCalledWith('renderer.test.failed', error);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
