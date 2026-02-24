import type { AppInfo, OpenFileResult, SaveFileResult } from './ipc-contracts';
import type { Preferences, PreferencesPatch } from './preferences';

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
  preferences: {
    getAll: () => Promise<Preferences>;
    update: (patch: PreferencesPatch) => Promise<Preferences>;
    reset: () => Promise<Preferences>;
  };
}
