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
export const MONACO_MAX_TOKENIZATION_LINE_LENGTH = 20_000;
export const MONACO_LARGE_FILE_CHAR_COUNT_LIMIT = 20 * 1024 * 1024;
export const MONACO_LARGE_FILE_LINE_COUNT_LIMIT = 300 * 1000;

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

export type MonacoTextMetrics = {
  charCount: number;
  lineCount: number;
  maxLineLength: number;
};

export type MonacoIngestRejectionReason = 'max-line-length' | 'char-count' | 'line-count';

export type MonacoIngestRejection = {
  reason: MonacoIngestRejectionReason;
  actual: number;
  limit: number;
  metrics: MonacoTextMetrics;
};

const formatCount = (value: number): string => {
  return new Intl.NumberFormat('en-US').format(value);
};

export const getMonacoTextMetrics = (value: string): MonacoTextMetrics => {
  if (value.length === 0) {
    return {
      charCount: 0,
      lineCount: 0,
      maxLineLength: 0,
    };
  }

  let lineCount = 1;
  let currentLineLength = 0;
  let maxLineLength = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code === 13) {
      maxLineLength = Math.max(maxLineLength, currentLineLength);
      currentLineLength = 0;
      lineCount += 1;

      if (value.charCodeAt(index + 1) === 10) {
        index += 1;
      }

      continue;
    }

    if (code === 10) {
      maxLineLength = Math.max(maxLineLength, currentLineLength);
      currentLineLength = 0;
      lineCount += 1;
      continue;
    }

    currentLineLength += 1;
  }

  return {
    charCount: value.length,
    lineCount,
    maxLineLength: Math.max(maxLineLength, currentLineLength),
  };
};

export const getMonacoIngestRejection = (value: string): MonacoIngestRejection | null => {
  const metrics = getMonacoTextMetrics(value);

  if (metrics.maxLineLength >= MONACO_MAX_TOKENIZATION_LINE_LENGTH) {
    return {
      reason: 'max-line-length',
      actual: metrics.maxLineLength,
      limit: MONACO_MAX_TOKENIZATION_LINE_LENGTH,
      metrics,
    };
  }

  if (metrics.charCount > MONACO_LARGE_FILE_CHAR_COUNT_LIMIT) {
    return {
      reason: 'char-count',
      actual: metrics.charCount,
      limit: MONACO_LARGE_FILE_CHAR_COUNT_LIMIT,
      metrics,
    };
  }

  if (metrics.lineCount > MONACO_LARGE_FILE_LINE_COUNT_LIMIT) {
    return {
      reason: 'line-count',
      actual: metrics.lineCount,
      limit: MONACO_LARGE_FILE_LINE_COUNT_LIMIT,
      metrics,
    };
  }

  return null;
};

export const getMonacoIngestRejectionMessage = (rejection: MonacoIngestRejection): string => {
  switch (rejection.reason) {
    case 'max-line-length':
      return `This content has a line with ${formatCount(rejection.actual)} characters. Monaco stops tokenizing lines at ${formatCount(rejection.limit)} characters, so this file won't open.`;
    case 'char-count':
      return `This content has ${formatCount(rejection.actual)} characters. Monaco disables large-file tokenization above ${formatCount(rejection.limit)} characters, so this file won't open.`;
    case 'line-count':
      return `This content has ${formatCount(rejection.actual)} lines. Monaco disables large-file tokenization above ${formatCount(rejection.limit)} lines, so this file won't open.`;
  }
};

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
