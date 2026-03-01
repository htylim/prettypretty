import type { Preferences } from '../../shared/preferences';
import type { PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';

export type IngestSource = 'open-file' | 'drop' | 'paste';

export type FallbackWaitState = {
  requestId: number;
  formatLabel: string;
  agentName: string;
  progressLine: string | null;
};

export type FallbackAgentOption = {
  id: string;
  name: string;
  enabled: boolean;
};

export const EMPTY_FILE_NOTICE = 'File has no content.';
export const UNKNOWN_FALLBACK_AGENT_NAME = 'fallback agent';

export const getOutputDocumentId = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `output-${(hash >>> 0).toString(16)}-${value.length}`;
};

export const isFileIngestSource = (source: IngestSource): boolean => {
  return source === 'open-file' || source === 'drop';
};

export const getIngestTrigger = (source: IngestSource): PrettifyTrigger => {
  if (source === 'open-file') {
    return 'ingest-open-file';
  }

  if (source === 'drop') {
    return 'ingest-drop';
  }

  return 'ingest-paste';
};

export const getIngestEventName = (source: IngestSource): TelemetryEventName => {
  if (source === 'open-file') {
    return 'renderer.ingest.open-file';
  }

  if (source === 'drop') {
    return 'renderer.ingest.drop';
  }

  return 'renderer.ingest.paste';
};

export const getConfiguredFallbackAgent = (
  preferences: Preferences,
): { shouldWaitForFallback: boolean; agentName: string } => {
  return getConfiguredFallbackAgentFromSelection(
    preferences.fallbackAgentId,
    toFallbackAgentOptions(preferences),
  );
};

export const getConfiguredFallbackAgentFromSelection = (
  fallbackAgentId: string | null,
  fallbackAgentOptions: FallbackAgentOption[],
): { shouldWaitForFallback: boolean; agentName: string } => {
  if (!fallbackAgentId) {
    return {
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    };
  }

  const fallbackAgent = fallbackAgentOptions.find(
    (agentOption) => agentOption.id === fallbackAgentId && agentOption.enabled,
  );

  if (!fallbackAgent) {
    return {
      shouldWaitForFallback: false,
      agentName: UNKNOWN_FALLBACK_AGENT_NAME,
    };
  }

  return {
    shouldWaitForFallback: true,
    agentName: fallbackAgent.name,
  };
};

export const toFallbackAgentOptions = (preferences: Preferences): FallbackAgentOption[] => {
  return preferences.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    enabled: agent.enabled,
  }));
};
