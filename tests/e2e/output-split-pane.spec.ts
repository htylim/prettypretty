import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { join } from 'node:path';

const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const EMBEDDED_FIXTURE = JSON.stringify(
  {
    payload: '{"query":"{ user { id } }"}',
    variables: '{"id":1}',
    note: 'hello world',
  },
  null,
  2,
);
const PAYLOAD_EMBEDDED_SELECTION_SNIPPET = '"{\\"query\\":\\"{ user { id } }\\"}"';
const VARIABLES_EMBEDDED_VALUE_SNIPPET = '{\\"id\\":1}';
const VARIABLES_EMBEDDED_SELECTION_SNIPPET = '"{\\"id\\":1}"';
const PANE_QUERY_SELECTION_SNIPPET = '"{ user { id } }"';

type ClientRectLike = {
  left: number;
  right: number;
  top: number;
  height: number;
  width: number;
};

const launchApp = async (): Promise<ElectronApplication> => {
  return await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  });
};

const writeClipboardText = async (app: ElectronApplication, text: string): Promise<void> => {
  await app.evaluate(({ clipboard }, nextText) => {
    clipboard.writeText(nextText);
  }, text);
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

const pasteFromClipboardShortcut = async (
  app: ElectronApplication,
  page: Page,
  text: string,
): Promise<void> => {
  await writeClipboardText(app, text);
  await page.bringToFront();
  await page.keyboard.press(PASTE_SHORTCUT);
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

const configureDeterministicFallbackAgent = async (
  page: Page,
  outputText: string,
): Promise<void> => {
  const executableScript = `process.stdin.resume();process.stdin.on('data',()=>{});console.log(${JSON.stringify(
    outputText,
  )});`;
  await page.evaluate(async (nextExecutableScript) => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        preferences: {
          update: (patch: unknown) => Promise<unknown>;
        };
      };
    };

    await bridge.prettypretty.preferences.update({
      agents: [
        {
          id: 'e2e-agent',
          name: 'E2E Agent',
          executable: 'node',
          argsTemplate: ['-e', nextExecutableScript],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: true,
          timeoutMs: 5_000,
          maxOutputBytes: 10_000,
        },
      ],
      fallbackAgentId: 'e2e-agent',
    });
  }, executableScript);
};

const getOutputLineLocator = (page: Page, testId: string, snippet: string) => {
  return page.locator(`[data-testid="${testId}"] .view-line`).filter({ hasText: snippet }).first();
};

const getClickPositionForText = async (
  page: Page,
  testId: string,
  lineSnippet: string,
  targetSnippet: string,
  ratioOffset = 0.5,
): Promise<{ x: number; y: number }> => {
  const line = getOutputLineLocator(page, testId, lineSnippet);
  await expect(line).toBeVisible();
  await line.scrollIntoViewIfNeeded();

  const box = await line.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return { x: 0, y: 0 };
  }

  const ratio = await line.evaluate(
    (element, payload) => {
      const text = element.textContent?.replace(/\u00a0/g, ' ') ?? '';
      const matchIndex = text.indexOf(payload.snippet);
      if (matchIndex === -1 || text.length === 0) {
        return 0.8;
      }

      const targetIndex = matchIndex + payload.snippet.length * payload.ratioOffset;
      return Math.min(0.95, Math.max(0.05, targetIndex / text.length));
    },
    { snippet: targetSnippet, ratioOffset },
  );

  return {
    x: box.width * ratio,
    y: box.height / 2,
  };
};

const dispatchCtrlClickSnippet = async (
  page: Page,
  lineSnippet: string,
  targetSnippet = lineSnippet,
): Promise<void> => {
  const position = await getClickPositionForText(page, 'output-editor', lineSnippet, targetSnippet);
  const line = getOutputLineLocator(page, 'output-editor', lineSnippet);
  const box = await line.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.keyboard.down('Control');
  await page.mouse.click(box.x + position.x, box.y + position.y, {
    button: 'left',
  });
  await page.keyboard.up('Control');
};

