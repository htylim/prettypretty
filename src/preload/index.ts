import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannels } from '../shared/ipc-contracts';
import type { WindowApi } from './api';
import type { ThemeMode } from '../shared/types';

const INITIAL_THEME_MODE_ARG_PREFIX = '--prettypretty-theme-mode=';

const getInitialThemeMode = (): ThemeMode | null => {
  const themeModeArg = process.argv.find((arg) => arg.startsWith(INITIAL_THEME_MODE_ARG_PREFIX));
  if (!themeModeArg) {
    return null;
  }

  const rawThemeMode = themeModeArg.slice(INITIAL_THEME_MODE_ARG_PREFIX.length);
  return rawThemeMode === 'light' || rawThemeMode === 'dark' ? rawThemeMode : null;
};

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
    initialThemeMode: getInitialThemeMode(),
  },
  logs: {
    getHistory: () => ipcRenderer.invoke(IPCChannels.logsGetHistory),
    onLine: (listener) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, line: string) => {
        listener(line);
      };

      ipcRenderer.on(IPCChannels.logsLineAppended, wrappedListener);

      return () => {
        ipcRenderer.removeListener(IPCChannels.logsLineAppended, wrappedListener);
      };
    },
  },
  preferences: {
    getAll: () => ipcRenderer.invoke(IPCChannels.preferencesGetAll),
    update: (patch) => ipcRenderer.invoke(IPCChannels.preferencesUpdate, patch),
    reset: () => ipcRenderer.invoke(IPCChannels.preferencesReset),
  },
  prettifier: {
    run: (request) => ipcRenderer.invoke(IPCChannels.prettifierRun, request),
    onProgress: (listener) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        event: { requestId: number; line: string },
      ) => {
        listener(event);
      };

      ipcRenderer.on(IPCChannels.prettifierProgress, wrappedListener);

      return () => {
        ipcRenderer.removeListener(IPCChannels.prettifierProgress, wrappedListener);
      };
    },
  },
  telemetry: {
    log: async (event) => {
      await ipcRenderer.invoke(IPCChannels.telemetryLogEvent, event);
    },
  },
};

contextBridge.exposeInMainWorld('prettypretty', api);
