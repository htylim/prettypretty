import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('launches app and renders main window', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  const page = await app.firstWindow();
  await expect(page.getByText('Paste, Drop or Click')).toBeVisible();

  await app.close();
});

test('renders Monaco output editor and keeps collapse/expand stable in output mode', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(() => {
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
        getData: () => '{"root":{"nested":1}}',
      },
    });
    shell.dispatchEvent(pasteEvent);
  });

  await expect(page.locator('[data-testid="output-editor"] .monaco-editor')).toBeVisible();

  const collapseButton = page.getByRole('button', { name: 'Collapse' });
  const expandButton = page.getByRole('button', { name: 'Expand' });
  await expect(collapseButton).toBeEnabled();
  await expect(expandButton).toBeEnabled();

  await collapseButton.click();
  await expandButton.click();
  await expect(page.locator('[data-testid="output-editor"] .monaco-editor')).toBeVisible();

  await app.close();
});
