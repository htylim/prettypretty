import type { Preferences } from '../../shared/preferences';
import type { PrettifyTrigger } from '../../shared/prettifier';
import type { TelemetryEventName } from '../../shared/telemetry';

export type IngestSource = 'open-file' | 'drop' | 'paste';

export type FallbackWaitState = {
  requestId: number;
  formatLabel: string;
  agentName: string;
  progressLines: string[];
};

export type FallbackAgentOption = {
  id: string;
  name: string;
  enabled: boolean;
};

export const EMPTY_FILE_NOTICE = 'File has no content.';
export const UNKNOWN_FALLBACK_AGENT_NAME = 'fallback agent';
export const MAX_FALLBACK_PROGRESS_LINES = 5;

const INGEST_TRIGGER_BY_SOURCE: Record<IngestSource, PrettifyTrigger> = {
  'open-file': 'ingest-open-file',
  drop: 'ingest-drop',
  paste: 'ingest-paste',
};

const INGEST_EVENT_NAME_BY_SOURCE: Record<IngestSource, TelemetryEventName> = {
  'open-file': 'renderer.ingest.open-file',
  drop: 'renderer.ingest.drop',
  paste: 'renderer.ingest.paste',
};

const NO_FALLBACK_AGENT = {
  shouldWaitForFallback: false,
  agentName: UNKNOWN_FALLBACK_AGENT_NAME,
} as const;

/**
 * Keep only the most recent progress lines so the wait screen remains readable
 * and renderer memory use stays bounded during long-running fallback sessions.
 */
export const appendFallbackProgressLine = (progressLines: string[], line: string): string[] => {
  const nextProgressLines = [...progressLines, line];

  if (nextProgressLines.length <= MAX_FALLBACK_PROGRESS_LINES) {
    return nextProgressLines;
  }

  return nextProgressLines.slice(-MAX_FALLBACK_PROGRESS_LINES);
};

/**
 * Produce a deterministic id from the output content so Monaco view state can be
 * restored per logical document instead of per transient pane switch.
 */
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

/**
 * Maps renderer ingest sources to the shared trigger values consumed by
 * prettifier telemetry and main-process execution.
 */
export const getIngestTrigger = (source: IngestSource): PrettifyTrigger => {
  return INGEST_TRIGGER_BY_SOURCE[source];
};

export const getIngestEventName = (source: IngestSource): TelemetryEventName => {
  return INGEST_EVENT_NAME_BY_SOURCE[source];
};

/**
 * Resolves the persisted fallback selection into a wait-screen decision. The
 * renderer treats missing or disabled agents as "no fallback" rather than guessing.
 */
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
    return NO_FALLBACK_AGENT;
  }

  const fallbackAgent = fallbackAgentOptions.find(
    (agentOption) => agentOption.id === fallbackAgentId && agentOption.enabled,
  );

  if (!fallbackAgent) {
    return NO_FALLBACK_AGENT;
  }

  return {
    shouldWaitForFallback: true,
    agentName: fallbackAgent.name,
  };
};

/**
 * Renderer dropdown options intentionally flatten the persisted agent model down
 * to the fields needed for selection and wait-state copy.
 */
export const toFallbackAgentOptions = (preferences: Preferences): FallbackAgentOption[] => {
  return preferences.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    enabled: agent.enabled,
  }));
};
