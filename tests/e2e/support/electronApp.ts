import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { join } from 'node:path';
import { E2E_WINDOW_MODE_FLAG_PREFIX, type E2EWindowMode } from '../../../src/main/e2eWindowMode';

export { expect, test };

export const VISIBLE_WINDOW_TAG = '@requires-visible-window';

const wait = async (timeMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, timeMs));
};

const isTransientElectronLaunchError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Process failed to launch|waiting for event "window"/u.test(error.message);
};

const isE2EWindowMode = (value: string | undefined): value is E2EWindowMode => {
  return value === 'hidden' || value === 'visible';
};

const hasVisibleWindowTag = (titlePath: readonly string[]): boolean => {
  return titlePath.some((titleSegment) => titleSegment.includes(VISIBLE_WINDOW_TAG));
};

/**
 * Resolve launch mode from the full Playwright title path so suite-level tags
 * and leaf-test tags select the same Electron window behavior.
 */
export const resolveWindowModeForTitlePath = (
  titlePath: readonly string[],
  forcedMode: string | undefined = process.env.PRETTYPRETTY_E2E_WINDOW_MODE,
): E2EWindowMode => {
  if (isE2EWindowMode(forcedMode)) {
    return forcedMode;
  }

  return hasVisibleWindowTag(titlePath) ? 'visible' : 'hidden';
};

const launchElectronApp = async (
  windowMode: E2EWindowMode,
  extraArgs: string[] = [],
): Promise<ElectronApplication> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await electron.launch({
        args: [
          join(process.cwd(), 'out/main/index.js'),
          `${E2E_WINDOW_MODE_FLAG_PREFIX}${windowMode}`,
          ...extraArgs,
        ],
      });
    } catch (error) {
      if (!isTransientElectronLaunchError(error) || attempt === 4) {
        throw error;
      }

      // Electron occasionally aborts during Playwright launch on macOS CI-like
      // runs; bounded retries keep the suite deterministic without masking
      // persistent app-start regressions.
      await wait(250 * (attempt + 1));
    }
  }

  throw new Error('unreachable');
};

/**
 * Default every Playwright Electron launch to hidden-window mode, while still
 * allowing title-tagged tests to opt back into visible windows.
 */
export const launchApp = async (
  testInfo: {
    titlePath: readonly string[];
  },
  extraArgs: string[] = [],
): Promise<ElectronApplication> => {
  return await launchElectronApp(resolveWindowModeForTitlePath(testInfo.titlePath), extraArgs);
};
