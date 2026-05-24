// @vitest-environment node

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { configureApplicationMenu } from '../../../../src/main/menu/applicationMenu';

const {
  appGetPathMock,
  appSetNameMock,
  buildFromTemplateMock,
  loadMock,
  openPathMock,
  preferencesStoreConstructorMock,
  setApplicationMenuMock,
  showErrorBoxMock,
} = vi.hoisted(() => {
  return {
    appGetPathMock: vi.fn(),
    appSetNameMock: vi.fn(),
    buildFromTemplateMock: vi.fn(),
    loadMock: vi.fn(),
    openPathMock: vi.fn(),
    preferencesStoreConstructorMock: vi.fn(),
    setApplicationMenuMock: vi.fn(),
    showErrorBoxMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
    Menu: {
      buildFromTemplate: buildFromTemplateMock,
      setApplicationMenu: setApplicationMenuMock,
    },
    app: {
      getPath: appGetPathMock,
      setName: appSetNameMock,
    },
    dialog: {
      showErrorBox: showErrorBoxMock,
    },
    shell: {
      openPath: openPathMock,
    },
  };
});

vi.mock('../../../../src/main/preferences/preferencesStore', () => {
  class PreferencesStoreMock {
    constructor(...args: unknown[]) {
      preferencesStoreConstructorMock(...args);
    }

    async load(): Promise<unknown> {
      return loadMock();
    }
  }

  return {
    PREFERENCES_FILE_NAME: 'preferences.json',
    PreferencesStore: PreferencesStoreMock,
  };
});

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

const setPlatform = (value: NodeJS.Platform): void => {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value,
    writable: false,
  });
};

const flushAsyncClick = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const flattenMenuItems = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] => {
  return items.flatMap((item) => {
    const submenu = Array.isArray(item.submenu) ? flattenMenuItems(item.submenu) : [];
    return [item, ...submenu];
  });
};

describe('configureApplicationMenu', () => {
  beforeEach(() => {
    setPlatform('darwin');
    appGetPathMock.mockReset().mockReturnValue('/tmp/prettypretty-user-data');
    appSetNameMock.mockReset();
    buildFromTemplateMock.mockReset().mockImplementation((template) => ({ template }));
    loadMock.mockReset().mockResolvedValue({});
    openPathMock.mockReset().mockResolvedValue('');
    preferencesStoreConstructorMock.mockReset();
    setApplicationMenuMock.mockReset();
    showErrorBoxMock.mockReset();
  });

  afterAll(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
  });

  it('adds Preferences entry in macOS app menu and opens preferences file via system default app', async () => {
    configureApplicationMenu();

    const [template] = buildFromTemplateMock.mock.calls[0] as [MenuItemConstructorOptions[]];
    const appMenu = template[0];

    expect(appSetNameMock).toHaveBeenCalledWith('prettypretty');
    expect(appMenu).toBeDefined();
    expect(appMenu?.label).toBe('prettypretty');

    const submenu = (appMenu?.submenu ?? []) as MenuItemConstructorOptions[];
    const preferencesItem = submenu.find((item) => item.label === 'Preferences...');

    expect(preferencesItem).toBeDefined();
    expect(preferencesItem?.accelerator).toBe('CommandOrControl+,');

    preferencesItem?.click?.(undefined as never, undefined, {} as never);
    await flushAsyncClick();

    expect(preferencesStoreConstructorMock).toHaveBeenCalledWith('/tmp/prettypretty-user-data');
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(openPathMock).toHaveBeenCalledWith('/tmp/prettypretty-user-data/preferences.json');
    expect(showErrorBoxMock).not.toHaveBeenCalled();
  });

  it('shows an error dialog when opening preferences file fails', async () => {
    openPathMock.mockResolvedValueOnce('No application is associated with the file');
    configureApplicationMenu();

    const [template] = buildFromTemplateMock.mock.calls[0] as [MenuItemConstructorOptions[]];
    const appMenu = template[0];
    const submenu = (appMenu?.submenu ?? []) as MenuItemConstructorOptions[];
    const preferencesItem = submenu.find((item) => item.label === 'Preferences...');

    preferencesItem?.click?.(undefined as never, undefined, {} as never);
    await flushAsyncClick();

    expect(openPathMock).toHaveBeenCalledTimes(1);
    expect(showErrorBoxMock).toHaveBeenCalledWith(
      'Unable to open preferences file',
      'No application is associated with the file',
    );
  });

  it('adds View Log item with Cmd+L and invokes callback', () => {
    const onNewWindow = vi.fn();
    const onRefreshWindow = vi.fn();
    const onResetWindow = vi.fn();
    const onViewLog = vi.fn();
    configureApplicationMenu({ onNewWindow, onRefreshWindow, onResetWindow, onViewLog });

    const [template] = buildFromTemplateMock.mock.calls[0] as [MenuItemConstructorOptions[]];
    const appMenu = template[0];
    const fileMenu = template[1];
    const submenu = (appMenu?.submenu ?? []) as MenuItemConstructorOptions[];
    const fileSubmenu = (fileMenu?.submenu ?? []) as MenuItemConstructorOptions[];
    const viewLogItem = submenu.find((item) => item.label === 'View Log');
    const newWindowItem = fileSubmenu.find((item) => item.label === 'New Window');
    const refreshWindowItem = fileSubmenu.find((item) => item.label === 'Refresh File');
    const resetWindowItem = fileSubmenu.find((item) => item.label === 'Reset Window');

    expect(viewLogItem).toBeDefined();
    expect(viewLogItem?.accelerator).toBe('Cmd+L');
    expect(fileMenu?.label).toBe('File');
    expect(newWindowItem?.accelerator).toBe('CommandOrControl+N');
    expect(refreshWindowItem?.accelerator).toBe('CommandOrControl+R');
    expect(resetWindowItem?.accelerator).toBe('CommandOrControl+Shift+N');

    viewLogItem?.click?.(undefined as never, undefined, {} as never);
    newWindowItem?.click?.(undefined as never, undefined, {} as never);
    refreshWindowItem?.click?.(undefined as never, undefined, {} as never);
    resetWindowItem?.click?.(undefined as never, undefined, {} as never);

    expect(onViewLog).toHaveBeenCalledTimes(1);
    expect(onNewWindow).toHaveBeenCalledTimes(1);
    expect(onRefreshWindow).toHaveBeenCalledTimes(1);
    expect(onResetWindow).toHaveBeenCalledTimes(1);
    expect(setApplicationMenuMock).toHaveBeenCalledTimes(1);
  });

  it('does not include the default reload accelerator from the Electron view menu', () => {
    configureApplicationMenu();

    const [template] = buildFromTemplateMock.mock.calls[0] as [MenuItemConstructorOptions[]];
    const items = flattenMenuItems(template);

    expect(items.some((item) => item.role === 'viewMenu')).toBe(false);
    expect(items.some((item) => item.role === 'reload' || item.role === 'forceReload')).toBe(false);
    expect(
      items.filter((item) => item.accelerator === 'CommandOrControl+R').map((item) => item.label),
    ).toEqual(['Refresh File']);
  });
});
