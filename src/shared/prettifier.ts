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
 * Describes how far the local parser got before the app either prettified the
 * document or delegated to a fallback agent.
 */
export type LocalDetection =
  | 'json'
  | 'ndjson'
  | 'json5'
  | 'python-like'
  | 'graphql'
  | 'text'
  | 'unsupported'
  | 'malformed';

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
  localDetection: LocalDetection;
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
