// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { Preferences, PreferencesPatch } from '../../../../src/shared/preferences';
import { PreferencesService } from '../../../../src/main/preferences/preferencesService';

const basePreferences: Preferences = {
  version: 1,
  themeMode: 'light',
};

describe('PreferencesService', () => {
  it('loads and caches preferences through getAll', async () => {
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn();
    const service = new PreferencesService({ load, save });

    await expect(service.getAll()).resolves.toEqual(basePreferences);
    await expect(service.getAll()).resolves.toEqual(basePreferences);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('updates valid patches and persists the result', async () => {
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.update({ themeMode: 'dark' });

    expect(next).toEqual({ version: 1, themeMode: 'dark' });
    expect(save).toHaveBeenCalledWith({ version: 1, themeMode: 'dark' });
  });

  it('rejects invalid patch payloads', async () => {
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    await expect(
      service.update({ invalidKey: true } as unknown as PreferencesPatch),
    ).rejects.toThrow('Invalid preferences patch payload');
    expect(save).not.toHaveBeenCalled();
  });

  it('skips writes when a patch is a no-op', async () => {
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.update({ themeMode: 'light' });

    expect(next).toEqual(basePreferences);
    expect(save).not.toHaveBeenCalled();
  });

  it('resets preferences back to defaults', async () => {
    const load = vi.fn().mockResolvedValue({ version: 1, themeMode: 'dark' });
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.reset();

    expect(next).toEqual(basePreferences);
    expect(save).toHaveBeenCalledWith(basePreferences);
  });

  it('serializes concurrent updates through one write queue', async () => {
    let releaseFirstSave: () => void = () => undefined;
    let saveCount = 0;
    let persisted = basePreferences;
    const firstSaveBlocked = new Promise<void>((resolve) => {
      releaseFirstSave = resolve;
    });

    const load = vi.fn().mockImplementation(async () => persisted);
    const save = vi.fn().mockImplementation(async (preferences: Preferences) => {
      saveCount += 1;
      if (saveCount === 1) {
        await firstSaveBlocked;
      }
      persisted = preferences;
    });

    const service = new PreferencesService({ load, save });

    const firstUpdate = service.update({ themeMode: 'dark' });
    const secondUpdate = service.update({ themeMode: 'light' });

    releaseFirstSave();

    const [firstResult, secondResult] = await Promise.all([firstUpdate, secondUpdate]);

    expect(firstResult).toEqual({ version: 1, themeMode: 'dark' });
    expect(secondResult).toEqual({ version: 1, themeMode: 'light' });
    expect(await service.getAll()).toEqual({ version: 1, themeMode: 'light' });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