const getSelectionDragPositionForText = async (
  page: Page,
  testId: string,
  lineSnippet: string,
  targetSnippet: string,
): Promise<{
  startX: number;
  endX: number;
  y: number;
}> => {
  const line = getOutputLineLocator(page, testId, lineSnippet);
  await expect(line).toBeVisible();
  await line.scrollIntoViewIfNeeded();

  return await line.evaluate((element, snippet) => {
    const text = element.textContent?.replace(/\u00a0/g, ' ') ?? '';
    const matchIndex = text.indexOf(snippet);
    if (matchIndex === -1) {
      const fallbackRect = element.getBoundingClientRect();
      return {
        startX: fallbackRect.left + 8,
        endX: fallbackRect.right - 8,
        y: fallbackRect.top + fallbackRect.height / 2,
      };
    }

    const ownerDocument = element.ownerDocument as {
      createTreeWalker: (
        root: unknown,
        whatToShow?: number,
      ) => {
        nextNode: () => unknown;
      };
      createRange: () => {
        setStart: (node: unknown, offset: number) => void;
        setEnd: (node: unknown, offset: number) => void;
        getClientRects: () => ArrayLike<ClientRectLike>;
        getBoundingClientRect: () => ClientRectLike;
      };
    };
    const showTextNode = 4;
    const walker = ownerDocument.createTreeWalker(element, showTextNode);
    const textNodes: Array<{ textContent: string | null }> = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      textNodes.push(currentNode as { textContent: string | null });
      currentNode = walker.nextNode();
    }

    const resolveBoundary = (index: number) => {
      let remaining = index;
      for (const textNode of textNodes) {
        const nodeLength = textNode.textContent?.length ?? 0;
        if (remaining <= nodeLength) {
          return {
            node: textNode,
            offset: remaining,
          };
        }
        remaining -= nodeLength;
      }

      const lastNode = textNodes.at(-1);
      return lastNode
        ? {
            node: lastNode,
            offset: lastNode.textContent?.length ?? 0,
          }
        : null;
    };

    const startBoundary = resolveBoundary(matchIndex);
    const endBoundary = resolveBoundary(matchIndex + snippet.length);
    if (!startBoundary || !endBoundary) {
      const fallbackRect = element.getBoundingClientRect();
      return {
        startX: fallbackRect.left + 8,
        endX: fallbackRect.right - 8,
        y: fallbackRect.top + fallbackRect.height / 2,
      };
    }

    const range = ownerDocument.createRange();
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
    const rects = Array.from(range.getClientRects());
    const firstRect = rects[0] ?? range.getBoundingClientRect();
    const lastRect = rects.at(-1) ?? firstRect;

    return {
      startX: firstRect.left + Math.min(3, Math.max(1, firstRect.width / 4)),
      endX: lastRect.right - Math.min(3, Math.max(1, lastRect.width / 4)),
      y: firstRect.top + firstRect.height / 2,
    };
  }, targetSnippet);
};

const selectOutputSnippet = async (
  page: Page,
  testId: string,
  lineSnippet: string,
  targetSnippet: string,
): Promise<void> => {
  const position = await getSelectionDragPositionForText(page, testId, lineSnippet, targetSnippet);
  await page.mouse.click(position.startX, position.y);
  await page.keyboard.down('Shift');
  for (let index = 0; index < targetSnippet.length; index += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.up('Shift');
};

const openOutputContextMenuForSelection = async (
  page: Page,
  testId: string,
  lineSnippet: string,
  targetSnippet: string,
): Promise<void> => {
  await selectOutputSnippet(page, testId, lineSnippet, targetSnippet);
  await page.waitForTimeout(100);
  const position = await getSelectionDragPositionForText(page, testId, lineSnippet, targetSnippet);
  await page.mouse.click((position.startX + position.endX) / 2, position.y, {
    button: 'right',
  });
  await expect(page.getByTestId(`${testId}-context-menu`)).toBeVisible();
};

const expectSinglePaneStrip = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-pane-count',
    '1',
  );
  await expect(page.getByRole('button', { name: 'Pop split' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Navigate splits left' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Navigate splits right' })).toBeDisabled();
};

const readEmbeddedHighlightRange = async (page: Page): Promise<string | null> => {
  return await page
    .locator('[data-testid="output-editor"]')
    .getAttribute('data-embedded-highlight-range');
};

test('ctrl-click highlights embedded payloads without opening panes', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, EMBEDDED_FIXTURE);
  await dispatchCtrlClickSnippet(page, '"variables"', VARIABLES_EMBEDDED_VALUE_SNIPPET);
  await expect(page.getByTestId('output-editor-context-menu')).toHaveCount(0);
  await expect.poll(async () => await readEmbeddedHighlightRange(page)).toBe('3:16-3:28');
  await expectSinglePaneStrip(page);

  await resetPreferences(page);
  await app.close();
});

