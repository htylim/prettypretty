import type { Page } from '@playwright/test';
import { expect, launchApp, test } from './support/electronApp';

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

const dispatchDrop = async (page: Page, text: string): Promise<void> => {
  await page.evaluate(async (dropText) => {
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

    const dropEvent = new runtime.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        files: [
          {
            text: async () => dropText,
          },
        ],
      },
    });
    shell.dispatchEvent(dropEvent);
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

const updatePreferences = async (page: Page, patch: unknown): Promise<void> => {
  await page.evaluate(async (nextPatch) => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        preferences: {
          update: (nextPatch: unknown) => Promise<unknown>;
        };
      };
    };

    await bridge.prettypretty.preferences.update(nextPatch);
  }, patch);
};

const createWaitingFallbackAgent = () => ({
  id: 'e2e-agent',
  name: 'E2E Agent',
  executable: 'node',
  argsTemplate: [
    '-e',
    "process.stdin.resume();process.stdin.on('data',()=>{});setTimeout(()=>{console.error('late-progress-line');console.log('{\"fromAgent\":true}');},5000);",
  ],
  promptTemplate: '{input}',
  promptDelivery: 'stdin' as const,
  enabled: true,
  timeoutMs: 15_000,
  maxOutputBytes: 10_000,
});

const rightClickOutputLine = async (
  page: Page,
  testId: string,
  lineIndex: number,
  offsetX = 40,
): Promise<void> => {
  const line = page.locator(`[data-testid="${testId}"] .view-line`).nth(lineIndex);
  await expect(line).toBeVisible({ timeout: 10_000 });
  await line.click({
    button: 'right',
    force: true,
    position: { x: offsetX, y: 5 },
  });
};

test('supports ingest parity for drop and paste', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);
  await dispatchDrop(page, '{"via":"drop"}');
  await expect(page.getByTestId('output-editor')).toContainText('"via": "drop"');

  await page.keyboard.press('Meta+Shift+N');
  await expect(page.getByTestId('empty-state-cta')).toBeVisible();
  await dispatchPaste(page, '{"via":"paste"}');
  await expect(page.getByTestId('output-editor')).toContainText('"via": "paste"');

  await resetPreferences(page);
  await app.close();
});

test('runs configured fallback agent for malformed input', async () => {
  const app = await launchApp(test.info());
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

    await bridge.prettypretty.preferences.update({
      agents: [
        {
          id: 'e2e-agent',
          name: 'E2E Agent',
          executable: 'node',
          argsTemplate: [
            '-e',
            "process.stdin.resume();process.stdin.on('data',()=>{});console.error('e2e-progress-line');console.log('{\"fromAgent\":true}');",
          ],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: true,
          timeoutMs: 5_000,
          maxOutputBytes: 10_000,
        },
      ],
      fallbackAgentId: 'e2e-agent',
    });
  });

  await dispatchPaste(page, '{bad');

  await expect(page.getByTestId('output-editor')).toContainText('fromAgent');
  await expect(page.getByTestId('output-editor')).not.toContainText('{bad');

  await resetPreferences(page);
  await app.close();
});

test('keeps plain text on the local path even when a fallback agent is configured', async () => {
  const app = await launchApp(test.info());
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

    await bridge.prettypretty.preferences.update({
      agents: [
        {
          id: 'e2e-agent',
          name: 'E2E Agent',
          executable: 'node',
          argsTemplate: [
            '-e',
            "process.stdin.resume();process.stdin.on('data',()=>{});console.log('{\"fromAgent\":true}');",
          ],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: true,
          timeoutMs: 5_000,
          maxOutputBytes: 10_000,
        },
      ],
      fallbackAgentId: 'e2e-agent',
    });
  });

  await dispatchPaste(page, 'hello world');

  await expect(page.getByTestId('output-editor')).toContainText('hello world');
  await expect(page.getByTestId('output-editor')).not.toContainText('fromAgent');
  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);

  await resetPreferences(page);
  await app.close();
});

