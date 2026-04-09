import { isAbsolute, resolve } from 'node:path';

type ResolveLaunchFilePathsOptions = {
  argv?: string[];
  currentWorkingDirectory?: string;
  defaultApp?: boolean;
};

const resolveLaunchPath = (filePath: string, currentWorkingDirectory: string): string => {
  return isAbsolute(filePath) ? filePath : resolve(currentWorkingDirectory, filePath);
};

export const resolveLaunchFilePaths = ({
  argv = process.argv,
  currentWorkingDirectory = process.cwd(),
  defaultApp = Boolean(process.defaultApp),
}: ResolveLaunchFilePathsOptions = {}): string[] => {
  const argumentStartIndex = defaultApp ? 2 : 1;
  const launchPaths: string[] = [];
  let treatRemainingArgumentsAsPaths = false;

  for (const argument of argv.slice(argumentStartIndex)) {
    if (argument.length === 0) {
      continue;
    }

    if (!treatRemainingArgumentsAsPaths && argument === '--') {
      treatRemainingArgumentsAsPaths = true;
      continue;
    }

    if (!treatRemainingArgumentsAsPaths && argument.startsWith('-')) {
      continue;
    }

    launchPaths.push(resolveLaunchPath(argument, currentWorkingDirectory));
  }

  return launchPaths;
};
