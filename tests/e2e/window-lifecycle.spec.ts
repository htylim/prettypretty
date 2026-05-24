import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { expect, launchApp, test } from './support/electronApp';

const getWindowSnapshot = async (
  app: ElectronApplication,
): Promise<
  Array<{
    id: number;
    destroyed: boolean;
    visible: boolean;
    title: string;
    bounds: { x: number; y: number; width: number; height: number };
  }>
> => {
  return await app.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()
      .map((window) => ({
        bounds: window.getBounds(),
        id: window.id,
        destroyed: window.isDestroyed(),
        title: window.getTitle(),
        visible: window.isVisible(),
      }))
      .sort((left, right) => left.id - right.id);
  });
};

const waitForWindowCount = async (
  app: ElectronApplication,
  expectedCount: number,
): Promise<void> => {
  await expect
    .poll(
      async () => {
        return app.windows().length;
      },
      { timeout: 5_000 },
    )
    .toBe(expectedCount);
};

const waitForAppExit = async (app: ElectronApplication): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      void getWindowSnapshot(app).then((windows) => {
        reject(
          new Error(
            `Electron app did not exit after window close. windows=${JSON.stringify(windows)}`,
          ),
        );
      });
    }, 5_000);

    app.process().once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
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

const primaryModifier = process.platform === 'darwin' ? 'Meta' : 'Control';

const focusInputEditor = async (page: Page): Promise<void> => {
  await page.getByTestId('pane-segment-input').click();
  await expect(page.getByTestId('input-editor')).toBeVisible();
  await page
    .locator('[data-testid="input-editor"]')
    .first()
    .click({ force: true, position: { x: 90, y: 24 } });
};

const expectOutputText = async (page: Page, text: string): Promise<void> => {
  await expect(page.getByTestId('output-editor')).toContainText(text);
};

const createPrettyNumberObject = (count: number): string => {
  return `${JSON.stringify(
    Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`line${index + 1}`, index + 1]),
    ),
    null,
    2,
  )}\n`;
};

const focusDocumentWindowByIndex = async (
  app: ElectronApplication,
  windowIndex: number,
): Promise<void> => {
  await app.evaluate(({ BrowserWindow, app: electronApp }, targetWindowIndex) => {
    const targetWindow = BrowserWindow.getAllWindows().sort((left, right) => left.id - right.id)[
      targetWindowIndex
    ];
    if (!targetWindow) {
      throw new Error(`Document window ${targetWindowIndex} unavailable`);
    }

    electronApp.focus({ steal: true });
    targetWindow.show();
    targetWindow.moveTop();
    targetWindow.focus();
  }, windowIndex);
};

const clickRefreshFileMenuItemForWindowIndex = async (
  app: ElectronApplication,
  windowIndex: number,
): Promise<void> => {
  await app.evaluate(({ BrowserWindow, Menu }, targetWindowIndex) => {
    const targetWindow = BrowserWindow.getAllWindows().sort((left, right) => left.id - right.id)[
      targetWindowIndex
    ];
    if (!targetWindow) {
      throw new Error(`Document window ${targetWindowIndex} unavailable`);
    }

    const appMenu = Menu.getApplicationMenu();
    const refreshItem =
      appMenu?.items
        .find((item) => item.label === 'File')
        ?.submenu?.items.find((item) => item.label === 'Refresh File') ?? null;
    if (!refreshItem) {
      throw new Error('Refresh File menu item unavailable');
    }

    const originalGetFocusedWindow = BrowserWindow.getFocusedWindow;
    BrowserWindow.getFocusedWindow = () => targetWindow;
    try {
      refreshItem.click(undefined as never, undefined as never, {} as never);
    } finally {
      BrowserWindow.getFocusedWindow = originalGetFocusedWindow;
    }
  }, windowIndex);
};

const openLogWindow = async (app: ElectronApplication): Promise<Page> => {
  const logWindowPromise = app.waitForEvent('window');

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

  return await logWindowPromise;
};

test('toolbar New opens a second blank document window and preserves the existing document', async () => {
  const app = await launchApp(test.info());
  const firstWindow = await app.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');

  await dispatchPaste(firstWindow, '{"window":"one"}');
  await expect(firstWindow.getByTestId('output-editor')).toContainText('"window": "one"');

  await firstWindow.getByRole('button', { name: 'New' }).click();
  await waitForWindowCount(app, 2);

  const secondWindow = app.windows()[1];
  if (!secondWindow) {
    throw new Error('Expected second document window');
  }

  await expect(secondWindow.getByTestId('empty-state-cta')).toBeVisible();
  await expect(firstWindow.getByTestId('output-editor')).toContainText('"window": "one"');

  await app.close();
});

