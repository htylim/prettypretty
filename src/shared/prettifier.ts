import type { IndentSize } from './preferences';

/**
 * Identifies the user action that kicked off a prettify attempt so telemetry and
 * fallback behavior can distinguish ingestion from explicit pane switches.
 */
export type PrettifyTrigger =
  | 'ingest-open-file'
  | 'ingest-drop'
  | 'ingest-paste'
  | 'switch-output'
  | 'context-pane-prettify';

/**
 * High-level local parse/format families.
 */
export type LocalResultFamily = 'json-like' | 'graphql' | 'text';

/**
 * Applied local results carry both how the formatter behaved and the user-facing
 * variant that is most useful for observability.
 */
export type LocalAppliedMode = 'canonical' | 'token-preserving' | 'passthrough';

export type LocalAppliedVariant =
  | 'json'
  | 'ndjson'
  | 'json5'
  | 'python-like'
  | 'json-like-token-preserving'
  | 'graphql'
  | 'text';

/**
 * Structured-data detections all share the same normalization contract: parse
 * into data, reject runtime-only values, then emit canonical JSON text.
 */
export type StructuredDataLocalVariant = Extract<
  LocalAppliedVariant,
  'json' | 'ndjson' | 'json5' | 'python-like'
>;

/**
 * Local failures stay explicit about the supported family boundary and why the
 * local path stopped short of a final result.
 */
export type LocalFailedReason = 'unsupported' | 'malformed';

/**
 * Shared local prettifier result. Renderer and main both consume this contract
 * before deciding whether fallback orchestration is still allowed.
 */
export type LocalPrettifyAppliedResult =
  | {
      kind: 'applied';
      family: 'json-like';
      mode: 'canonical';
      variant: StructuredDataLocalVariant;
      outputText: string;
    }
  | {
      kind: 'applied';
      family: 'json-like';
      mode: 'token-preserving';
      variant: 'json-like-token-preserving';
      outputText: string;
    }
  | {
      kind: 'applied';
      family: 'graphql';
      mode: 'canonical';
      variant: 'graphql';
      outputText: string;
    }
  | {
      kind: 'applied';
      family: 'text';
      mode: 'passthrough';
      variant: 'text';
      outputText: string;
    };

export type LocalPrettifyFailedResult = {
  kind: 'failed';
  family: Extract<LocalResultFamily, 'json-like' | 'graphql'>;
  reason: LocalFailedReason;
};

export type LocalPrettifyResult = LocalPrettifyAppliedResult | LocalPrettifyFailedResult;

export type LocalPrettifySummary =
  | Omit<LocalPrettifyAppliedResult, 'outputText'>
  | LocalPrettifyFailedResult;

export const summarizeLocalPrettifyResult = (
  localResult: LocalPrettifyResult,
): LocalPrettifySummary => {
  if (localResult.kind === 'failed') {
    return localResult;
  }

  return {
    kind: localResult.kind,
    family: localResult.family,
    mode: localResult.mode,
    variant: localResult.variant,
  };
};

export type FlattenedLocalPrettifySummary = {
  localFamily: LocalResultFamily;
  localMode: LocalAppliedMode | null;
  localVariant: LocalAppliedVariant | null;
  localFailureReason: LocalFailedReason | null;
};

export const flattenLocalPrettifySummary = (
  localResult: LocalPrettifySummary,
): FlattenedLocalPrettifySummary => {
  if (localResult.kind === 'failed') {
    return {
      localFamily: localResult.family,
      localMode: null,
      localVariant: null,
      localFailureReason: localResult.reason,
    };
  }

  return {
    localFamily: localResult.family,
    localMode: localResult.mode,
    localVariant: localResult.variant,
    localFailureReason: null,
  };
};

/**
 * Explains why fallback was skipped, succeeded, or failed after local parsing
 * could not produce a prettified result.
 */
export type FallbackStatus =
  | 'not-attempted'
  | 'applied'
  | 'skipped-no-fallback'
  | 'skipped-invalid-agent'
  | 'failed-canceled'
  | 'failed-not-installed'
  | 'failed-timeout'
  | 'failed-non-zero-exit'
  | 'failed-output-too-large'
  | 'failed-invalid-output'
  | 'failed-spawn-error';

/**
 * Summarizes whether the final visible output came from the local parser, a
 * fallback agent, or passthrough behavior.
 */
export type PrettifyRunStatus =
  | 'applied-local'
  | 'applied-fallback'
  | 'passthrough-no-fallback'
  | 'passthrough-fallback-failed';

/**
 * Main-to-renderer prettifier payload. `requestId` is renderer-owned and lets
 * both sides ignore stale progress/results after a newer run supersedes them.
 */
export type PrettifyRunRequest = {
  requestId: number;
  inputText: string;
  indentSize: IndentSize;
  trigger: PrettifyTrigger;
  fallbackAgentIdOverride?: string;
};

export type PrettifyCancelRequest = {
  requestId: number;
};

/**
 * Full prettifier outcome returned to the renderer after local parsing and any
 * optional fallback execution complete.
 */
export type PrettifyRunResponse = {
  status: PrettifyRunStatus;
  outputText: string;
  localResult: LocalPrettifySummary;
  fallbackStatus: FallbackStatus;
  agentId: string | null;
  durationMs: number;
};

/**
 * Streaming progress event emitted while a fallback agent is still running.
 */
export type PrettifierProgressEvent = {
  requestId: number;
  line: string;
};
