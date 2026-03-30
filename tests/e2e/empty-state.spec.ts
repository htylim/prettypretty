import { expect, launchApp, test } from './support/electronApp';

test('preload bridge exposes app info', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() =>
    Boolean((globalThis as { prettypretty?: unknown }).prettypretty),
  );

  const appInfo = await page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        app: {
          getInfo: () => Promise<{ name: string; version: string }>;
        };
      };
    };
    return bridge.prettypretty.app.getInfo();
  });

  expect(appInfo.name).toBe('prettypretty');
  expect(typeof appInfo.version).toBe('string');

  await app.close();
});

test('keeps the empty-state CTA centered after window resize', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1000, height: 720 });

  await expect(page.getByTestId('empty-state-cta')).toBeVisible();

  const shellBox = await page.getByTestId('editor-shell').boundingBox();
  const ctaBox = await page.getByTestId('empty-state-cta').boundingBox();

  expect(shellBox).not.toBeNull();
  expect(ctaBox).not.toBeNull();

  const shellCenterY = shellBox!.y + shellBox!.height / 2;
  const ctaCenterY = ctaBox!.y + ctaBox!.height / 2;

  expect(Math.abs(ctaCenterY - shellCenterY)).toBeLessThan(24);

  await app.close();
});
