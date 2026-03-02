// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { Preferences, PreferencesPatch } from '../../../../src/shared/preferences';
import { createDefaultPreferences } from '../../../../src/main/preferences/preferencesDefaults';
import { PreferencesService } from '../../../../src/main/preferences/preferencesService';

const createBasePreferences = (): Preferences => createDefaultPreferences();

describe('PreferencesService', () => {
  it('loads and caches preferences through getAll', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn();
    const service = new PreferencesService({ load, save });

    await expect(service.getAll()).resolves.toEqual(basePreferences);
    await expect(service.getAll()).resolves.toEqual(basePreferences);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('updates valid patches and persists the result', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.update({
      themeMode: 'dark',
      indentSize: 4,
      fallbackWarningLineThreshold: 450,
    });

    expect(next).toEqual({
      ...basePreferences,
      themeMode: 'dark',
      indentSize: 4,
      fallbackWarningLineThreshold: 450,
    });
    expect(save).toHaveBeenCalledWith({
      ...basePreferences,
      themeMode: 'dark',
      indentSize: 4,
      fallbackWarningLineThreshold: 450,
    });
  });

  it('updates indent size without changing theme mode', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.update({ indentSize: 6 });

    expect(next).toEqual({ ...basePreferences, indentSize: 6 });
    expect(save).toHaveBeenCalledWith({ ...basePreferences, indentSize: 6 });
  });

  it('updates agents and fallback agent id together', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });
    const nextAgents = basePreferences.agents.map((agent) => ({ ...agent, enabled: true }));

    const next = await service.update({ agents: nextAgents, fallbackAgentId: 'amp' });

    expect(next).toEqual({
      ...basePreferences,
      agents: nextAgents,
      fallbackAgentId: 'amp',
    });
    expect(save).toHaveBeenCalledWith({
      ...basePreferences,
      agents: nextAgents,
      fallbackAgentId: 'amp',
    });
  });

  it('clears fallback agent id when patched agents remove it', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue({ ...basePreferences, fallbackAgentId: 'amp' });
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });
    const nextAgents = basePreferences.agents.filter((agent) => agent.id !== 'amp');

    const next = await service.update({ agents: nextAgents });

    expect(next.fallbackAgentId).toBeNull();
    expect(next.agents).toEqual(nextAgents);
  });

  it('rejects fallback agent id patches pointing to missing agents', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    await expect(service.update({ fallbackAgentId: 'missing' })).rejects.toThrow(
      'Invalid fallback agent id',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects fallback agent id patches when target agent is disabled', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });
    const nextAgents = basePreferences.agents.map((agent) =>
      agent.id === 'codex' ? { ...agent, enabled: false } : agent,
    );

    await expect(service.update({ agents: nextAgents, fallbackAgentId: 'codex' })).rejects.toThrow(
      'Invalid fallback agent id',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects invalid patch payloads', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    await expect(
      service.update({ invalidKey: true } as unknown as PreferencesPatch),
    ).rejects.toThrow('Invalid preferences patch payload');
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects invalid indent size patches', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    await expect(service.update({ indentSize: 9 } as unknown as PreferencesPatch)).rejects.toThrow(
      'Invalid preferences patch payload',
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects invalid fallback warning line threshold patches', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    await expect(
      service.update({ fallbackWarningLineThreshold: 0 } as unknown as PreferencesPatch),
    ).rejects.toThrow('Invalid preferences patch payload');
    expect(save).not.toHaveBeenCalled();
  });

  it('skips writes when a patch is a no-op', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue(basePreferences);
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.update({ themeMode: 'light' });

    expect(next).toEqual(basePreferences);
    expect(save).not.toHaveBeenCalled();
  });

  it('resets preferences back to defaults', async () => {
    const basePreferences = createBasePreferences();
    const load = vi.fn().mockResolvedValue({
      ...basePreferences,
      themeMode: 'dark',
      indentSize: 8,
      fallbackAgentId: 'amp',
    });
    const save = vi.fn().mockResolvedValue(undefined);
    const service = new PreferencesService({ load, save });

    const next = await service.reset();

    expect(next).toEqual(basePreferences);
    expect(save).toHaveBeenCalledWith(basePreferences);
  });

  it('serializes concurrent updates through one write queue', async () => {
    const basePreferences = createBasePreferences();
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

    expect(firstResult).toEqual({ ...basePreferences, themeMode: 'dark' });
    expect(secondResult).toEqual({ ...basePreferences, themeMode: 'light' });
    expect(await service.getAll()).toEqual({ ...basePreferences, themeMode: 'light' });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
