import { spawn as spawnProcess } from 'node:child_process';

type KillableProcess = {
  pid?: number;
  kill: (signal?: NodeJS.Signals) => void;
};

type ProcessRegistryDependencies = {
  platform?: NodeJS.Platform;
  killProcess?: (pid: number, signal?: NodeJS.Signals | number) => void;
  spawn?: (
    command: string,
    args: string[],
    options: { shell: false; stdio: 'ignore'; windowsHide: true },
  ) => unknown;
};

export type FallbackProcessRegistry = {
  track: (requestId: number, child: KillableProcess, onTerminate?: () => void) => () => void;
  terminate: (requestId: number) => boolean;
  terminateAll: () => number;
};

const forceKillDirectChild = (child: KillableProcess): void => {
  try {
    child.kill('SIGKILL');
  } catch {
    // Ignore cleanup races for already-exited children.
  }
};

export const createFallbackProcessRegistry = (
  dependencies: ProcessRegistryDependencies = {},
): FallbackProcessRegistry => {
  const platform = dependencies.platform ?? process.platform;
  const killProcess = dependencies.killProcess ?? process.kill;
  const spawn =
    dependencies.spawn ??
    ((command, args, options) => {
      return spawnProcess(command, args, options);
    });
  const activeChildren = new Set<KillableProcess>();
  const activeChildrenByRequestId = new Map<number, KillableProcess>();
  const terminateCallbacksByRequestId = new Map<number, () => void>();

  const terminateProcessTree = (child: KillableProcess): void => {
    if (typeof child.pid !== 'number' || child.pid <= 0) {
      forceKillDirectChild(child);
      return;
    }

    if (platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        });
        return;
      } catch {
        forceKillDirectChild(child);
        return;
      }
    }

    try {
      killProcess(-child.pid, 'SIGKILL');
    } catch {
      forceKillDirectChild(child);
    }
  };

  return {
    track: (requestId, child, onTerminate) => {
      activeChildren.add(child);
      activeChildrenByRequestId.set(requestId, child);
      if (onTerminate) {
        terminateCallbacksByRequestId.set(requestId, onTerminate);
      }

      let removed = false;
      return () => {
        if (removed) {
          return;
        }

        removed = true;
        if (activeChildrenByRequestId.get(requestId) === child) {
          activeChildrenByRequestId.delete(requestId);
        }
        terminateCallbacksByRequestId.delete(requestId);
        activeChildren.delete(child);
      };
    },
    terminate: (requestId) => {
      const child = activeChildrenByRequestId.get(requestId);
      if (!child) {
        return false;
      }

      activeChildrenByRequestId.delete(requestId);
      terminateCallbacksByRequestId.get(requestId)?.();
      terminateCallbacksByRequestId.delete(requestId);
      activeChildren.delete(child);
      terminateProcessTree(child);
      return true;
    },
    terminateAll: () => {
      const children = [...activeChildren];
      activeChildren.clear();
      activeChildrenByRequestId.clear();
      const callbacks = [...terminateCallbacksByRequestId.values()];
      terminateCallbacksByRequestId.clear();

      for (const callback of callbacks) {
        callback();
      }

      for (const child of children) {
        terminateProcessTree(child);
      }

      return children.length;
    },
  };
};
