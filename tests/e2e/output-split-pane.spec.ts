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

const ctrlClickOutputLine = async (page: Page, testId: string, text: string): Promise<void> => {
  const line = page
    .locator(`[data-testid="${testId}"] .view-line`)
    .filter({ hasText: text })
    .first();
  await expect(line).toBeVisible();
  await line.scrollIntoViewIfNeeded();
  await line.click({ force: true, modifiers: ['Control'] });
};

const readVisibleLineNumbers = async (page: Page, testId: string): Promise<string[]> => {
  return await page
    .locator(`[data-testid="${testId}"] .line-numbers`)
    .evaluateAll((elements) =>
      elements
        .map((element) => element.textContent?.trim() ?? '')
        .filter((lineNumber) => lineNumber.length > 0),
    );
};

const readVisibleLineTexts = async (page: Page, testId: string): Promise<string[]> => {
  return await page
    .locator(`[data-testid="${testId}"] .view-line`)
    .evaluateAll((elements) =>
      elements.map((element) => element.textContent?.replace(/\u00a0/g, ' ').trim() ?? ''),
    );
};

test('opens, replaces, and closes a structural split pane from output Ctrl+click', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, '{"root":{"nested":{"leaf":1},"secondary":{"value":2},"other":true}}');
  await expect(
    page
      .locator('[data-testid="output-editor"] [data-testid="output-inline-fold-control"]')
      .first(),
  ).toBeVisible();

  await ctrlClickOutputLine(page, 'output-editor', '"nested"');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"leaf": 1');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .not.toContain('"secondary"');
  await expect(page.getByTestId('toolbar-split-button')).toBeEnabled();
  await expect
    .poll(async () => (await readVisibleLineNumbers(page, 'output-editor-pane-1')).slice(0, 2))
    .toEqual(['3', '4']);
  expect(await readVisibleLineNumbers(page, 'output-editor-pane-1')).not.toContain('1');

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const runtime = globalThis as {
          getSelection?: () => { toString: () => string } | null;
          document?: {
            querySelector: (selector: string) => unknown | null;
          };
        };
        const hasHighlight =
          runtime.document?.querySelector(
            '[data-testid="output-editor"] .output-split-selection-anchor',
          ) !== null;
        return {
          hasHighlight,
          nativeSelection: runtime.getSelection?.()?.toString() ?? '',
        };
      });
    })
    .toEqual({
      hasHighlight: true,
      nativeSelection: '',
    });

  await page.getByRole('button', { name: /Collapse folded block at line 3/ }).click();
  await expect(page.getByTestId('output-editor')).not.toContainText('"leaf": 1');

  await page.getByRole('button', { name: 'Split' }).click();
  await expect(page.getByTestId('toolbar-split-button')).toBeDisabled();

  await ctrlClickOutputLine(page, 'output-editor', '"nested"');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"leaf": 1');

  await ctrlClickOutputLine(page, 'output-editor', '"secondary"');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"value": 2');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .not.toContain('"leaf": 1');

  await page.getByRole('button', { name: 'Split' }).click();
  await expect(page.getByTestId('toolbar-split-button')).toBeDisabled();
  await expect(page.locator('[data-testid="output-editor-pane-1"]')).toHaveCount(0);
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const runtime = globalThis as {
          document?: {
            querySelector: (selector: string) => unknown | null;
          };
        };
        return (
          runtime.document?.querySelector(
            '[data-testid="output-editor"] .output-split-selection-anchor',
          ) !== null
        );
      });
    })
    .toBe(false);

  await resetPreferences(page);
  await app.close();
});

test('routes fold actions to the focused derived pane while copy keeps root output text', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, '{"root":{"nested":{"leaf":1},"other":true}}');
  await expect(
    page
      .locator('[data-testid="output-editor"] [data-testid="output-inline-fold-control"]')
      .first(),
  ).toBeVisible();
  await ctrlClickOutputLine(page, 'output-editor', '"nested"');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"leaf": 1');

  const derivedLeaf = page
    .locator('[data-testid="output-editor-pane-1"] .view-line')
    .filter({ hasText: '"leaf"' })
    .first();
  await derivedLeaf.click();

  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await expect
    .poll(async () => await readVisibleLineNumbers(page, 'output-editor-pane-1'))
    .toEqual(['3']);
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor')).join('\n'))
    .toContain('"leaf": 1');

  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect
    .poll(async () => (await readVisibleLineNumbers(page, 'output-editor-pane-1')).slice(0, 2))
    .toEqual(['3', '4']);

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect
    .poll(async () => {
      return await app.evaluate(({ clipboard }) => clipboard.readText());
    })
    .toContain('"other": true');

  await resetPreferences(page);
  await app.close();
});
