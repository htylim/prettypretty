import type {
  PrettifyCancelRequest,
  PrettifyRunRequest,
  PrettifyTrigger,
} from '../../shared/prettifier';
import { isIndentSize } from '../preferences/preferencesTypes';

const PRETTIFY_TRIGGERS: Set<PrettifyTrigger> = new Set([
  'ingest-open-file',
  'ingest-drop',
  'ingest-paste',
  'switch-output',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isPrettifyTrigger = (value: unknown): value is PrettifyTrigger => {
  return typeof value === 'string' && PRETTIFY_TRIGGERS.has(value as PrettifyTrigger);
};

const isRequestId = (value: unknown): value is number => {
  return (
    typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value) && value >= 1
  );
};

export const isPrettifyRunRequest = (value: unknown): value is PrettifyRunRequest => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRequestId(value.requestId) &&
    typeof value.inputText === 'string' &&
    isIndentSize(value.indentSize) &&
    isPrettifyTrigger(value.trigger) &&
    (value.fallbackAgentIdOverride === undefined ||
      typeof value.fallbackAgentIdOverride === 'string')
  );
};

export const isPrettifyCancelRequest = (value: unknown): value is PrettifyCancelRequest => {
  if (!isRecord(value)) {
    return false;
  }

  return isRequestId(value.requestId);
};
