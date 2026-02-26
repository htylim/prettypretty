import type { PrettifyRunRequest, PrettifyTrigger } from '../../shared/prettifier';
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

export const isPrettifyRunRequest = (value: unknown): value is PrettifyRunRequest => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.inputText === 'string' &&
    isIndentSize(value.indentSize) &&
    isPrettifyTrigger(value.trigger)
  );
};
