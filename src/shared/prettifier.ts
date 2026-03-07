import type { IndentSize } from './preferences';

export type PrettifyTrigger = 'ingest-open-file' | 'ingest-drop' | 'ingest-paste' | 'switch-output';

export type LocalDetection = 'json' | 'json5' | 'python-like' | 'unsupported' | 'malformed';

export type FallbackStatus =
  | 'not-attempted'
  | 'applied'
  | 'skipped-no-fallback'
  | 'skipped-invalid-agent'
  | 'failed-not-installed'
  | 'failed-timeout'
  | 'failed-non-zero-exit'
  | 'failed-output-too-large'
  | 'failed-invalid-output'
  | 'failed-spawn-error';

export type PrettifyRunStatus =
  | 'applied-local'
  | 'applied-fallback'
  | 'passthrough-no-fallback'
  | 'passthrough-fallback-failed';

export type PrettifyRunRequest = {
  requestId: number;
  inputText: string;
  indentSize: IndentSize;
  trigger: PrettifyTrigger;
  fallbackAgentIdOverride?: string;
};

export type PrettifyRunResponse = {
  status: PrettifyRunStatus;
  outputText: string;
  localDetection: LocalDetection;
  fallbackStatus: FallbackStatus;
  agentId: string | null;
  durationMs: number;
};

export type PrettifierProgressEvent = {
  requestId: number;
  line: string;
};
