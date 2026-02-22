import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('launches app and renders main window', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });

  const page = await app.firstWindow();
  await expect(page.getByText('Paste, Drop, or Click')).toBeVisible();

  await app.close();
});
