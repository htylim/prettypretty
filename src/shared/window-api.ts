import type { AppInfo, OpenFileResult, SaveFileResult } from './ipc-contracts';
import type {
  PrettifyCancelRequest,
  PrettifierProgressEvent,
  PrettifyRunRequest,
  PrettifyRunResponse,
} from './prettifier';
import type { Preferences, PreferencesPatch } from './preferences';
import type { TelemetryEvent } from './telemetry';
import type { ThemeMode } from './types';

export type AppNavigationCommand = 'browser-backward' | 'browser-forward';

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
    openWindow: () => Promise<void>;
    onResetCurrentWindow: (listener: () => void) => () => void;
    onNavigationCommand: (listener: (command: AppNavigationCommand) => void) => () => void;
    initialThemeMode: ThemeMode | null;
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
    cancel: (request: PrettifyCancelRequest) => Promise<boolean>;
    onProgress: (listener: (event: PrettifierProgressEvent) => void) => () => void;
  };
  telemetry: {
    log: (event: TelemetryEvent) => Promise<void>;
  };
}
