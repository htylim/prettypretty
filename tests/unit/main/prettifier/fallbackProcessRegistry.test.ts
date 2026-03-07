// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { createFallbackProcessRegistry } from '../../../../src/main/prettifier/fallbackProcessRegistry';

type KillableProcessDouble = {
  pid?: number;
  kill: (signal?: NodeJS.Signals) => void;
  killMock: ReturnType<typeof vi.fn<(signal?: NodeJS.Signals) => void>>;
};

const createChild = (pid?: number): KillableProcessDouble => {
  const killMock = vi.fn<(signal?: NodeJS.Signals) => void>();

  return {
    ...(typeof pid === 'number' ? { pid } : {}),
    kill: killMock,
    killMock,
  };
};

describe('fallbackProcessRegistry', () => {
  it('kills only currently tracked children', () => {
    const killProcess = vi.fn();
    const registry = createFallbackProcessRegistry({
      platform: 'darwin',
      killProcess,
    });
    const activeChild = createChild(2001);
    const removedChild = createChild(2002);
    const unregisterRemovedChild = registry.track(removedChild);

    registry.track(activeChild);
    unregisterRemovedChild();

    expect(registry.terminateAll()).toBe(1);
    expect(killProcess).toHaveBeenCalledWith(-2001, 'SIGKILL');
    expect(killProcess).not.toHaveBeenCalledWith(-2002, 'SIGKILL');
    expect(registry.terminateAll()).toBe(0);
  });

  it('falls back to direct child kill when process group kill fails', () => {
    const child = createChild(2003);
    const registry = createFallbackProcessRegistry({
      platform: 'darwin',
      killProcess: vi.fn(() => {
        throw new Error('no process group');
      }),
    });

    registry.track(child);
    registry.terminateAll();

    expect(child.killMock).toHaveBeenCalledWith('SIGKILL');
  });

  it('uses taskkill for process-tree termination on windows', () => {
    const spawn = vi.fn();
    const registry = createFallbackProcessRegistry({
      platform: 'win32',
      spawn,
    });

    registry.track(createChild(3001));
    registry.terminateAll();

    expect(spawn).toHaveBeenCalledWith('taskkill', ['/pid', '3001', '/T', '/F'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
  });

  it('kills the direct child when no pid is available', () => {
    const child = createChild();
    const registry = createFallbackProcessRegistry({
      platform: 'darwin',
      killProcess: vi.fn(),
    });

    registry.track(child);
    registry.terminateAll();

    expect(child.killMock).toHaveBeenCalledWith('SIGKILL');
  });
});
