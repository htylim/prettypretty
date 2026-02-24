import type { Preferences, PreferencesPatch } from '../../shared/preferences';
import { createDefaultPreferences } from './preferencesDefaults';
import { isPreferencesPatch } from './preferencesTypes';

export interface PreferencesPersistence {
  load: () => Promise<Preferences>;
  save: (preferences: Preferences) => Promise<void>;
}

export class PreferencesService {
  private cache: Preferences | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store: PreferencesPersistence) {}

  async getAll(): Promise<Preferences> {
    await this.writeQueue;
    const current = await this.loadCurrent();
    return { ...current };
  }

  async update(patch: PreferencesPatch): Promise<Preferences> {
    if (!isPreferencesPatch(patch)) {
      throw new Error('Invalid preferences patch payload');
    }

    return await this.enqueue(async () => {
      const current = await this.loadCurrent();
      const nextThemeMode = patch.themeMode ?? current.themeMode;

      if (nextThemeMode === current.themeMode) {
        return { ...current };
      }

      const next: Preferences = {
        ...current,
        themeMode: nextThemeMode,
      };

      await this.store.save(next);
      this.cache = next;
      return { ...next };
    });
  }

  async reset(): Promise<Preferences> {
    return await this.enqueue(async () => {
      const defaults = createDefaultPreferences();
      await this.store.save(defaults);
      this.cache = defaults;
      return { ...defaults };
    });
  }

  private async loadCurrent(): Promise<Preferences> {
    if (this.cache) {
      return this.cache;
    }

    const loaded = await this.store.load();
    this.cache = loaded;
    return loaded;
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const operationPromise = this.writeQueue.then(operation, operation);
    this.writeQueue = operationPromise.then(
      () => undefined,
      () => undefined,
    );
    return await operationPromise;
  }
}
