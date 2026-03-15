import { describe, expect, it } from 'vitest';
import { getWindowApi } from '../../../../src/renderer/app/windowApi';

describe('getWindowApi', () => {
  it('returns the preload bridge when present', () => {
    const bridge = {
      app: {
        getInfo: async () => ({ name: 'prettypretty', version: '0.1.0' }),
      },
    };

    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: bridge,
    });

    expect(getWindowApi()).toBe(bridge);
  });

  it('returns null when the preload bridge is unavailable', () => {
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: undefined,
    });

    expect(getWindowApi()).toBeNull();
  });
});
