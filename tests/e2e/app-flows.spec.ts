import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { join } from 'node:path';

const launchApp = async (): Promise<ElectronApplication> => {
  return await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });
};

const dispatchPaste = async (page: Page, text: string): Promise<void> => {
  await page.evaluate((pasteText) => {
    const runtime = globalThis as unknown as {
      Event: new (type: string, init?: { bubbles?: boolean; cancelable?: boolean }) => Event;
      document: {
        querySelector: (selector: string) => { dispatchEvent: (event: Event) => boolean } | null;
      };
    };
    const shell = runtime.document.querySelector('[data-testid="editor-shell"]');
    if (!shell) {
      return;
    }

    const pasteEvent = new runtime.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        getData: () => pasteText,
      },
    });
    shell.dispatchEvent(pasteEvent);
  }, text);
};

const dispatchDrop = async (page: Page, text: string): Promise<void> => {
  await page.evaluate(async (dropText) => {
    const runtime = globalThis as unknown as {
      Event: new (type: string, init?: { bubbles?: boolean; cancelable?: boolean }) => Event;
      document: {
        querySelector: (selector: string) => { dispatchEvent: (event: Event) => boolean } | null;
      };
    };
    const shell = runtime.document.querySelector('[data-testid="editor-shell"]');
    if (!shell) {
      return;
    }

    const dropEvent = new runtime.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [
          {
            text: async () => dropText,
          },
        ],
      },
    });
    shell.dispatchEvent(dropEvent);
  }, text);
};

const resetPreferences = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        preferences: {
          reset: () => Promise<unknown>;
        };
      };
    };
    await bridge.prettypretty.preferences.reset();
  });
};

test('supports ingest parity for drop and paste', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);
  await dispatchDrop(page, '{"via":"drop"}');
  await expect(page.getByTestId('output-editor')).toContainText('"via": "drop"');

  await page.keyboard.press('Meta+Shift+N');
  await expect(page.getByTestId('empty-state-cta')).toBeVisible();
  await dispatchPaste(page, '{"via":"paste"}');
  await expect(page.getByTestId('output-editor')).toContainText('"via": "paste"');

  await resetPreferences(page);
  await app.close();
});

test('runs configured fallback agent for malformed input', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        preferences: {
          update: (patch: unknown) => Promise<unknown>;
        };
      };
    };

    await bridge.prettypretty.preferences.update({
      agents: [
        {
          id: 'e2e-agent',
          name: 'E2E Agent',
          executable: 'node',
          argsTemplate: [
            '-e',
            "process.stdin.resume();process.stdin.on('data',()=>{});console.error('e2e-progress-line');console.log('{\"fromAgent\":true}');",
          ],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: true,
          timeoutMs: 5_000,
          maxOutputBytes: 10_000,
        },
      ],
      fallbackAgentId: 'e2e-agent',
    });
  });

  await dispatchPaste(page, '{bad');

  await expect(page.getByTestId('output-editor')).toContainText('fromAgent');
  await expect(page.getByTestId('output-editor')).not.toContainText('{bad');

  await resetPreferences(page);
  await app.close();
});

test('uses passthrough output for malformed content when fallback is disabled', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        preferences: {
          update: (patch: unknown) => Promise<unknown>;
        };
      };
    };

    await bridge.prettypretty.preferences.update({ fallbackAgentId: null });
  });

  await dispatchPaste(page, '{bad');

  await expect(page.getByTestId('output-editor')).toContainText('{bad');
  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);

  await resetPreferences(page);
  await app.close();
});

test('persists toolbar preferences across app relaunch', async () => {
  const firstRun = await launchApp();
  const firstPage = await firstRun.firstWindow();
  await firstPage.waitForLoadState('domcontentloaded');
  await resetPreferences(firstPage);

  await firstPage.getByTestId('theme-segment-dark').click();
  await firstPage.getByTestId('indent-size-select').click();
  await firstPage.getByTestId('indent-size-option-6').click();
  await firstPage.getByTestId('fallback-agent-select').click();
  await firstPage.getByTestId('fallback-option-none').click();
  await firstRun.close();

  const secondRun = await launchApp();
  const secondPage = await secondRun.firstWindow();
  await secondPage.waitForLoadState('domcontentloaded');

  await expect(secondPage.getByTestId('theme-segment-dark')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(secondPage.getByTestId('indent-size-select')).toContainText('Indent: 6');
  await expect(secondPage.getByTestId('fallback-agent-select')).toContainText('No Fallback');

  await resetPreferences(secondPage);
  await secondRun.close();
});

test('opens and reuses log window and streams telemetry log lines', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await app.evaluate(({ Menu }) => {
    const appMenu = Menu.getApplicationMenu();
    if (!appMenu) {
      throw new Error('Application menu unavailable');
    }
    const appMenuSection = appMenu.items.find((item) => item.label === 'prettypretty');
    const viewLogItem =
      appMenuSection?.submenu?.items.find((item) => item.label === 'View Log') ?? null;
    if (!viewLogItem) {
      throw new Error('View Log menu item unavailable');
    }
    viewLogItem.click(undefined as never, undefined as never, {} as never);
  });
  await expect
    .poll(
      async () => {
        const windows = app.windows();
        return windows.length;
      },
      { timeout: 5_000 },
    )
    .toBe(2);

  const logWindow = app.windows()[1];
  if (!logWindow) {
    throw new Error('Expected log window to open');
  }

  await expect(logWindow.getByTestId('log-window-content')).toContainText('app.bootstrap.start');

  await page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        telemetry: {
          log: (event: {
            name: 'renderer.ingest.paste';
            meta: { inputLength: number; isEmpty: boolean; source: string };
          }) => Promise<void>;
        };
      };
    };

    await bridge.prettypretty.telemetry.log({
      name: 'renderer.ingest.paste',
      meta: { inputLength: 3, isEmpty: false, source: 'e2e' },
    });
  });

  await expect(logWindow.getByTestId('log-window-content')).toContainText('renderer.ingest.paste');

  await app.evaluate(({ Menu }) => {
    const appMenu = Menu.getApplicationMenu();
    const appMenuSection = appMenu?.items.find((item) => item.label === 'prettypretty') ?? null;
    const viewLogItem =
      appMenuSection?.submenu?.items.find((item) => item.label === 'View Log') ?? null;
    viewLogItem?.click(undefined as never, undefined as never, {} as never);
  });
  await expect
    .poll(
      async () => {
        const windows = app.windows();
        return windows.length;
      },
      { timeout: 5_000 },
    )
    .toBe(2);

  await resetPreferences(page);
  await app.close();
});
