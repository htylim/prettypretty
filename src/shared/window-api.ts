import type { AppInfo, OpenFileResult, SaveFileResult } from './ipc-contracts';
import type {
  PrettifierProgressEvent,
  PrettifyRunRequest,
  PrettifyRunResponse,
} from './prettifier';
import type { Preferences, PreferencesPatch } from './preferences';
import type { TelemetryEvent } from './telemetry';

export interface WindowApi {
  dialog: {
    openFile: () => Promise<OpenFileResult>;
  };
  file: {
    save: (content: string) => Promise<SaveFileResult>;
  };
  clipboard: {
    copy: (content: string) => Promise<void>;
  };
  app: {
    getInfo: () => Promise<AppInfo>;
  };
  logs: {
    getHistory: () => Promise<string[]>;
    onLine: (listener: (line: string) => void) => () => void;
  };
  preferences: {
    getAll: () => Promise<Preferences>;
    update: (patch: PreferencesPatch) => Promise<Preferences>;
    reset: () => Promise<Preferences>;
  };
  prettifier: {
    run: (request: PrettifyRunRequest) => Promise<PrettifyRunResponse>;
    onProgress: (listener: (event: PrettifierProgressEvent) => void) => () => void;
  };
  telemetry: {
    log: (event: TelemetryEvent) => Promise<void>;
  };
}
