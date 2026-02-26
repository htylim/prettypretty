import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Preferences } from '../../shared/preferences';
import { createDefaultPreferences } from './preferencesDefaults';
import { migratePreferences } from './preferencesTypes';

export const PREFERENCES_FILE_NAME = 'preferences.json';

const withTrailingNewline = (value: string): string => {
  return value.endsWith('\n') ? value : `${value}\n`;
};

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const { code } = error;
  return typeof code === 'string' ? code : undefined;
};

export class PreferencesStore {
  private readonly directoryPath: string;
  private readonly filePath: string;
  private readonly getTimestamp: () => number;

  constructor(userDataPath: string, getTimestamp: () => number = Date.now) {
    this.directoryPath = userDataPath;
    this.filePath = join(userDataPath, PREFERENCES_FILE_NAME);
    this.getTimestamp = getTimestamp;
  }

  async load(): Promise<Preferences> {
    await mkdir(this.directoryPath, { recursive: true });

    try {
      const content = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content) as unknown;
      const migrated = migratePreferences(parsed);

      if (migrated) {
        return migrated;
      }

      return await this.recoverFromInvalidFile();
    } catch (error) {
      const errorCode = getErrorCode(error);

      if (errorCode === 'ENOENT') {
        const defaults = createDefaultPreferences();
        await this.save(defaults);
        return defaults;
      }

      if (error instanceof SyntaxError) {
        return await this.recoverFromInvalidFile();
      }

      throw error;
    }
  }

  async save(preferences: Preferences): Promise<void> {
    await mkdir(this.directoryPath, { recursive: true });

    const tempPath = `${this.filePath}.tmp`;
    const payload = withTrailingNewline(JSON.stringify(preferences, null, 2));
    const handle = await open(tempPath, 'w');
    let closed = false;

    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
      await handle.close();
      closed = true;
      await rename(tempPath, this.filePath);
    } catch (error) {
      if (!closed) {
        await handle.close();
      }
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async recoverFromInvalidFile(): Promise<Preferences> {
    const corruptPath = join(
      this.directoryPath,
      `preferences.corrupt.${this.getTimestamp().toString()}.json`,
    );

    try {
      await rename(this.filePath, corruptPath);
    } catch (error) {
      if (getErrorCode(error) !== 'ENOENT') {
        throw error;
      }
    }

    const defaults = createDefaultPreferences();
    await this.save(defaults);
    return defaults;
  }
}
