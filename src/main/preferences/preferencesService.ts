import type { Preferences, PreferencesPatch } from '../../shared/preferences';
import { createDefaultPreferences } from './preferencesDefaults';
import { isPreferencesPatch } from './preferencesTypes';

export interface PreferencesPersistence {
  load: () => Promise<Preferences>;
  save: (preferences: Preferences) => Promise<void>;
}

const cloneAgents = (agents: Preferences['agents']): Preferences['agents'] => {
  return agents.map((agent) => ({
    ...agent,
    argsTemplate: [...agent.argsTemplate],
  }));
};

const clonePreferences = (preferences: Preferences): Preferences => ({
  ...preferences,
  agents: cloneAgents(preferences.agents),
});

const areAgentsEqual = (left: Preferences['agents'], right: Preferences['agents']): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((agent, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    if (
      agent.id !== other.id ||
      agent.name !== other.name ||
      agent.executable !== other.executable ||
      agent.promptTemplate !== other.promptTemplate ||
      agent.promptDelivery !== other.promptDelivery ||
      agent.enabled !== other.enabled ||
      agent.timeoutMs !== other.timeoutMs ||
      agent.maxOutputBytes !== other.maxOutputBytes ||
      agent.argsTemplate.length !== other.argsTemplate.length
    ) {
      return false;
    }

    return agent.argsTemplate.every(
      (argument, argIndex) => argument === other.argsTemplate[argIndex],
    );
  });
};

const resolveFallbackAgentId = (
  fallbackAgentId: string | null,
  agents: Preferences['agents'],
): string | null => {
  if (fallbackAgentId === null) {
    return null;
  }

  const agent = agents.find((entry) => entry.id === fallbackAgentId);
  return agent && agent.enabled ? fallbackAgentId : null;
};

export class PreferencesService {
  private cache: Preferences | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store: PreferencesPersistence) {}

  async getAll(): Promise<Preferences> {
    await this.writeQueue;
    const current = await this.loadCurrent();
    return clonePreferences(current);
  }

  async update(patch: PreferencesPatch): Promise<Preferences> {
    if (!isPreferencesPatch(patch)) {
      throw new Error('Invalid preferences patch payload');
    }

    return await this.enqueue(async () => {
      const current = await this.loadCurrent();
      const nextThemeMode = patch.themeMode ?? current.themeMode;
      const nextIndentSize = patch.indentSize ?? current.indentSize;
      const nextFallbackWarningLineThreshold =
        patch.fallbackWarningLineThreshold ?? current.fallbackWarningLineThreshold;
      const nextAgents = patch.agents ? cloneAgents(patch.agents) : current.agents;
      const isFallbackAgentIdPatched = patch.fallbackAgentId !== undefined;
      const requestedFallbackAgentId: string | null = isFallbackAgentIdPatched
        ? (patch.fallbackAgentId ?? null)
        : current.fallbackAgentId;
      const nextFallbackAgentId = resolveFallbackAgentId(requestedFallbackAgentId, nextAgents);

      if (
        isFallbackAgentIdPatched &&
        requestedFallbackAgentId !== null &&
        requestedFallbackAgentId !== nextFallbackAgentId
      ) {
        throw new Error('Invalid fallback agent id');
      }

      if (
        nextThemeMode === current.themeMode &&
        nextIndentSize === current.indentSize &&
        nextFallbackWarningLineThreshold === current.fallbackWarningLineThreshold &&
        nextFallbackAgentId === current.fallbackAgentId &&
        areAgentsEqual(nextAgents, current.agents)
      ) {
        return clonePreferences(current);
      }

      const next: Preferences = {
        ...current,
        themeMode: nextThemeMode,
        indentSize: nextIndentSize,
        fallbackWarningLineThreshold: nextFallbackWarningLineThreshold,
        agents: cloneAgents(nextAgents),
        fallbackAgentId: nextFallbackAgentId,
      };

      await this.store.save(next);
      this.cache = next;
      return clonePreferences(next);
    });
  }

  async reset(): Promise<Preferences> {
    return await this.enqueue(async () => {
      const defaults = createDefaultPreferences();
      await this.store.save(defaults);
      this.cache = defaults;
      return clonePreferences(defaults);
    });
  }

  private async loadCurrent(): Promise<Preferences> {
    if (this.cache) {
      return this.cache;
    }

    const loaded = await this.store.load();
    this.cache = clonePreferences(loaded);
    return this.cache;
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
