// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { VISIBLE_WINDOW_TAG, resolveWindowModeForTitlePath } from '../../e2e/support/electronApp';

describe('resolveWindowModeForTitlePath', () => {
  it('defaults to hidden when no override or visible-window tag is present', () => {
    expect(resolveWindowModeForTitlePath(['window-lifecycle.spec.ts', 'opens a window'])).toBe(
      'hidden',
    );
  });

  it('selects visible mode when the leaf test title carries the visible-window tag', () => {
    expect(
      resolveWindowModeForTitlePath([
        'window-lifecycle.spec.ts',
        `opens a window ${VISIBLE_WINDOW_TAG}`,
      ]),
    ).toBe('visible');
  });

  it('selects visible mode when a parent suite carries the visible-window tag', () => {
    expect(
      resolveWindowModeForTitlePath([
        'window-lifecycle.spec.ts',
        `window shortcuts ${VISIBLE_WINDOW_TAG}`,
        'opens a window',
      ]),
    ).toBe('visible');
  });

  it('honors an explicit forced mode before inspecting tags', () => {
    expect(
      resolveWindowModeForTitlePath(
        ['window-lifecycle.spec.ts', `opens a window ${VISIBLE_WINDOW_TAG}`],
        'hidden',
      ),
    ).toBe('hidden');
    expect(
      resolveWindowModeForTitlePath(['window-lifecycle.spec.ts', 'opens a window'], 'visible'),
    ).toBe('visible');
  });

  it('ignores invalid forced mode values and falls back to title-path tags', () => {
    expect(
      resolveWindowModeForTitlePath(
        ['window-lifecycle.spec.ts', `opens a window ${VISIBLE_WINDOW_TAG}`],
        'sideways',
      ),
    ).toBe('visible');
  });
});
