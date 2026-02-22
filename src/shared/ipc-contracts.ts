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
} as const;
