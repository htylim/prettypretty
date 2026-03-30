export const E2E_WINDOW_MODE_FLAG_PREFIX = '--prettypretty-e2e-window-mode=';

export type E2EWindowMode = 'hidden' | 'visible';

const isE2EWindowMode = (value: string | undefined): value is E2EWindowMode => {
  return value === 'hidden' || value === 'visible';
};

/**
 * Resolve the test-only Electron window mode from process arguments.
 * Production and local app runs keep the normal visible-window behavior.
 */
export const resolveE2EWindowMode = (argv: string[] = process.argv): E2EWindowMode => {
  const requestedArgument = argv.find((argument) => {
    return argument.startsWith(E2E_WINDOW_MODE_FLAG_PREFIX);
  });
  const requestedMode = requestedArgument?.slice(E2E_WINDOW_MODE_FLAG_PREFIX.length);
  return isE2EWindowMode(requestedMode) ? requestedMode : 'visible';
};

export const shouldShowWindow = (windowMode: E2EWindowMode): boolean => {
  return windowMode === 'visible';
};
