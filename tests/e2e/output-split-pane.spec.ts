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
  viewportOffset: number;
  snappedPaneIndex: number;
}> => {
  return await page.evaluate(() => {
    const parseViewportOffset = (transform: string | undefined): number => {
      const translateMatch = transform?.match(/translate3d\((-?\d+(?:\.\d+)?)px/u);
      if (translateMatch?.[1]) {
        return Math.abs(Number(translateMatch[1]));
      }

      const matrixMatch = transform?.match(
        /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?)\s*,/u,
      );
      if (matrixMatch?.[1]) {
        return Math.abs(Number(matrixMatch[1]));
      }

      const matrix3dMatch = transform?.match(/matrix3d\((?:[^,]+,\s*){12}(-?\d+(?:\.\d+)?)\s*,/u);
      if (matrix3dMatch?.[1]) {
        return Math.abs(Number(matrix3dMatch[1]));
      }

      return 0;
    };
    const readViewportOffset = (
      track:
        | {
            ownerDocument?: {
              defaultView?: {
                getComputedStyle: (element: unknown) => { transform?: string };
              } | null;
            };
          }
        | null
        | undefined,
    ): number => {
      const transform = track?.ownerDocument?.defaultView?.getComputedStyle(track).transform;
      return parseViewportOffset(transform);
    };
    const runtime = globalThis as unknown as {
      document?: {
        querySelector: (selector: string) => {
          dataset?: Record<string, string | undefined>;
          clientWidth?: number;
          getAttribute?: (name: string) => string | null;
          ownerDocument?: {
            defaultView?: {
              getComputedStyle: (element: unknown) => { transform?: string };
            } | null;
          };
        } | null;
      };
    };
    const strip = runtime.document?.querySelector('[data-testid="output-pane-strip"]');
    const track = runtime.document?.querySelector('[data-testid="output-pane-strip-track"]');
    if (!strip) {
      return {
        paneCount: 0,
        leftVisiblePaneIndex: 0,
        paneWidth: 0,
        viewportOffset: 0,
        snappedPaneIndex: 0,
      };
    }

    const paneCount = Number(strip.dataset?.paneCount ?? '0');
    const leftVisiblePaneIndex = Number(strip.dataset?.leftVisiblePaneIndex ?? '0');
    const paneWidth =
      strip.dataset?.split === 'true' ? (strip.clientWidth ?? 0) / 2 : (strip.clientWidth ?? 0);
    const viewportOffset = readViewportOffset(track);
    return {
      paneCount,
      leftVisiblePaneIndex,
      paneWidth,
      viewportOffset,
      snappedPaneIndex: paneWidth > 0 ? Math.round(viewportOffset / paneWidth) : 0,
    };
  });
};

const startPaneStripMotionCapture = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __paneStripMotionCapture?: {
        samples: number[];
        isActive: boolean;
      };
      document?: {
        querySelector: (selector: string) => {
          ownerDocument?: {
            defaultView?: {
              getComputedStyle: (element: unknown) => { transform?: string };
            } | null;
          };
        } | null;
      };
      requestAnimationFrame?: (callback: () => void) => number;
    };
    const track = runtime.document?.querySelector('[data-testid="output-pane-strip-track"]');
    const readViewportOffset = (): number => {
      const transform = track?.ownerDocument?.defaultView?.getComputedStyle(track).transform;
      const translateMatch = transform?.match(/translate3d\((-?\d+(?:\.\d+)?)px/u);
      if (translateMatch?.[1]) {
        return Math.abs(Number(translateMatch[1]));
      }

      const matrixMatch = transform?.match(
        /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?)\s*,/u,
      );
      if (matrixMatch?.[1]) {
        return Math.abs(Number(matrixMatch[1]));
      }

      const matrix3dMatch = transform?.match(/matrix3d\((?:[^,]+,\s*){12}(-?\d+(?:\.\d+)?)\s*,/u);
      if (matrix3dMatch?.[1]) {
        return Math.abs(Number(matrix3dMatch[1]));
      }

      return 0;
    };
    if (!track || typeof runtime.requestAnimationFrame !== 'function') {
      runtime.__paneStripMotionCapture = {
        samples: [],
        isActive: false,
      };
      return;
    }

    const capture = {
      samples: [readViewportOffset()],
      isActive: true,
    };
    runtime.__paneStripMotionCapture = capture;

    const sampleFrame = (): void => {
      if (!capture.isActive) {
        return;
      }

      capture.samples.push(readViewportOffset());
      runtime.requestAnimationFrame?.(sampleFrame);
    };

    runtime.requestAnimationFrame(sampleFrame);
  });
};