test('launching with a file argument opens that file in the first document window', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'prettypretty-launch-'));
  const filePath = join(tempDirectory, 'launch.json');
  await writeFile(filePath, '{"launch":true}', 'utf8');

  const app = await launchApp(test.info(), [filePath]);

  try {
    const firstWindow = await app.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');
    await expect(firstWindow.getByTestId('output-editor')).toContainText('"launch": true');
  } finally {
    await app.close();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('refresh button reloads the current file and reruns prettify without changing pane mode', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'prettypretty-refresh-button-'));
  const filePath = join(tempDirectory, 'refresh.json');
  await writeFile(filePath, '{"version":1}', 'utf8');

  const app = await launchApp(test.info(), [filePath]);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expectOutputText(page, '"version": 1');
    await expect(page.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');

    await writeFile(filePath, '{"version":2}', 'utf8');
    await page.getByRole('button', { name: 'Refresh' }).click();

    await expectOutputText(page, '"version": 2');
    await expect(page.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('paste-backed input ignores Cmd+R refresh', async () => {
  const app = await launchApp(test.info());

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    await dispatchPaste(page, '{"paste":1}');
    await expectOutputText(page, '"paste": 1');
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    await page.keyboard.press(`${primaryModifier}+R`);
    await expectOutputText(page, '"paste": 1');
  } finally {
    await app.close();
  }
});

test('refresh clamps preserved line when refreshed content is shorter', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'prettypretty-refresh-clamp-'));
  const filePath = join(tempDirectory, 'long.json');
  await writeFile(filePath, createPrettyNumberObject(80), 'utf8');

  const app = await launchApp(test.info(), [filePath]);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expectOutputText(page, '"line1": 1');

    await focusInputEditor(page);
    await page.locator('[data-testid="input-editor"] .monaco-scrollable-element').first().hover();
    for (let wheelCount = 0; wheelCount < 20; wheelCount += 1) {
      await page.mouse.wheel(0, 10_000);
    }
    await expect(page.getByTestId('input-editor')).toContainText('"line80": 80');

    await writeFile(filePath, createPrettyNumberObject(40), 'utf8');
    await page.getByRole('button', { name: 'Refresh' }).click();

    await expect(page.getByTestId('input-editor')).toContainText('"line40": 40');
    await expect(page.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Refresh File menu item refreshes the focused file-backed window @requires-visible-window', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'prettypretty-refresh-shortcut-'));
  const firstFilePath = join(tempDirectory, 'first.json');
  const secondFilePath = join(tempDirectory, 'second.json');
  await writeFile(firstFilePath, '{"window":"one","version":1}', 'utf8');
  await writeFile(secondFilePath, '{"window":"two","version":1}', 'utf8');

  const app = await launchApp(test.info(), [firstFilePath, secondFilePath]);

  try {
    await waitForWindowCount(app, 2);
    const firstWindow = app.windows()[0];
    const secondWindow = app.windows()[1];
    if (!firstWindow || !secondWindow) {
      throw new Error('Expected two document windows');
    }

    await expectOutputText(firstWindow, '"window": "one"');
    await expectOutputText(secondWindow, '"window": "two"');

    await writeFile(firstFilePath, '{"window":"one","version":2}', 'utf8');
    await writeFile(secondFilePath, '{"window":"two","version":2}', 'utf8');
    await focusDocumentWindowByIndex(app, 0);
    await clickRefreshFileMenuItemForWindowIndex(app, 0);

    await expectOutputText(firstWindow, '"version": 2');
    await expectOutputText(secondWindow, '"version": 1');
  } finally {
    await app.close();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});

test('Cmd+N opens a new document window and Cmd+Shift+N resets only the focused window', async () => {
  const app = await launchApp(test.info());
  const firstWindow = await app.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');

  await dispatchPaste(firstWindow, '{"window":"one"}');
  await expect(firstWindow.getByTestId('output-editor')).toContainText('"window": "one"');

  await firstWindow.keyboard.press('Meta+N');
  await waitForWindowCount(app, 2);

  const secondWindow = app.windows()[1];
  if (!secondWindow) {
    throw new Error('Expected second document window');
  }

  await secondWindow.waitForLoadState('domcontentloaded');
  const windows = await getWindowSnapshot(app);
  expect(windows).toHaveLength(2);
  const originWindow = windows[0];
  const createdWindow = windows.find((window) => window.id !== originWindow?.id);
  expect(createdWindow).toBeDefined();
  expect(createdWindow?.destroyed).toBe(false);

  await dispatchPaste(secondWindow, '{"window":"two"}');
  await expect(secondWindow.getByTestId('output-editor')).toContainText('"window": "two"');

  await secondWindow.bringToFront();
  await secondWindow.keyboard.press('Meta+Shift+N');

  await expect(secondWindow.getByTestId('empty-state-cta')).toBeVisible();
  await expect(firstWindow.getByTestId('output-editor')).toContainText('"window": "one"');

  await app.close();
});

test('closing one of two document windows leaves the app running', async () => {
  const app = await launchApp(test.info());
  const firstWindow = await app.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');

  await firstWindow.getByRole('button', { name: 'New' }).click();
  await waitForWindowCount(app, 2);

  const secondWindow = app.windows()[1];
  if (!secondWindow) {
    throw new Error('Expected second document window');
  }

  await secondWindow.bringToFront();
  await secondWindow.close();

  await waitForWindowCount(app, 1);
  expect(app.process().exitCode).toBeNull();
  await expect(firstWindow.getByTestId('empty-state-cta')).toBeVisible();

  await app.close();
});

test('closing the final remaining window exits the app process', async () => {
  const app = await launchApp(test.info());

  const firstWindow = await app.firstWindow();

  const exitPromise = waitForAppExit(app);
  await firstWindow.close();
  await exitPromise;
});

test('the app stays alive when the log window is the only remaining window', async () => {
  const app = await launchApp(test.info());
  const documentWindow = await app.firstWindow();
  await documentWindow.waitForLoadState('domcontentloaded');

  const logWindow = await openLogWindow(app);
  await waitForWindowCount(app, 2);
  await expect(logWindow.getByTestId('log-window-content')).toBeVisible();

  await documentWindow.close();

  await waitForWindowCount(app, 1);
  expect(app.process().exitCode).toBeNull();

  const exitPromise = waitForAppExit(app);
  await logWindow.close();
  await exitPromise;
});
