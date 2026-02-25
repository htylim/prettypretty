// @vitest-environment node

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preferences } from '../../../../src/shared/preferences';
import { PreferencesStore } from '../../../../src/main/preferences/preferencesStore';

const readJson = async (path: string): Promise<unknown> => {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
};

describe('PreferencesStore', () => {
  const createdDirs: string[] = [];

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

    const preferences = await store.load();

    expect(preferences).toEqual({ version: 1, themeMode: 'light', indentSize: 2 });
    await expect(readJson(filePath)).resolves.toEqual({
      version: 1,
      themeMode: 'light',
      indentSize: 2,
    });
  });

  it('persists and reloads saved preferences', async () => {
    const { directory, store } = await createStore();
    const persisted: Preferences = { version: 1, themeMode: 'dark', indentSize: 4 };

    await store.save(persisted);

    const reloaded = await new PreferencesStore(directory).load();
    expect(reloaded).toEqual(persisted);
  });

  it('recovers from malformed JSON by archiving the file and restoring defaults', async () => {
    const timestamp = 1730000000000;
    const { directory, filePath, store } = await createStore(() => timestamp);
    await writeFile(filePath, '{"themeMode":', 'utf8');

    const recovered = await store.load();
    const corruptPath = join(directory, `preferences.corrupt.${timestamp.toString()}.json`);

    expect(recovered).toEqual({ version: 1, themeMode: 'light', indentSize: 2 });
    await expect(readFile(corruptPath, 'utf8')).resolves.toBe('{"themeMode":');
    await expect(readJson(filePath)).resolves.toEqual({
      version: 1,
      themeMode: 'light',
      indentSize: 2,
    });
  });

  it('recovers when stored values are invalid or unsupported', async () => {
    const timestamp = 1730000000001;
    const { directory, filePath, store } = await createStore(() => timestamp);
    await writeFile(filePath, JSON.stringify({ version: 2, themeMode: 'dark' }), 'utf8');

    const recovered = await store.load();
    const files = await readdir(directory);

    expect(recovered).toEqual({ version: 1, themeMode: 'light', indentSize: 2 });
    expect(files).toContain(`preferences.corrupt.${timestamp.toString()}.json`);
    await expect(readJson(filePath)).resolves.toEqual({
      version: 1,
      themeMode: 'light',
      indentSize: 2,
    });
  });

  it('migrates legacy version-1 payloads missing indent size without rolling file to corrupt', async () => {
    const { directory, filePath, store } = await createStore();
    await writeFile(filePath, JSON.stringify({ version: 1, themeMode: 'dark' }), 'utf8');

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded).toEqual({ version: 1, themeMode: 'dark', indentSize: 2 });
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('migrates invalid indent size in version-1 payload to default without rolling file to corrupt', async () => {
    const { directory, filePath, store } = await createStore();
    await writeFile(
      filePath,
      JSON.stringify({ version: 1, themeMode: 'dark', indentSize: 99 }),
      'utf8',
    );

    const loaded = await store.load();
    const files = await readdir(directory);

    expect(loaded).toEqual({ version: 1, themeMode: 'dark', indentSize: 2 });
    expect(files.some((name) => name.startsWith('preferences.corrupt.'))).toBe(false);
  });

  it('writes atomically and does not leave temporary files behind', async () => {
    const { directory, filePath, store } = await createStore();
    const next: Preferences = { version: 1, themeMode: 'dark', indentSize: 7 };

    await store.save(next);

    const files = await readdir(directory);
    expect(files).toContain('preferences.json');
    expect(files).not.toContain('preferences.json.tmp');
    await expect(readJson(filePath)).resolves.toEqual(next);
  });
});
