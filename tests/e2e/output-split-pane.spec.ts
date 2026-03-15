import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { join } from 'node:path';

const STRUCTURAL_SPLIT_FIXTURE = JSON.stringify(
  {
    root: {
      branch: {
        twig: {
          leaf: 1,
        },
        other: true,
      },
      alt: {
        value: 2,
      },
    },
    outside: false,
  },
  null,
  0,
);
const SPLIT_SETTLE_MS = 400;

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

const clickOutputLine = async (page: Page, testId: string, text: string): Promise<void> => {
  const line = page
    .locator(`[data-testid="${testId}"] .view-line`)
    .filter({ hasText: text })
    .first();
  await expect(line).toBeVisible();
  await line.scrollIntoViewIfNeeded();
  await line.click({ force: true });
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

const readPaneStripState = async (
  page: Page,
): Promise<{
  paneCount: number;
  leftVisiblePaneIndex: number;
  paneWidth: number;
  scrollLeft: number;
  snappedPaneIndex: number;
}> => {
  return await page.evaluate(() => {
    const runtime = globalThis as unknown as {
      document?: {
        querySelector: (selector: string) => {
          dataset?: Record<string, string | undefined>;
          clientWidth?: number;
          scrollLeft?: number;
        } | null;
      };
    };
    const strip = runtime.document?.querySelector('[data-testid="output-pane-strip"]');
    if (!strip) {
      return {
        paneCount: 0,
        leftVisiblePaneIndex: 0,
        paneWidth: 0,
        scrollLeft: 0,
        snappedPaneIndex: 0,
      };
    }

    const paneCount = Number(strip.dataset?.paneCount ?? '0');
    const leftVisiblePaneIndex = Number(strip.dataset?.leftVisiblePaneIndex ?? '0');
    const paneWidth =
      strip.dataset?.split === 'true' ? (strip.clientWidth ?? 0) / 2 : (strip.clientWidth ?? 0);
    return {
      paneCount,
      leftVisiblePaneIndex,
      paneWidth,
      scrollLeft: strip.scrollLeft ?? 0,
      snappedPaneIndex: paneWidth > 0 ? Math.round((strip.scrollLeft ?? 0) / paneWidth) : 0,
    };
  });
};

const expectPaneStripViewport = async (
  page: Page,
  expected: { paneCount: number; leftVisiblePaneIndex: number },
): Promise<void> => {
  await expect
    .poll(async () => {
      const state = await readPaneStripState(page);
      const scrollAligned =
        state.paneWidth === 0
          ? true
          : Math.abs(state.scrollLeft - expected.leftVisiblePaneIndex * state.paneWidth) < 2;
      return {
        paneCount: state.paneCount,
        leftVisiblePaneIndex: state.leftVisiblePaneIndex,
        snappedPaneIndex: state.snappedPaneIndex,
        scrollAligned,
      };
    })
    .toEqual({
      paneCount: expected.paneCount,
      leftVisiblePaneIndex: expected.leftVisiblePaneIndex,
      snappedPaneIndex: expected.leftVisiblePaneIndex,
      scrollAligned: true,
    });
};

const dispatchCtrlWheelOnStrip = async (
  page: Page,
  delta: { deltaX?: number; deltaY?: number },
): Promise<void> => {
  await page.evaluate(({ deltaX = 0, deltaY = 0 }) => {
    const runtime = globalThis as unknown as {
      WheelEvent: new (
        type: string,
        init?: {
          bubbles?: boolean;
          cancelable?: boolean;
          ctrlKey?: boolean;
          deltaX?: number;
          deltaY?: number;
        },
      ) => Event;
      document?: {
        querySelector: (selector: string) => { dispatchEvent: (event: Event) => boolean } | null;
      };
    };
    const strip = runtime.document?.querySelector('[data-testid="output-pane-strip"]');
    if (!strip) {
      return;
    }

    strip.dispatchEvent(
      new runtime.WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaX,
        deltaY,
      }),
    );
  }, delta);
};

const openRecursiveSplitChain = async (page: Page): Promise<void> => {
  await dispatchPaste(page, STRUCTURAL_SPLIT_FIXTURE);
  await expect(
    page
      .locator('[data-testid="output-editor"] [data-testid="output-inline-fold-control"]')
      .first(),
  ).toBeVisible();

  await ctrlClickOutputLine(page, 'output-editor', '"root"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectPaneStripViewport(page, { paneCount: 2, leftVisiblePaneIndex: 0 });
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"branch": {');

  await ctrlClickOutputLine(page, 'output-editor-pane-1', '"branch"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-2')).join('\n'))
    .toContain('"branch": {');
};

test('opens recursive output splits, snaps the viewport, and pops the rightmost pane', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await openRecursiveSplitChain(page);
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });

  await ctrlClickOutputLine(page, 'output-editor-pane-2', '"twig"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-3')).join('\n'))
    .toContain('"leaf": 1');
  await expect(page.locator('[data-testid="output-editor-pane-1"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="output-editor-pane-2"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="output-editor-pane-3"]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="output-editor-pane-3"]')).toHaveCount(0);
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });

  await page.getByRole('button', { name: 'Pop split' }).click();
  await expect(page.locator('[data-testid="output-editor-pane-2"]')).toHaveCount(0);
  await expectPaneStripViewport(page, { paneCount: 2, leftVisiblePaneIndex: 0 });
  await expect(page.getByRole('button', { name: 'Navigate splits left' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Navigate splits right' })).toBeDisabled();

  await resetPreferences(page);
  await app.close();
});

test('preserves off-screen pane state and supports toolbar, keyboard, and wheel split navigation', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await openRecursiveSplitChain(page);
  await clickOutputLine(page, 'output-editor-pane-1', '"branch"');
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await expect
    .poll(async () => await readVisibleLineNumbers(page, 'output-editor-pane-1'))
    .toEqual(['2']);

  await ctrlClickOutputLine(page, 'output-editor-pane-2', '"twig"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });

  await page.getByRole('button', { name: 'Navigate splits left' }).click();
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 1 });
  await expect
    .poll(async () => await readVisibleLineNumbers(page, 'output-editor-pane-1'))
    .toEqual(['2']);

  await page.keyboard.press('Control+ArrowRight');
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await expect
    .poll(async () => await readVisibleLineNumbers(page, 'output-editor-pane-3'))
    .toEqual(['4']);

  await dispatchCtrlWheelOnStrip(page, { deltaY: -140 });
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 1 });
  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"alt": {');

  await ctrlClickOutputLine(page, 'output-editor-pane-1', '"alt"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expect(page.locator('[data-testid="output-editor-pane-3"]')).toHaveCount(0);
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-2')).join('\n'))
    .toContain('"value": 2');
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-2')).join('\n'))
    .not.toContain('"twig": {');

  await resetPreferences(page);
  await app.close();
});