test('uses passthrough output for malformed content when fallback is disabled', async () => {
  const app = await launchApp(test.info());
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

    await bridge.prettypretty.preferences.update({
      fallbackAgentId: null,
      agents: [
        {
          id: 'amp',
          name: 'Amp',
          executable: 'amp',
          argsTemplate: ['-x'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
        {
          id: 'codex',
          name: 'Codex',
          executable: 'codex',
          argsTemplate: ['exec', '--skip-git-repo-check', '-'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
      ],
    });
  });

  await dispatchPaste(page, '{bad');

  await expect(page.getByTestId('output-editor')).toContainText('{bad');
  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);

  await resetPreferences(page);
  await app.close();
});

test('prettifies graphql documents locally from direct input', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(
    page,
    'query ListShipments($first: Int){shipments(first:$first){edges{node{id}}}}',
  );

  await expect(page.getByTestId('output-editor')).toContainText('query ListShipments');
  await expect(page.getByTestId('output-editor')).toContainText('shipments(first: $first)');
  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);

  await resetPreferences(page);
  await app.close();
});

test('treats escape in the context-pane fallback selection modal as No and opens passthrough output', async () => {
  let app = await launchApp(test.info());
  let page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await updatePreferences(page, {
    fallbackAgentId: null,
    agents: [createWaitingFallbackAgent()],
  });

  await app.close();
  app = await launchApp(test.info());
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await dispatchPaste(
    page,
    JSON.stringify({
      payload: '{bad',
    }),
  );

  await rightClickOutputLine(page, 'output-editor', 1, 80);
  await page.getByTestId('output-context-menu-prettify').click();
  await expect(page.getByTestId('fallback-confirmation-modal')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('fallback-confirmation-modal')).toHaveCount(0);
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('{bad');

  await resetPreferences(page);
  await app.close();
});

test('keeps passthrough text in the child pane when context-pane fallback is canceled from the wait screen', async () => {
  let app = await launchApp(test.info());
  let page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await updatePreferences(page, {
    agents: [createWaitingFallbackAgent()],
    fallbackAgentId: 'e2e-agent',
  });

  await app.close();
  app = await launchApp(test.info());
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await dispatchPaste(
    page,
    JSON.stringify({
      payload: '{bad',
    }),
  );

  await rightClickOutputLine(page, 'output-editor', 1, 80);
  await page.getByTestId('output-context-menu-prettify').click();
  await expect(page.getByTestId('fallback-wait-screen')).toBeVisible();

  await page.getByTestId('fallback-wait-cancel').click();

  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('{bad');

  await resetPreferences(page);
  await app.close();
});

test('treats escape on the context-pane fallback wait screen as cancel and keeps passthrough output', async () => {
  let app = await launchApp(test.info());
  let page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await updatePreferences(page, {
    agents: [createWaitingFallbackAgent()],
    fallbackAgentId: 'e2e-agent',
  });

  await app.close();
  app = await launchApp(test.info());
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await dispatchPaste(
    page,
    JSON.stringify({
      payload: '{bad',
    }),
  );

  await rightClickOutputLine(page, 'output-editor', 1, 80);
  await page.getByTestId('output-context-menu-prettify').click();
  await expect(page.getByTestId('fallback-wait-screen')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('{bad');

  await resetPreferences(page);
  await app.close();
});

test('opens a recursive prettify child chain from JSON string scalars', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(
    page,
    JSON.stringify({
      payload: JSON.stringify({
        deeper: JSON.stringify({
          leaf: 1,
        }),
      }),
    }),
  );

  await expect(page.getByTestId('output-editor')).toContainText('"payload"');

  await rightClickOutputLine(page, 'output-editor', 1, 80);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"deeper": "{');

  await rightClickOutputLine(page, 'output-editor-pane-1', 1, 80);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-2')).toContainText('"leaf": 1');

  await resetPreferences(page);
  await app.close();
});

test('replaces an extracted-source child pane when context prettify opens a new direct child', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, '{"outer":{"top":{"query":"{ user { id } }","meta":{"ok":true}}}}');

  const outputEditor = page.getByTestId('output-editor');
  const rootControl = outputEditor.locator(
    '[data-testid="output-inline-fold-control"][data-line-number="3"]',
  );

  await rootControl.click({ modifiers: ['Shift'] });

  await expect(page.getByTestId('output-pane-strip')).toHaveAttribute('data-pane-count', '2');
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"top": {');
  await expect(
    page.getByTestId('output-editor-pane-1').locator('.line-numbers').first(),
  ).toHaveText('3');
  await expect(outputEditor.locator('.output-extracted-source-range').first()).toBeVisible();

  await rightClickOutputLine(page, 'output-editor', 3, 80);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-pane-strip')).toHaveAttribute('data-pane-count', '2');
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('user {');
  await expect(
    page.getByTestId('output-editor-pane-1').locator('.line-numbers').first(),
  ).toHaveText('1');
  await expect(outputEditor.locator('.output-extracted-source-range')).toHaveCount(0);

  await resetPreferences(page);
  await app.close();
});

