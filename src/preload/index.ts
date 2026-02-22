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
};

contextBridge.exposeInMainWorld('prettypretty', api);
