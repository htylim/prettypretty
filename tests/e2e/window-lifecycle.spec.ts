import { _electron as electron, test } from '@playwright/test';
import { join } from 'node:path';

const getWindowSnapshot = async (
  app: ReturnType<typeof electron.launch> extends Promise<infer T> ? T : never,
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

const waitForAppExit = async (
  app: ReturnType<typeof electron.launch> extends Promise<infer T> ? T : never,
): Promise<void> => {
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

test('focused window close exits the app process', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  await app.firstWindow();

  const exitPromise = waitForAppExit(app);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getFocusedWindow()?.close();
  });
  await exitPromise;
});

test('menu first-responder close exits the app process', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  await app.firstWindow();

  const exitPromise = waitForAppExit(app);
  await app.evaluate(({ Menu }) => {
    Menu.sendActionToFirstResponder('performClose:');
  });

  await exitPromise;
});
