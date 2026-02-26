import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannels } from '../shared/ipc-contracts';
import type { WindowApi } from './api';

const api: WindowApi = {
  dialog: {
    openFile: () => ipcRenderer.invoke(IPCChannels.dialogOpenFile),
  },
  file: {
    save: (content: string) => ipcRenderer.invoke(IPCChannels.fileSave, content),
  },
  clipboard: {
    copy: async (content: string) => {
      await ipcRenderer.invoke(IPCChannels.clipboardCopy, content);
    },
  },
  app: {
    getInfo: () => ipcRenderer.invoke(IPCChannels.appGetInfo),
  },
  preferences: {
    getAll: () => ipcRenderer.invoke(IPCChannels.preferencesGetAll),
    update: (patch) => ipcRenderer.invoke(IPCChannels.preferencesUpdate, patch),
    reset: () => ipcRenderer.invoke(IPCChannels.preferencesReset),
  },
  prettifier: {
    run: (request) => ipcRenderer.invoke(IPCChannels.prettifierRun, request),
  },
  telemetry: {
    log: async (event) => {
      await ipcRenderer.invoke(IPCChannels.telemetryLogEvent, event);
    },
  },
};

contextBridge.exposeInMainWorld('prettypretty', api);
