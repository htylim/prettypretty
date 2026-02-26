import { TELEMETRY_EVENT_NAMES, type TelemetryEvent } from '../../shared/telemetry';

const TELEMETRY_EVENT_NAME_SET = new Set(TELEMETRY_EVENT_NAMES);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isPrimitiveTelemetryValue = (value: unknown): value is string | number | boolean | null => {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
};

export const isTelemetryEvent = (value: unknown): value is TelemetryEvent => {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.name !== 'string' ||
    !TELEMETRY_EVENT_NAME_SET.has(value.name as (typeof TELEMETRY_EVENT_NAMES)[number])
  ) {
    return false;
  }

  if (!isRecord(value.meta)) {
    return false;
  }

  return Object.values(value.meta).every((entry) => isPrimitiveTelemetryValue(entry));
};
