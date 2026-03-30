// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  E2E_WINDOW_MODE_FLAG_PREFIX,
  resolveE2EWindowMode,
  shouldShowWindow,
} from '../../../src/main/e2eWindowMode';

describe('resolveE2EWindowMode', () => {
  it('defaults to visible when no E2E window-mode flag is present', () => {
    expect(resolveE2EWindowMode(['electron', 'app'])).toBe('visible');
  });

  it('parses hidden mode from the runtime flag', () => {
    expect(resolveE2EWindowMode(['electron', 'app', `${E2E_WINDOW_MODE_FLAG_PREFIX}hidden`])).toBe(
      'hidden',
    );
  });

  it('ignores invalid window-mode values', () => {
    expect(
      resolveE2EWindowMode(['electron', 'app', `${E2E_WINDOW_MODE_FLAG_PREFIX}sideways`]),
    ).toBe('visible');
  });
});

describe('shouldShowWindow', () => {
  it('reports visibility from the resolved E2E window mode', () => {
    expect(shouldShowWindow('visible')).toBe(true);
    expect(shouldShowWindow('hidden')).toBe(false);
  });
});