test('ctrl-click on unsupported text clears the embedded highlight and keeps the pane strip stable', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, EMBEDDED_FIXTURE);
  await dispatchCtrlClickSnippet(page, '"payload"');
  await dispatchCtrlClickSnippet(page, '"note"');
  await expect.poll(async () => await readEmbeddedHighlightRange(page)).toBeNull();
  await expectSinglePaneStrip(page);

  await resetPreferences(page);
  await app.close();
});

test('prettify in pane supports repeated nested opens, snapped navigation, and descendant reset', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);
  await configureDeterministicFallbackAgent(page, '{\n  user {\n    id\n  }\n}');

  await dispatchPaste(page, EMBEDDED_FIXTURE);

  await openOutputContextMenuForSelection(
    page,
    'output-editor',
    '"payload"',
    PAYLOAD_EMBEDDED_SELECTION_SNIPPET,
  );
  await page.getByTestId('output-editor-context-menu-prettify-in-pane').click();

  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-pane-count',
    '2',
  );
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"query"');
  await expect(page.getByTestId('output-editor')).toContainText('"payload"');

  await openOutputContextMenuForSelection(
    page,
    'output-editor-pane-1',
    '"query"',
    PANE_QUERY_SELECTION_SNIPPET,
  );
  await page.getByTestId('output-editor-pane-1-context-menu-prettify-in-pane').click();

  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-pane-count',
    '3',
  );
  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-left-visible-pane-index',
    '1',
  );
  await expect(page.getByRole('button', { name: 'Navigate splits left' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Navigate splits right' })).toBeDisabled();
  await expect(page.getByTestId('output-editor-pane-2')).toContainText('user');
  await expect(page.getByTestId('output-editor-pane-2')).toContainText('id');

  await page.getByRole('button', { name: 'Navigate splits left' }).click();
  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-left-visible-pane-index',
    '0',
  );
  await expect(page.getByRole('button', { name: 'Navigate splits left' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Navigate splits right' })).toBeEnabled();

  await page.getByRole('button', { name: 'Navigate splits right' }).click();
  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-left-visible-pane-index',
    '1',
  );

  await page.getByRole('button', { name: 'Navigate splits left' }).click();
  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-left-visible-pane-index',
    '0',
  );

  await openOutputContextMenuForSelection(
    page,
    'output-editor',
    '"variables"',
    VARIABLES_EMBEDDED_SELECTION_SNIPPET,
  );
  await page.getByTestId('output-editor-context-menu-prettify-replace').click();

  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-pane-count',
    '1',
  );
  await expect(page.getByTestId('output-editor-pane-1')).toHaveCount(0);
  await expect(page.getByTestId('output-editor-pane-2')).toHaveCount(0);
  await expect(page.getByTestId('output-editor')).toContainText('"id": 1');
  await expect(page.getByTestId('output-editor')).not.toContainText('"payload"');

  await resetPreferences(page);
  await app.close();
});

test('prettify in pane works after native paste shortcut and real right click selection', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await pasteFromClipboardShortcut(app, page, EMBEDDED_FIXTURE);
  await expect(page.locator('[data-testid="output-editor"] .monaco-editor')).toBeVisible();

  await openOutputContextMenuForSelection(
    page,
    'output-editor',
    '"variables"',
    VARIABLES_EMBEDDED_SELECTION_SNIPPET,
  );
  await page.getByTestId('output-editor-context-menu-prettify-in-pane').click();

  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-pane-count',
    '2',
    {
      timeout: 1_500,
    },
  );
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"id": 1');

  await resetPreferences(page);
  await app.close();
});

test('prettify and replace rewrites the root document through the normal output flow', async () => {
  const app = await launchApp();
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, EMBEDDED_FIXTURE);

  await openOutputContextMenuForSelection(
    page,
    'output-editor',
    '"variables"',
    VARIABLES_EMBEDDED_SELECTION_SNIPPET,
  );
  await page.getByTestId('output-editor-context-menu-prettify-replace').click();

  await expect(page.locator('[data-testid="output-pane-strip"]')).toHaveAttribute(
    'data-pane-count',
    '1',
  );
  await expect(page.getByTestId('output-editor-pane-1')).toHaveCount(0);
  await expect(page.getByTestId('output-editor')).toContainText('"id": 1');
  await expect(page.getByTestId('output-editor')).not.toContainText('"variables"');

  await resetPreferences(page);
  await app.close();
});
