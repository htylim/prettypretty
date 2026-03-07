export type OpenFileResult = {
  path: string;
  content: string;
} | null;

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
  appResetCurrentWindow: 'app:reset-current-window',
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
