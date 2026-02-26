// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplicationMenu } from '../../../../src/main/menu/applicationMenu';

const { buildFromTemplateMock, setApplicationMenuMock, setNameMock } = vi.hoisted(() => {
  return {
    buildFromTemplateMock: vi.fn().mockReturnValue({}),
    setApplicationMenuMock: vi.fn(),
    setNameMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
    app: {
      setName: setNameMock,
    },
    Menu: {
      buildFromTemplate: buildFromTemplateMock,
      setApplicationMenu: setApplicationMenuMock,
    },
  };
});

describe('configureApplicationMenu', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    buildFromTemplateMock.mockClear();
    setApplicationMenuMock.mockClear();
    setNameMock.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('adds View Log menu item on macOS and triggers callback', () => {
    const onViewLog = vi.fn();
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    configureApplicationMenu({ onViewLog });

    expect(setNameMock).toHaveBeenCalledWith('prettypretty');
    expect(buildFromTemplateMock).toHaveBeenCalledTimes(1);

    const template = buildFromTemplateMock.mock.calls[0]?.[0] as Array<{
      label?: string;
      submenu?: Array<{ label?: string; accelerator?: string; click?: () => void }>;
    }>;
    const appMenu = template.find((item) => item.label === 'prettypretty');
    const viewLogItem = appMenu?.submenu?.find((item) => item.label === 'View Log');
    expect(viewLogItem?.accelerator).toBe('Cmd+L');
    expect(typeof viewLogItem?.click).toBe('function');

    viewLogItem?.click?.();
    expect(onViewLog).toHaveBeenCalledTimes(1);
    expect(setApplicationMenuMock).toHaveBeenCalledTimes(1);
  });
});
