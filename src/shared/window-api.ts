import type { AppInfo, OpenFileResult, SaveFileResult } from './ipc-contracts';

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
}
