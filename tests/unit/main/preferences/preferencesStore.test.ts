// @vitest-environment node

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import { CODEX_APP_EXECUTABLE_PATH } from '../../../../src/main/preferences/agentExecutablePaths';
import { createDefaultPreferences } from '../../../../src/main/preferences/preferencesDefaults';
import { PreferencesStore } from '../../../../src/main/preferences/preferencesStore';

const readJson = async (path: string): Promise<unknown> => {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
};

describe('PreferencesStore', () => {
  const createdDirs: string[] = [];
  const createDefaults = (): Preferences => createDefaultPreferences();

  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  const createStore = async (
    getTimestamp: () => number = Date.now,
  ): Promise<{ directory: string; store: PreferencesStore; filePath: string }> => {
    const directory = await mkdtemp(join(tmpdir(), 'prettypretty-preferences-'));
    createdDirs.push(directory);
    const filePath = join(directory, 'preferences.json');
    return {
      directory,
      store: new PreferencesStore(directory, getTimestamp),
      filePath,
    };
  };

  it('creates defaults when the file does not exist', async () => {
    const { filePath, store } = await createStore();
    const defaults = createDefaults();

    const preferences = await store.load();

    expect(preferences).toEqual(defaults);
    await expect(readJson(filePath)).resolves.toEqual(defaults);
  });

  it('persists and reloads saved preferences', async () => {
    const { directory, store } = await createStore();
    const persisted: Preferences = { ...createDefaults(), themeMode: 'dark', indentSize: 4 };

    await store.save(persisted);

    const reloaded = await new PreferencesStore(directory).load();
    expect(reloaded).toEqual(persisted);
  });

  it('recovers from malformed JSON by archiving the file and restoring defaults', async () => {
    const timestamp = 1730000000000;
    const { directory, filePath, store } = await createStore(() => timestamp);
    const defaults = createDefaults();
    await writeFile(filePath, '{"themeMode":', 'utf8');

    const recovered = await store.load();
    const corruptPath = join(directory, `preferences.corrupt.${timestamp.toString()}.json`);

    expect(recovered).toEqual(defaults);
    await expect(readFile(corruptPath, 'utf8')).resolves.toBe('{"themeMode":');
    await expect(readJson(filePath)).resolves.toEqual(defaults);
  });

  it('recovers when stored values are invalid or unsupported', async () => {
    const timestamp = 1730000000001;
    const { directory, filePath, store } = await createStore(() => timestamp);
    const defaults = createDefaults();
    await writeFile(filePath, JSON.stringify({ version: 99, themeMode: 'dark' }), 'utf8');

    const recovered = await store.load();
    const files = await readdir(directory);

    expect(recovered).toEqual(defaults);
    expect(files).toContain(`preferences.corrupt.${timestamp.toString()}.json`);
    await expect(readJson(filePath)).resolves.toEqual(defaults);
  });

  it('migrates legacy version-1 payloads with defaults for new fields', async () => {
    const { directory, filePath, store } = await createStore();
    const defaults = createDefaults();
    await writeFile(filePath, JSON.stringify({ version: 1, themeMode: 'dark' }), 'utf8');

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded).toEqual({
      ...defaults,
      themeMode: 'dark',
    });
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('migrates invalid indent size in version-1 payload to default without rolling file to corrupt', async () => {
    const { directory, filePath, store } = await createStore();
    const defaults = createDefaults();
    await writeFile(
      filePath,
      JSON.stringify({ version: 1, themeMode: 'dark', indentSize: 99 }),
      'utf8',
    );

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded).toEqual({
      ...defaults,
      themeMode: 'dark',
    });
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('migrates invalid fallback agent id in current version payload to null', async () => {
    const { directory, filePath, store } = await createStore();
    const defaults = createDefaults();
    await writeFile(
      filePath,
      JSON.stringify({
        ...defaults,
        fallbackAgentId: 'missing',
      }),
      'utf8',
    );

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded.fallbackAgentId).toBeNull();
    expect(loaded.agents).toEqual(defaults.agents);
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('migrates fallback agent id to null when target agent is disabled', async () => {
    const { directory, filePath, store } = await createStore();
    const defaults = createDefaults();
    const agents = defaults.agents.map((agent) =>
      agent.id === 'amp' ? { ...agent, enabled: false } : agent,
    );
    await writeFile(
      filePath,
      JSON.stringify({
        ...defaults,
        agents,
        fallbackAgentId: 'amp',
      }),
      'utf8',
    );

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded.fallbackAgentId).toBeNull();
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('migrates invalid agents in current version payload to defaults', async () => {
    const { directory, filePath, store } = await createStore();
    const defaults = createDefaults();
    await writeFile(
      filePath,
      JSON.stringify({
        ...defaults,
        agents: [{ id: 'bad' }],
      }),
      'utf8',
    );

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded.agents).toEqual(defaults.agents);
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('migrates codex executable to app path when stored as bare command', async () => {
    const { filePath, store } = await createStore();
    const defaults = createDefaults();
    const agents = defaults.agents.map((agent) =>
      agent.id === 'codex' ? { ...agent, executable: 'codex' } : agent,
    );

    await writeFile(
      filePath,
      JSON.stringify({
        ...defaults,
        agents,
        fallbackAgentId: 'codex',
      }),
      'utf8',
    );

    const loaded = await store.load();
    const codexAgent = loaded.agents.find((agent) => agent.id === 'codex');

    expect(codexAgent).toBeDefined();
    expect(codexAgent?.executable).toBe(CODEX_APP_EXECUTABLE_PATH);
    expect(loaded.fallbackAgentId).toBe('codex');
  });

  it('writes atomically and does not leave temporary files behind', async () => {
    const { directory, filePath, store } = await createStore();
    const next: Preferences = { ...createDefaults(), themeMode: 'dark', indentSize: 7 };

    await store.save(next);

    const files = await readdir(directory);
    expect(files).toContain('preferences.json');
    expect(files).not.toContain('preferences.json.tmp');
    await expect(readJson(filePath)).resolves.toEqual(next);
  });
});