const stopPaneStripMotionCapture = async (
  page: Page,
): Promise<{
  samples: number[];
  finalViewportOffset: number;
  paneWidth: number;
}> => {
  return await page.evaluate(() => {
    const runtime = globalThis as unknown as {
      __paneStripMotionCapture?: {
        samples: number[];
        isActive: boolean;
      };
      document?: {
        querySelector: (selector: string) => {
          clientWidth?: number;
          dataset?: Record<string, string | undefined>;
          ownerDocument?: {
            defaultView?: {
              getComputedStyle: (element: unknown) => { transform?: string };
            } | null;
          };
        } | null;
      };
    };
    const strip = runtime.document?.querySelector('[data-testid="output-pane-strip"]');
    const track = runtime.document?.querySelector('[data-testid="output-pane-strip-track"]');
    const capture = runtime.__paneStripMotionCapture;
    if (!strip || !track || !capture) {
      return {
        samples: [],
        finalViewportOffset: 0,
        paneWidth: 0,
      };
    }

    capture.isActive = false;
    const transform = track.ownerDocument?.defaultView?.getComputedStyle(track).transform;
    const translateMatch = transform?.match(/translate3d\((-?\d+(?:\.\d+)?)px/u);
    const matrixMatch = transform?.match(
      /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*(-?\d+(?:\.\d+)?)\s*,/u,
    );
    const matrix3dMatch = transform?.match(/matrix3d\((?:[^,]+,\s*){12}(-?\d+(?:\.\d+)?)\s*,/u);
    const finalViewportOffset = translateMatch?.[1]
      ? Math.abs(Number(translateMatch[1]))
      : matrixMatch?.[1]
        ? Math.abs(Number(matrixMatch[1]))
        : matrix3dMatch?.[1]
          ? Math.abs(Number(matrix3dMatch[1]))
          : 0;
    const paneWidth =
      strip.dataset?.split === 'true' ? (strip.clientWidth ?? 0) / 2 : (strip.clientWidth ?? 0);
    const report = {
      samples: [...capture.samples, finalViewportOffset],
      finalViewportOffset,
      paneWidth,
    };
    delete runtime.__paneStripMotionCapture;
    return report;
  });
};

const expectPaneStripMotion = (
  report: {
    samples: number[];
    finalViewportOffset: number;
    paneWidth: number;
  },
  expectedLeftVisiblePaneIndex: number,
): void => {
  const expectedViewportOffset = report.paneWidth * expectedLeftVisiblePaneIndex;
  const minViewportOffset = Math.min(report.samples[0] ?? 0, expectedViewportOffset);
  const maxViewportOffset = Math.max(report.samples[0] ?? 0, expectedViewportOffset);
  const hasIntermediateSample = report.samples.some(
    (sample) => sample > minViewportOffset + 1 && sample < maxViewportOffset - 1,
  );

  expect(report.finalViewportOffset).toBeCloseTo(expectedViewportOffset, 0);
  expect(report.samples.length).toBeGreaterThan(3);
  expect(hasIntermediateSample).toBe(true);
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
          : Math.abs(state.viewportOffset - expected.leftVisiblePaneIndex * state.paneWidth) < 2;
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

const openInitialSplit = async (page: Page): Promise<void> => {
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
};

const expectToolbarSplitPosition = async (page: Page, label: string | null): Promise<void> => {
  const indicator = page.locator('[data-testid="toolbar-splits-position"]');
  if (label === null) {
    await expect(indicator).toHaveCount(0);
    return;
  }

  await expect(indicator).toHaveText(label);
};

const openRecursiveSplitChain = async (page: Page): Promise<void> => {
  await openInitialSplit(page);
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
  await expectToolbarSplitPosition(page, null);

  await openInitialSplit(page);
  await expectToolbarSplitPosition(page, '1 of 1');

  await ctrlClickOutputLine(page, 'output-editor-pane-1', '"branch"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectToolbarSplitPosition(page, '2 of 2');
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });

  await ctrlClickOutputLine(page, 'output-editor-pane-2', '"twig"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectToolbarSplitPosition(page, '3 of 3');
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-3')).join('\n'))
    .toContain('"leaf": 1');
  await expect(page.locator('[data-testid="output-editor-pane-1"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="output-editor-pane-2"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="output-editor-pane-3"]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="output-editor-pane-3"]')).toHaveCount(0);
  await expectToolbarSplitPosition(page, '2 of 2');
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });

  await page.getByRole('button', { name: 'Pop split' }).click();
  await expect(page.locator('[data-testid="output-editor-pane-2"]')).toHaveCount(0);
  await expectToolbarSplitPosition(page, '1 of 1');
  await expectPaneStripViewport(page, { paneCount: 2, leftVisiblePaneIndex: 0 });
  await expect(page.getByRole('button', { name: 'Navigate splits left' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Navigate splits right' })).toBeDisabled();

  await resetPreferences(page);
  await app.close();
});

test('animates pane-strip movement during split-open and keyboard navigation', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await openInitialSplit(page);

  await startPaneStripMotionCapture(page);
  await ctrlClickOutputLine(page, 'output-editor-pane-1', '"branch"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  const splitOpenMotion = await stopPaneStripMotionCapture(page);
  await expectPaneStripViewport(page, { paneCount: 3, leftVisiblePaneIndex: 1 });
  expectPaneStripMotion(splitOpenMotion, 1);

  await ctrlClickOutputLine(page, 'output-editor-pane-2', '"twig"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });

  await startPaneStripMotionCapture(page);
  await page.keyboard.press('Control+ArrowLeft');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  const navigationMotion = await stopPaneStripMotionCapture(page);
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 1 });
  expectPaneStripMotion(navigationMotion, 1);

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
  await expectToolbarSplitPosition(page, '3 of 3');
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });

  await page.getByRole('button', { name: 'Navigate splits left' }).click();
  await expectToolbarSplitPosition(page, '2 of 3');
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 1 });
  await expect
    .poll(async () => await readVisibleLineNumbers(page, 'output-editor-pane-1'))
    .toEqual(['2']);

  await page.keyboard.press('Control+ArrowRight');
  await expectToolbarSplitPosition(page, '3 of 3');
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 2 });
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await expect
    .poll(async () => await readVisibleLineNumbers(page, 'output-editor-pane-3'))
    .toEqual(['4']);

  await dispatchCtrlWheelOnStrip(page, { deltaY: -140 });
  await expectToolbarSplitPosition(page, '2 of 3');
  await expectPaneStripViewport(page, { paneCount: 4, leftVisiblePaneIndex: 1 });
  await page.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect
    .poll(async () => (await readVisibleLineTexts(page, 'output-editor-pane-1')).join('\n'))
    .toContain('"alt": {');

  await ctrlClickOutputLine(page, 'output-editor-pane-1', '"alt"');
  await page.waitForTimeout(SPLIT_SETTLE_MS);
  await expect(page.locator('[data-testid="output-editor-pane-3"]')).toHaveCount(0);
  await expectToolbarSplitPosition(page, '2 of 2');
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
