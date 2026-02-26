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
});
