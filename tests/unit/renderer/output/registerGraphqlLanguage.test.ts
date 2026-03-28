import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMonacoMock = () => ({
  languages: {
    register: vi.fn(),
    setLanguageConfiguration: vi.fn(),
    setMonarchTokensProvider: vi.fn(),
  },
});

describe('registerGraphqlLanguage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registers the graphql language exactly once', async () => {
    const monaco = createMonacoMock();
    const { registerGraphqlLanguage: registerAgain } =
      await import('../../../../src/renderer/output/registerGraphqlLanguage');

    registerAgain(monaco as never);
    registerAgain(monaco as never);

    expect(monaco.languages.register).toHaveBeenCalledTimes(1);
    expect(monaco.languages.register).toHaveBeenCalledWith({ id: 'graphql' });
    expect(monaco.languages.setLanguageConfiguration).toHaveBeenCalledTimes(1);
    expect(monaco.languages.setLanguageConfiguration).toHaveBeenCalledWith(
      'graphql',
      expect.objectContaining({
        comments: { lineComment: '#' },
      }),
    );
    expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledTimes(1);
    expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
      'graphql',
      expect.objectContaining({
        tokenizer: expect.any(Object),
      }),
    );
  });
});