test('resolves YAML block scalars from the output context menu and opens a child pane', async () => {
  const app = await launchApp(test.info());
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

    await bridge.prettypretty.preferences.update({
      fallbackAgentId: null,
      agents: [
        {
          id: 'amp',
          name: 'Amp',
          executable: 'amp',
          argsTemplate: ['-x'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
        {
          id: 'codex',
          name: 'Codex',
          executable: 'codex',
          argsTemplate: ['exec', '--skip-git-repo-check', '-'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
      ],
    });
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await dispatchPaste(page, 'name: hello-world');

  await expect(page.getByTestId('output-editor')).toContainText('name: hello-world');

  await rightClickOutputLine(page, 'output-editor', 0, 10);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-1')).toContainText('hello-world');

  await resetPreferences(page);
  await app.close();
});

test('resolves JavaScript string bindings from the output context menu and opens a child pane', async () => {
  const app = await launchApp(test.info());
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

    await bridge.prettypretty.preferences.update({
      fallbackAgentId: null,
      agents: [
        {
          id: 'amp',
          name: 'Amp',
          executable: 'amp',
          argsTemplate: ['-x'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
        {
          id: 'codex',
          name: 'Codex',
          executable: 'codex',
          argsTemplate: ['exec', '--skip-git-repo-check', '-'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
      ],
    });
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await dispatchPaste(page, 'const query = "{\\"leaf\\":1}";');

  await expect(page.getByTestId('output-editor')).toContainText('const query');

  await rightClickOutputLine(page, 'output-editor', 0, 55);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"leaf": 1');

  await resetPreferences(page);
  await app.close();
});

test('resolves GraphQL block string values from the output context menu and opens a child pane', async () => {
  const app = await launchApp(test.info());
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
    'mutation Update {\n  update(payload: """\n    {\n      "leaf": 1\n    }\n  """)\n}',
  );

  await expect(page.getByTestId('output-editor')).toContainText('payload:');

  await rightClickOutputLine(page, 'output-editor', 2, 40);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"leaf": 1');

  await resetPreferences(page);
  await app.close();
});

test('prettifies graphql query strings from json output context panes locally', async () => {
  const app = await launchApp(test.info());
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
    JSON.stringify({
      query:
        'query ListShipments(\n  $first: Int\n) {\n  shipments(first: $first) {\n    edges {\n      node {\n        id\n      }\n    }\n  }\n}',
      variables: {
        first: 2,
      },
    }),
  );

  await expect(page.getByTestId('output-editor')).toContainText('"query"');

  await rightClickOutputLine(page, 'output-editor', 1, 60);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await expect(page.getByTestId('output-context-menu-prettify')).toBeEnabled();
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-1')).toContainText('query ListShipments(');
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('shipments(first: $first)');
  await expect(page.getByTestId('fallback-wait-screen')).toHaveCount(0);

  await resetPreferences(page);
  await app.close();
});

test('resolves XML attribute values from the output context menu and opens a child pane', async () => {
  const app = await launchApp(test.info());
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

  await dispatchPaste(page, '<request payload="{&quot;leaf&quot;:1}" />');

  await page.waitForSelector('[data-testid="output-editor"]', { timeout: 10_000 });
  await expect(page.getByTestId('output-editor')).toContainText('payload=', { timeout: 10_000 });

  await rightClickOutputLine(page, 'output-editor', 0, 95);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"leaf": 1');

  await resetPreferences(page);
  await app.close();
});

test('resolves SQL quoted string literals from the output context menu and opens a child pane', async () => {
  const app = await launchApp(test.info());
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

    await bridge.prettypretty.preferences.update({
      fallbackAgentId: null,
      agents: [
        {
          id: 'amp',
          name: 'Amp',
          executable: 'amp',
          argsTemplate: ['-x'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
        {
          id: 'codex',
          name: 'Codex',
          executable: 'codex',
          argsTemplate: ['exec', '--skip-git-repo-check', '-'],
          promptTemplate: '{input}',
          promptDelivery: 'stdin',
          enabled: false,
          timeoutMs: 30_000,
          maxOutputBytes: 1_000_000,
        },
      ],
    });
  });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  await dispatchPaste(page, 'select * from requests where payload = \'{"leaf":1}\';');

  await expect(page.getByTestId('output-editor')).toContainText('payload =');

  await rightClickOutputLine(page, 'output-editor', 0, 280);
  await expect(page.getByTestId('output-context-menu-prettify')).toHaveText('Prettify...');
  await page.getByTestId('output-context-menu-prettify').click();

  await page.waitForSelector('[data-testid="output-editor-pane-1"]');
  await expect(page.getByTestId('output-editor-pane-1')).toContainText('"leaf": 1');

  await resetPreferences(page);
  await app.close();
});

test('keeps the context-menu action disabled when the output editor has a selection', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await dispatchPaste(page, '{"payload":"{\\"leaf\\":1}"}');
  await page.locator('[data-testid="output-editor"] .view-line').nth(1).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');

  await rightClickOutputLine(page, 'output-editor', 1, 80);
  await expect(page.getByTestId('output-context-menu-prettify')).toBeDisabled();

  await resetPreferences(page);
  await app.close();
});

test('persists toolbar preferences across app relaunch', async () => {
  const firstRun = await launchApp(test.info());
  const firstPage = await firstRun.firstWindow();
  await firstPage.waitForLoadState('domcontentloaded');
  await resetPreferences(firstPage);

  await firstPage.getByTestId('theme-segment-dark').click();
  await firstPage.getByTestId('indent-size-select').click();
  await firstPage.getByTestId('indent-size-option-6').click();
  await firstPage.getByTestId('fallback-agent-select').click();
  await firstPage.getByTestId('fallback-option-none').click();
  await firstRun.close();

  const secondRun = await launchApp(test.info());
  const secondPage = await secondRun.firstWindow();
  await secondPage.waitForLoadState('domcontentloaded');

  await expect(secondPage.getByTestId('theme-segment-dark')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(secondPage.getByTestId('indent-size-select')).toContainText('Indent: 6');
  await expect(secondPage.getByTestId('fallback-agent-select')).toContainText('No Fallback');

  await resetPreferences(secondPage);
  await secondRun.close();
});

test('opens and reuses log window and streams telemetry log lines', async () => {
  const app = await launchApp(test.info());
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await resetPreferences(page);

  await app.evaluate(({ Menu }) => {
    const appMenu = Menu.getApplicationMenu();
    if (!appMenu) {
      throw new Error('Application menu unavailable');
    }
    const appMenuSection = appMenu.items.find((item) => item.label === 'prettypretty');
    const viewLogItem =
      appMenuSection?.submenu?.items.find((item) => item.label === 'View Log') ?? null;
    if (!viewLogItem) {
      throw new Error('View Log menu item unavailable');
    }
    viewLogItem.click(undefined as never, undefined as never, {} as never);
  });
  await expect
    .poll(
      async () => {
        const windows = app.windows();
        return windows.length;
      },
      { timeout: 5_000 },
    )
    .toBe(2);

  const logWindow = app.windows()[1];
  if (!logWindow) {
    throw new Error('Expected log window to open');
  }

  await expect(logWindow.getByTestId('log-window-content')).toContainText('app.bootstrap.start');

  await page.evaluate(async () => {
    const bridge = globalThis as unknown as {
      prettypretty: {
        telemetry: {
          log: (event: {
            name: 'renderer.ingest.paste';
            meta: { inputLength: number; isEmpty: boolean; source: string };
          }) => Promise<void>;
        };
      };
    };

    await bridge.prettypretty.telemetry.log({
      name: 'renderer.ingest.paste',
      meta: { inputLength: 3, isEmpty: false, source: 'e2e' },
    });
  });

  await expect(logWindow.getByTestId('log-window-content')).toContainText('renderer.ingest.paste');

  await app.evaluate(({ Menu }) => {
    const appMenu = Menu.getApplicationMenu();
    const appMenuSection = appMenu?.items.find((item) => item.label === 'prettypretty') ?? null;
    const viewLogItem =
      appMenuSection?.submenu?.items.find((item) => item.label === 'View Log') ?? null;
    viewLogItem?.click(undefined as never, undefined as never, {} as never);
  });
  await expect
    .poll(
      async () => {
        const windows = app.windows();
        return windows.length;
      },
      { timeout: 5_000 },
    )
    .toBe(2);

  await resetPreferences(page);
  await app.close();
});
