import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

const dispatchPaste = async (
  page: import('@playwright/test').Page,
  text: string,
): Promise<void> => {
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

const resetPreferences = async (page: import('@playwright/test').Page): Promise<void> => {
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
  await resetPreferences(page);
  await dispatchPaste(page, '{"root":{"nested":{"leaf":3}}}');

  await expect(page.locator('[data-testid="output-editor"] .monaco-editor')).toBeVisible();

  const collapseButton = page.getByRole('button', { name: 'Collapse', exact: true });
  const expandButton = page.getByRole('button', { name: 'Expand', exact: true });
  await expect(collapseButton).toBeEnabled();
  await expect(expandButton).toBeEnabled();

  await collapseButton.click();
  await expandButton.click();
  await expect(page.locator('[data-testid="output-editor"] .monaco-editor')).toBeVisible();

  const nestedLine = page
    .locator('[data-testid="output-editor"] .view-line')
    .filter({ hasText: '"nested"' })
    .first();
  await expect(nestedLine).toBeVisible();
  await expect(page.getByTestId('output-editor')).toContainText('"leaf": 3');

  await page
    .getByRole('button', { name: /Collapse folded block at line/ })
    .first()
    .click();
  await expect(page.getByTestId('output-editor')).not.toContainText('"leaf": 3');

  await expandButton.click();
  await expect(page.getByTestId('output-editor')).toContainText('"leaf": 3');

  await resetPreferences(page);
  await app.close();
});

test('renders inline output fold controls and hides gutter fold controls', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);
  await dispatchPaste(page, '{"root":{"nested":{"leaf":3},"other":true}}');

  const outputEditor = page.getByTestId('output-editor');
  await expect(outputEditor.locator('.monaco-editor')).toBeVisible();
  await expect(outputEditor.locator('.line-numbers').first()).toBeVisible();
  await expect(
    outputEditor.locator(
      '.margin-view-overlays .codicon-folding-expanded, .margin-view-overlays .codicon-folding-collapsed',
    ),
  ).toHaveCount(0);

  const inlineControl = page.getByRole('button', { name: /Collapse folded block at line/ }).first();
  await expect(inlineControl).toBeVisible();

  await inlineControl.click();
  await expect(outputEditor).not.toContainText('"leaf": 3');

  const expandInlineControl = page
    .getByRole('button', { name: /Expand folded block at line/ })
    .first();
  await expect(expandInlineControl).toBeVisible();
  await expandInlineControl.click();
  await expect(outputEditor).toContainText('"leaf": 3');

  await resetPreferences(page);
  await app.close();
});

test('ctrl-clicking an inline fold control toggles only direct child blocks and shows the hint state', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);
  await dispatchPaste(page, '{"outer":{"top":{"a":1,"d":{"e":{}},"f":{"g":2}}}}');

  const outputEditor = page.getByTestId('output-editor');
  await expect(outputEditor.locator('.monaco-editor')).toBeVisible();

  const topControl = outputEditor.locator(
    '[data-testid="output-inline-fold-control"][data-line-number="3"]',
  );
  await expect(topControl).toBeVisible();
  await expect(topControl).toHaveAttribute('aria-label', 'Collapse folded block at line 3');

  await page.keyboard.down('Control');
  await expect(topControl).toHaveAttribute('data-ctrl-hint', 'true');
  await expect(topControl).toHaveAttribute('data-fold-action-scope', 'children');
  await expect(topControl).toHaveAttribute('data-fold-action', 'collapse');
  await page.keyboard.up('Control');
  await expect(topControl).toHaveAttribute('data-ctrl-hint', 'false');
  await expect(topControl).toHaveAttribute('data-fold-action-scope', 'self');
  await expect(topControl).toHaveAttribute('data-fold-action', 'collapse');

  await topControl.click({ modifiers: ['Control'] });
  await expect(outputEditor).toContainText('"d": {');
  await expect(outputEditor).toContainText('"f": {');
  await expect(outputEditor).not.toContainText('"e": {}');
  await expect(outputEditor).not.toContainText('"g": 2');

  await page.keyboard.down('Control');
  await expect(topControl).toHaveAttribute('data-fold-action-scope', 'children');
  await expect(topControl).toHaveAttribute('data-fold-action', 'expand');
  await page.keyboard.up('Control');
  await expect(topControl).toHaveAttribute('data-fold-action-scope', 'self');
  await expect(topControl).toHaveAttribute('data-fold-action', 'collapse');

  await topControl.click();
  await expect(outputEditor).not.toContainText('"a": 1');
  await expect(topControl).toHaveAttribute('aria-label', 'Expand folded block at line 3');

  await topControl.click({ modifiers: ['Control'] });
  await expect(outputEditor).not.toContainText('"a": 1');

  await topControl.click();
  await expect(outputEditor).toContainText('"e": {}');
  await expect(outputEditor).toContainText('"g": 2');

  await resetPreferences(page);
  await app.close();
});

test('keeps inline fold controls aligned with Monaco TypeScript folding', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

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

  await dispatchPaste(
    page,
    [
      'interface User {',
      '  name: string;',
      '}',
      '',
      'function greet(user: User): string {',
      '  return user.name;',
      '}',
    ].join('\n'),
  );

  const outputEditor = page.getByTestId('output-editor');
  await expect(outputEditor.locator('.monaco-editor')).toBeVisible();

  const inlineControl = page.getByRole('button', { name: /Collapse folded block at line/ }).first();
  await expect(inlineControl).toBeVisible();

  await inlineControl.click();
  await expect(outputEditor).not.toContainText('name: string;');

  const expandInlineControl = page
    .getByRole('button', { name: /Expand folded block at line/ })
    .first();
  await expandInlineControl.click();
  await expect(outputEditor).toContainText('name: string;');

  await resetPreferences(page);
  await app.close();
});
