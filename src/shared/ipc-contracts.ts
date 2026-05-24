export type OpenTextFile = {
  path: string;
  content: string;
};

export type FileSourceKind = 'dialog-open-file' | 'startup-open-file' | 'refresh-file';

export type RefreshableOpenTextFile = OpenTextFile & {
  sourceToken: string;
  sourceKind: FileSourceKind;
};

export type OpenFileResult = RefreshableOpenTextFile | null;

export type RefreshOpenFileRequest = {
  path: string;
  sourceToken: string;
};

export type CommitOpenFileSourceRequest = {
  path: string;
  sourceToken: string;
};

export type ClearOpenFileSourceRequest = {
  path: string;
  sourceToken: string;
  scope: 'pending' | 'committed';
};

export type SaveFileResult = {
  path: string;
} | null;

export type AppInfo = {
  name: string;
  version: string;
};

export const IPCChannels = {
  dialogOpenFile: 'dialog:open-file',
  fileRefreshOpenFile: 'file:refresh-open-file',
  fileCommitOpenFileSource: 'file:commit-open-file-source',
  fileClearOpenFileSource: 'file:clear-open-file-source',
  fileSave: 'file:save',
  clipboardCopy: 'clipboard:copy',
  appGetInfo: 'app:get-info',
  appOpenWindow: 'app:open-window',
  appConsumeInitialOpenFile: 'app:consume-initial-open-file',
  appResetCurrentWindow: 'app:reset-current-window',
  appRefreshCurrentWindow: 'app:refresh-current-window',
  appNavigationCommand: 'app:navigation-command',
  logsGetHistory: 'logs:get-history',
  logsLineAppended: 'logs:line-appended',
  preferencesGetAll: 'preferences:get-all',
  preferencesUpdate: 'preferences:update',
  preferencesReset: 'preferences:reset',
  prettifierRun: 'prettifier:run',
  prettifierCancel: 'prettifier:cancel',
  prettifierProgress: 'prettifier:progress',
  telemetryLogEvent: 'telemetry:log-event',
} as const;
