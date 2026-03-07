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
  track: (child: KillableProcess) => () => void;
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
    track: (child) => {
      activeChildren.add(child);

      let removed = false;
      return () => {
        if (removed) {
          return;
        }

        removed = true;
        activeChildren.delete(child);
      };
    },
    terminateAll: () => {
      const children = [...activeChildren];
      activeChildren.clear();

      for (const child of children) {
        terminateProcessTree(child);
      }

      return children.length;
    },
  };
};
