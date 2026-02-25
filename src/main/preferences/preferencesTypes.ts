import {
  CURRENT_PREFERENCES_VERSION,
  DEFAULT_INDENT_SIZE,
  type AgentConfig,
  type AgentPromptDelivery,
  type IndentSize,
  type Preferences,
  type PreferencesPatch,
} from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import { createDefaultPreferences } from './preferencesDefaults';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isThemeMode = (value: unknown): value is ThemeMode => {
  return value === 'light' || value === 'dark';
};

export const isIndentSize = (value: unknown): value is IndentSize => {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
};

export const isAgentPromptDelivery = (value: unknown): value is AgentPromptDelivery => {
  return value === 'arg' || value === 'stdin';
};

const isPositiveInteger = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
};

export const isAgentConfig = (value: unknown): value is AgentConfig => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.executable) &&
    isStringArray(value.argsTemplate) &&
    isNonEmptyString(value.promptTemplate) &&
    isAgentPromptDelivery(value.promptDelivery) &&
    typeof value.enabled === 'boolean' &&
    isPositiveInteger(value.timeoutMs) &&
    isPositiveInteger(value.maxOutputBytes)
  );
};

const hasUniqueAgentIds = (agents: AgentConfig[]): boolean => {
  const ids = new Set<string>();

  for (const agent of agents) {
    if (ids.has(agent.id)) {
      return false;
    }

    ids.add(agent.id);
  }

  return true;
};

const isAgentConfigArray = (value: unknown): value is AgentConfig[] => {
  if (!Array.isArray(value)) {
    return false;
  }

  if (!value.every((agent) => isAgentConfig(agent))) {
    return false;
  }

  return hasUniqueAgentIds(value);
};

export const isPreferencesPatch = (value: unknown): value is PreferencesPatch => {
  if (!isRecord(value)) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (
      key !== 'themeMode' &&
      key !== 'indentSize' &&
      key !== 'agents' &&
      key !== 'fallbackAgentId'
    ) {
      return false;
    }
  }

  if ('themeMode' in value) {
    const { themeMode } = value;
    if (themeMode !== undefined && !isThemeMode(themeMode)) {
      return false;
    }
  }

  if ('indentSize' in value) {
    const { indentSize } = value;
    if (indentSize !== undefined && !isIndentSize(indentSize)) {
      return false;
    }
  }

  if ('agents' in value) {
    const { agents } = value;
    if (agents !== undefined && !isAgentConfigArray(agents)) {
      return false;
    }
  }

  if ('fallbackAgentId' in value) {
    const { fallbackAgentId } = value;
    if (
      fallbackAgentId !== undefined &&
      fallbackAgentId !== null &&
      typeof fallbackAgentId !== 'string'
    ) {
      return false;
    }
  }

  return true;
};

const cloneAgents = (agents: AgentConfig[]): AgentConfig[] => {
  return agents.map((agent) => ({
    ...agent,
    argsTemplate: [...agent.argsTemplate],
  }));
};

const migrateAgents = (value: unknown): AgentConfig[] => {
  const { agents: defaultAgents } = createDefaultPreferences();

  if (!Array.isArray(value)) {
    return cloneAgents(defaultAgents);
  }

  const migrated: AgentConfig[] = [];
  const seenIds = new Set<string>();

  for (const entry of value) {
    if (!isAgentConfig(entry) || seenIds.has(entry.id)) {
      continue;
    }

    seenIds.add(entry.id);
    migrated.push({
      ...entry,
      argsTemplate: [...entry.argsTemplate],
    });
  }

  return migrated.length > 0 ? migrated : cloneAgents(defaultAgents);
};

const migrateFallbackAgentId = (value: unknown, agents: AgentConfig[]): string | null => {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return agents.some((agent) => agent.id === value && agent.enabled) ? value : null;
};

export const migratePreferences = (value: unknown): Preferences | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (!isThemeMode(value.themeMode)) {
    return null;
  }

  const indentSize = isIndentSize(value.indentSize) ? value.indentSize : DEFAULT_INDENT_SIZE;

  if (value.version === 1) {
    const defaults = createDefaultPreferences();

    return {
      version: CURRENT_PREFERENCES_VERSION,
      themeMode: value.themeMode,
      indentSize,
      agents: cloneAgents(defaults.agents),
      fallbackAgentId: defaults.fallbackAgentId,
    };
  }

  if (value.version !== CURRENT_PREFERENCES_VERSION) {
    return null;
  }

  const agents = migrateAgents(value.agents);

  return {
    version: CURRENT_PREFERENCES_VERSION,
    themeMode: value.themeMode,
    indentSize,
    agents,
    fallbackAgentId: migrateFallbackAgentId(value.fallbackAgentId, agents),
  };
};
