// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const existsSyncMock = vi.fn<(path: string) => boolean>();
const homedirMock = vi.fn(() => '/Users/tester');

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('node:os', () => ({
  homedir: homedirMock,
}));

describe('resolvePreferredAgentExecutable', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    existsSyncMock.mockReset();
    homedirMock.mockReset();
    homedirMock.mockReturnValue('/Users/tester');
  });

  it('keeps explicit executable paths unchanged', async () => {
    const module = await import('../../../../src/main/preferences/agentExecutablePaths');

    const resolved = module.resolvePreferredAgentExecutable({
      agentId: 'amp',
      executable: '/custom/bin/amp',
    });

    expect(resolved).toBe('/custom/bin/amp');
  });

  it('keeps bare executable commands on non-darwin platforms', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    existsSyncMock.mockReturnValue(true);
    const module = await import('../../../../src/main/preferences/agentExecutablePaths');

    const resolved = module.resolvePreferredAgentExecutable({
      agentId: 'amp',
      executable: 'amp',
    });

    expect(resolved).toBe('amp');
  });

  it('resolves codex to the app executable when present on darwin', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const module = await import('../../../../src/main/preferences/agentExecutablePaths');
    existsSyncMock.mockImplementation((path) => path === module.CODEX_APP_EXECUTABLE_PATH);

    const resolved = module.resolvePreferredAgentExecutable({
      agentId: 'codex',
      executable: 'codex',
    });

    expect(resolved).toBe(module.CODEX_APP_EXECUTABLE_PATH);
  });

  it('resolves amp to the first existing darwin candidate path', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const module = await import('../../../../src/main/preferences/agentExecutablePaths');
    existsSyncMock.mockImplementation((path) => path === module.AMP_LOCAL_BIN_EXECUTABLE_PATH);

    const resolved = module.resolvePreferredAgentExecutable({
      agentId: 'amp',
      executable: 'amp',
    });

    expect(resolved).toBe(module.AMP_LOCAL_BIN_EXECUTABLE_PATH);
  });

  it('keeps amp as a bare command when no darwin candidate exists', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    existsSyncMock.mockReturnValue(false);
    const module = await import('../../../../src/main/preferences/agentExecutablePaths');

    const resolved = module.resolvePreferredAgentExecutable({
      agentId: 'amp',
      executable: 'amp',
    });

    expect(resolved).toBe('amp');
  });
});
