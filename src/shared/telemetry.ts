export type TelemetryValue = string | number | boolean | null;

export type TelemetryMeta = Record<string, TelemetryValue>;

export const TELEMETRY_EVENT_NAMES = [
  'renderer.ingest.open-file',
  'renderer.ingest.drop',
  'renderer.ingest.paste',
  'renderer.output.mode-switch',
  'renderer.prettifier.local.result',
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

export type TelemetryEvent = {
  name: TelemetryEventName;
  meta: TelemetryMeta;
};
