export type OpenTextFile = {
  path: string;
  content: string;
};

export type OpenFileResult = OpenTextFile | null;

export type SaveFileResult = {
  path: string;
} | null;

export type AppInfo = {
  name: string;
  version: string;
};

export const IPCChannels = {
  dialogOpenFile: 'dialog:open-file',
  fileSave: 'file:save',
  clipboardCopy: 'clipboard:copy',
  appGetInfo: 'app:get-info',
  appOpenWindow: 'app:open-window',
  appConsumeInitialOpenFile: 'app:consume-initial-open-file',
  appResetCurrentWindow: 'app:reset-current-window',
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
