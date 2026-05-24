import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, launchApp, test } from './support/electronApp';

const makeInputEditorDirty = async (page: Page): Promise<void> => {
  await page.getByTestId('pane-segment-input').click();
  await expect(page.getByTestId('input-editor')).toBeVisible();
  await page.evaluate(() => {
    const runtime = globalThis as unknown as {
      monaco?: {
        editor?: {
          getEditors: () => Array<{
            focus: () => void;
            getDomNode: () => { closest: (selector: string) => unknown } | null;
            getModel: () => object | null;
            setPosition: (position: { lineNumber: number; column: number }) => void;
            trigger: (source: string, handlerId: string, payload: { text: string }) => void;
          }>;
        };
      };
    };
    const inputEditor = runtime.monaco?.editor
      ?.getEditors()
      .find((editor) => editor.getDomNode()?.closest('[data-testid="input-editor"]'));
    if (!inputEditor?.getModel()) {
      throw new Error('Input Monaco editor unavailable');
    }

    inputEditor.focus();
    inputEditor.setPosition({ lineNumber: 1, column: 1 });
    inputEditor.trigger('e2e-dirty-input', 'type', { text: 'x' });
  });
  await expect(page.getByTestId('input-editor')).toContainText('x');
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();
};

const openDirtyRefreshPrompt = async (page: Page): Promise<void> => {
  const refreshButton = page.getByRole('button', { name: 'Refresh' });
  await refreshButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Refresh file?');
};

test('dirty input refresh prompts, cancel preserves edits, and confirm replaces edits from disk @requires-visible-window', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'prettypretty-refresh-cancel-'));
  const filePath = join(tempDirectory, 'dirty.json');
  await writeFile(filePath, '{"disk":1}', 'utf8');

  const app = await launchApp(test.info(), [filePath]);

  try {
    const page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('output-editor')).toContainText('"disk": 1');

    await makeInputEditorDirty(page);
    await writeFile(filePath, '{"disk":2}', 'utf8');
    await openDirtyRefreshPrompt(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByTestId('input-editor')).toContainText('x');
    await expect(page.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    await openDirtyRefreshPrompt(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Refresh' }).click();

    await expect(page.getByTestId('input-editor')).toContainText('"disk":2');
    await expect(page.getByTestId('input-editor')).not.toContainText('x');
    await expect(page.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
    await rm(tempDirectory, { recursive: true, force: true });
  }
});
