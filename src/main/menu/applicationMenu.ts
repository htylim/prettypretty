import { Menu, type MenuItemConstructorOptions, app } from 'electron';

const APP_NAME = 'prettypretty';

const macTemplate = (): MenuItemConstructorOptions[] => [
  {
    label: APP_NAME,
    submenu: [
      { role: 'about' },
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

export const configureApplicationMenu = (): void => {
  app.setName(APP_NAME);
  const template = process.platform === 'darwin' ? macTemplate() : defaultTemplate();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
