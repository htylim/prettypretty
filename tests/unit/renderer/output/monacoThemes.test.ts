import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('monacoThemes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers both themes once', async () => {
    const { PRETTYPRETTY_DARK_THEME, PRETTYPRETTY_LIGHT_THEME, registerMonacoThemes } =
      await import('../../../../src/renderer/output/monacoThemes');

    const defineTheme = vi.fn();
    const monaco = {
      editor: {
        defineTheme,
      },
    } as unknown as typeof import('monaco-editor');

    registerMonacoThemes(monaco);
    registerMonacoThemes(monaco);

    expect(defineTheme).toHaveBeenCalledTimes(2);
    expect(defineTheme.mock.calls[0]?.[0]).toBe(PRETTYPRETTY_LIGHT_THEME);
    expect(defineTheme.mock.calls[1]?.[0]).toBe(PRETTYPRETTY_DARK_THEME);
  });
});
