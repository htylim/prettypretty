import { afterEach, describe, expect, it } from 'vitest';
import { hasPrimaryModifier, isMacPlatform } from '../../../../src/renderer/app/primaryModifier';

const setNavigatorPlatform = (platform: string): void => {
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: platform,
  });
};

const originalPlatform = window.navigator.platform;

describe('primaryModifier', () => {
  afterEach(() => {
    setNavigatorPlatform(originalPlatform);
  });

  it('treats Meta as the primary modifier on macOS', () => {
    setNavigatorPlatform('MacIntel');

    expect(isMacPlatform()).toBe(true);
    expect(hasPrimaryModifier({ altKey: false, ctrlKey: false, metaKey: true })).toBe(true);
    expect(hasPrimaryModifier({ altKey: false, ctrlKey: true, metaKey: false })).toBe(false);
  });

  it('treats Ctrl as the primary modifier on Windows/Linux', () => {
    setNavigatorPlatform('Win32');

    expect(isMacPlatform()).toBe(false);
    expect(hasPrimaryModifier({ altKey: false, ctrlKey: true, metaKey: false })).toBe(true);
    expect(hasPrimaryModifier({ altKey: false, ctrlKey: false, metaKey: true })).toBe(false);
  });

  it('rejects alt-modified combinations on every platform', () => {
    setNavigatorPlatform('MacIntel');
    expect(hasPrimaryModifier({ altKey: true, ctrlKey: false, metaKey: true })).toBe(false);

    setNavigatorPlatform('Linux x86_64');
    expect(hasPrimaryModifier({ altKey: true, ctrlKey: true, metaKey: false })).toBe(false);
  });
});
