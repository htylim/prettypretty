import { Menu, app, dialog, shell, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { PREFERENCES_FILE_NAME, PreferencesStore } from '../preferences/preferencesStore';

const APP_NAME = 'prettypretty';
const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
};

const reportOpenPreferencesError = (error: unknown): void => {
  dialog.showErrorBox('Unable to open preferences file', toErrorMessage(error));
};

export const openPreferencesFile = async (): Promise<void> => {
  const userDataPath = app.getPath('userData');
  const preferencesStore = new PreferencesStore(userDataPath);
  await preferencesStore.load();
  const filePath = join(userDataPath, PREFERENCES_FILE_NAME);
  const openErrorMessage = await shell.openPath(filePath);

  if (openErrorMessage.length > 0) {
    throw new Error(openErrorMessage);
  }
};
type ApplicationMenuOptions = {
  onViewLog?: () => void;
};

const macTemplate = ({ onViewLog }: ApplicationMenuOptions): MenuItemConstructorOptions[] => [
  {
    label: APP_NAME,
    submenu: [
      { role: 'about' },
      {
        label: 'Preferences...',
        accelerator: 'CommandOrControl+,',
        click: () => {
          void openPreferencesFile().catch(reportOpenPreferencesError);
        },
      },
      { type: 'separator' },
      {
        label: 'View Log',
        accelerator: 'Cmd+L',
        click: () => {
          onViewLog?.();
        },
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
  { role: 'help' },
];

const defaultTemplate = (): MenuItemConstructorOptions[] => [
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
  { role: 'help' },
];

export const configureApplicationMenu = (options: ApplicationMenuOptions = {}): void => {
  app.setName(APP_NAME);
  const template = process.platform === 'darwin' ? macTemplate(options) : defaultTemplate();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
