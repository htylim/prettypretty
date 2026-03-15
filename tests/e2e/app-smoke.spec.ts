import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

type RectSnapshot = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerY: number;
};

type BrowserRect = Omit<RectSnapshot, 'centerY'>;

type BrowserElement = {
  textContent?: string | null;
  getBoundingClientRect: () => BrowserRect;
  querySelector: (selector: string) => BrowserElement | null;
  querySelectorAll: (selector: string) => BrowserElement[];
};

type BrowserRange = {
  getBoundingClientRect: () => BrowserRect;
  selectNodeContents: (node: unknown) => void;
};

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

const readInlineFoldControlGeometry = async (
  page: Page,
  lineNumber: number,
  lineText: string,
): Promise<{
  line: RectSnapshot | null;
  lineText: RectSnapshot | null;
  self: RectSnapshot | null;
}> =>
  page.evaluate(
    ({ lineNumber: targetLineNumber, lineText: targetLineText }) => {
      const runtime = globalThis as unknown as {
        document?: {
          createRange: () => BrowserRange;
          querySelector: (selector: string) => BrowserElement | null;
        };
      };
      const editor = runtime.document?.querySelector('[data-testid="output-editor"]');
      if (!editor) {
        return {
          self: null,
          line: null,
          lineText: null,
        };
      }

      const toRect = (rect: BrowserRect | null): RectSnapshot | null => {
        if (!rect) {
          return null;
        }

        return {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          centerY: rect.top + rect.height / 2,
        };
      };

      const normalizeText = (value: string | null | undefined): string =>
        value?.replace(/\u00a0/g, ' ') ?? '';
      const line = [...editor.querySelectorAll('.view-line')].find((element) =>
        normalizeText(element.textContent).includes(targetLineText),
      );
      const lineRange = line ? (runtime.document?.createRange() ?? null) : null;
      if (line && lineRange) {
        lineRange.selectNodeContents(line);
      }

      return {
        self: toRect(
          editor
            .querySelector(
              `[data-testid="output-inline-fold-control"][data-line-number="${targetLineNumber}"]`,
            )
            ?.getBoundingClientRect() ?? null,
        ),
        line: toRect(line?.getBoundingClientRect() ?? null),
        lineText: toRect(lineRange?.getBoundingClientRect() ?? null),
      };
    },
    { lineNumber, lineText },
  );

const expectInlineFoldControlsAnchored = async (
  page: Page,
  lineNumber: number,
  lineText: string,
): Promise<void> => {
  const geometry = await readInlineFoldControlGeometry(page, lineNumber, lineText);
  if (!geometry.self || !geometry.line || !geometry.lineText) {
    throw new Error('Expected inline fold geometry');
  }

  expect(Math.abs(geometry.self.centerY - geometry.line.centerY)).toBeLessThan(8);
  expect(geometry.self.left).toBeGreaterThan(geometry.lineText.right - 4);
  expect(geometry.self.left - geometry.lineText.right).toBeLessThan(64);
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
  await expect(
    outputEditor.locator('[data-testid="output-inline-fold-control"][data-line-number="3"]'),
  ).toHaveAttribute('aria-label', 'Collapse folded block at line 3');

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

test('holding Ctrl switches the inline fold control to direct-child behavior', async () => {
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
  await expect(topControl).toHaveAttribute('data-fold-action-scope', 'children');
  await expect(topControl).toHaveAttribute('aria-label', 'Collapse direct child blocks at line 3');

  await topControl.click();
  await expect(outputEditor).toContainText('"d": {');
  await expect(outputEditor).toContainText('"f": {');
  await expect(outputEditor).not.toContainText('"e": {}');
  await expect(outputEditor).not.toContainText('"g": 2');

  await expect(topControl).toHaveAttribute('data-fold-action', 'expand');
  await expect(topControl).toHaveAttribute('aria-label', 'Expand direct child blocks at line 3');
  await page.keyboard.up('Control');

  await topControl.click();
  await expect(outputEditor).not.toContainText('"a": 1');
  await expect(topControl).toHaveAttribute('aria-label', 'Expand folded block at line 3');

  await page.keyboard.down('Control');
  await expect(topControl).toHaveAttribute('aria-label', 'Expand direct child blocks at line 3');
  await topControl.click();
  await expect(outputEditor).not.toContainText('"a": 1');
  await page.keyboard.up('Control');

  await topControl.click();
  await expect(outputEditor).toContainText('"e": {}');
  await expect(outputEditor).toContainText('"g": 2');

  await resetPreferences(page);
  await app.close();
});

test('keeps the inline fold button anchored to the fold-start line across mode changes', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);
  await dispatchPaste(page, '{"outer":{"top":{"a":1,"d":{"e":{}},"f":{"g":2}}}}');

  const outputEditor = page.getByTestId('output-editor');
  const topControl = outputEditor.locator(
    '[data-testid="output-inline-fold-control"][data-line-number="3"]',
  );

  await expect(topControl).toBeVisible();
  await expectInlineFoldControlsAnchored(page, 3, '"top"');

  await page.keyboard.down('Control');
  await topControl.click();
  await expect(outputEditor).not.toContainText('"e": {}');
  await expectInlineFoldControlsAnchored(page, 3, '"top"');
  await page.keyboard.up('Control');

  await topControl.click();
  await expect(topControl).toHaveAttribute('aria-label', 'Expand folded block at line 3');
  await expectInlineFoldControlsAnchored(page, 3, '"top"');

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
