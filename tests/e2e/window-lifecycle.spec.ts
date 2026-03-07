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

const getWindowSnapshot = async (
  app: ElectronApplication,
): Promise<Array<{ id: number; destroyed: boolean; visible: boolean; title: string }>> => {
  return await app.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().map((window) => ({
      id: window.id,
      destroyed: window.isDestroyed(),
      title: window.getTitle(),
      visible: window.isVisible(),
    }));
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
  const app = await launchApp();
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

test('Cmd+N opens a new document window and Cmd+Shift+N resets only the focused window', async () => {
  const app = await launchApp();
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
  await dispatchPaste(secondWindow, '{"window":"two"}');
  await expect(secondWindow.getByTestId('output-editor')).toContainText('"window": "two"');

  await secondWindow.bringToFront();
  await secondWindow.keyboard.press('Meta+Shift+N');

  await expect(secondWindow.getByTestId('empty-state-cta')).toBeVisible();
  await expect(firstWindow.getByTestId('output-editor')).toContainText('"window": "one"');

  await app.close();
});

test('closing one of two document windows leaves the app running', async () => {
  const app = await launchApp();
  const firstWindow = await app.firstWindow();
  await firstWindow.waitForLoadState('domcontentloaded');

  await firstWindow.getByRole('button', { name: 'New' }).click();
  await waitForWindowCount(app, 2);

  const secondWindow = app.windows()[1];
  if (!secondWindow) {
    throw new Error('Expected second document window');
  }

  await secondWindow.bringToFront();
  await app.evaluate(({ Menu }) => {
    Menu.sendActionToFirstResponder('performClose:');
  });

  await waitForWindowCount(app, 1);
  expect(app.process().exitCode).toBeNull();
  await expect(firstWindow.getByTestId('empty-state-cta')).toBeVisible();

  await app.close();
});

test('closing the final remaining window exits the app process', async () => {
  const app = await launchApp();

  await app.firstWindow();

  const exitPromise = waitForAppExit(app);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getFocusedWindow()?.close();
  });
  await exitPromise;
});

test('the app stays alive when the log window is the only remaining window', async () => {
  const app = await launchApp();
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
