// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIpcHandlers } from '../../../../src/main/ipc';
import { IPCChannels } from '../../../../src/shared/ipc-contracts';

const {
  handleMock,
  fromWebContentsMock,
  parentWindow,
  readFileMock,
  writeFileMock,
  writeTextMock,
  showOpenDialogMock,
  showSaveDialogMock,
} = vi.hoisted(() => {
  return {
    handleMock: vi.fn(),
    fromWebContentsMock: vi.fn(),
    parentWindow: { id: 1, on: vi.fn() },
    readFileMock: vi.fn(),
    writeFileMock: vi.fn(),
    writeTextMock: vi.fn(),
    showOpenDialogMock: vi.fn(),
    showSaveDialogMock: vi.fn(),
  };
});

vi.mock('electron', () => {
  return {
    BrowserWindow: {
      fromWebContents: fromWebContentsMock,
    },
    app: {
      getName: vi.fn().mockReturnValue('prettypretty'),
      getVersion: vi.fn().mockReturnValue('0.3.0'),
    },
    clipboard: {
      writeText: writeTextMock,
    },
    dialog: {
      showOpenDialog: showOpenDialogMock,
      showSaveDialog: showSaveDialogMock,
    },
    ipcMain: {
      handle: handleMock,
    },
  };
});

vi.mock('node:fs/promises', () => {
  return {
    readFile: readFileMock,
    writeFile: writeFileMock,
  };
});

const getRegisteredHandler = (channel: string): ((...args: unknown[]) => unknown) => {
  const call = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel);
  if (!call || typeof call[1] !== 'function') {
    throw new Error(`Missing handler for channel ${channel}`);
  }

  return call[1];
};

const senderEvent = (window = parentWindow) => {
  fromWebContentsMock.mockReturnValue(window);
  return { sender: {} };
};

describe('registerIpcHandlers file source authorization', () => {
  const preferencesService = {
    getAll: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
  };
  const prettifierService = {
    run: vi.fn(),
    cancel: vi.fn(),
  };
  const logStore = {
    getSnapshot: vi.fn().mockReturnValue([]),
  };
  const onOpenWindow = vi.fn().mockResolvedValue(undefined);
  const onConsumeInitialOpenFile = vi.fn().mockResolvedValue(null);
  const logger = {
    isVerboseEnabled: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    handleMock.mockReset();
    fromWebContentsMock.mockReset().mockReturnValue(parentWindow);
    parentWindow.on.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockReset();
    writeTextMock.mockReset();
    showOpenDialogMock.mockReset().mockResolvedValue({ canceled: true, filePaths: [] });
    showSaveDialogMock.mockReset().mockResolvedValue({ canceled: true, filePath: null });
    preferencesService.getAll.mockReset();
    preferencesService.update.mockReset();
    preferencesService.reset.mockReset();
    prettifierService.run.mockReset();
    prettifierService.cancel.mockReset();
    logStore.getSnapshot.mockClear();
    onOpenWindow.mockReset().mockResolvedValue(undefined);
    onConsumeInitialOpenFile.mockReset().mockResolvedValue(null);
    logger.isVerboseEnabled.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();

    registerIpcHandlers({
      preferencesService,
      prettifierService,
      logger,
      logStore,
      onOpenWindow,
      onConsumeInitialOpenFile,
    });
  });

  const openDialogFile = async (path = '/tmp/source.json', content = '{"a":1}') => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: [path] });
    readFileMock.mockResolvedValueOnce(content);

    return getRegisteredHandler(IPCChannels.dialogOpenFile)(senderEvent());
  };

  const commit = (source: { sourceToken: string; path: string }) => {
    return getRegisteredHandler(IPCChannels.fileCommitOpenFileSource)(senderEvent(), {
      sourceToken: source.sourceToken,
      path: source.path,
    });
  };

  const refresh = (source: { sourceToken: string; path: string }) => {
    return getRegisteredHandler(IPCChannels.fileRefreshOpenFile)(senderEvent(), {
      sourceToken: source.sourceToken,
      path: source.path,
    });
  };

  it('creates pending source after successful dialog file read', async () => {
    const result = await openDialogFile();

    expect(result).toMatchObject({
      path: '/tmp/source.json',
      content: '{"a":1}',
      sourceKind: 'dialog-open-file',
    });
    expect(result).toHaveProperty('sourceToken', expect.any(String));
  });

  it('creates pending source after startup file is consumed by the sender window', async () => {
    onConsumeInitialOpenFile.mockResolvedValueOnce({
      path: '/tmp/startup.json',
      content: '{"startup":true}',
    });

    const result = await getRegisteredHandler(IPCChannels.appConsumeInitialOpenFile)(senderEvent());

    expect(result).toMatchObject({
      path: '/tmp/startup.json',
      content: '{"startup":true}',
      sourceKind: 'startup-open-file',
    });
    expect(result).toHaveProperty('sourceToken', expect.any(String));
  });

  it('does not create pending source after failed dialog or startup file read', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/tmp/source.json'] });
    readFileMock.mockRejectedValueOnce(new Error('read failed'));

    await expect(getRegisteredHandler(IPCChannels.dialogOpenFile)(senderEvent())).rejects.toThrow(
      'read failed',
    );
    await expect(
      getRegisteredHandler(IPCChannels.fileCommitOpenFileSource)(senderEvent(), {
        sourceToken: 'missing',
        path: '/tmp/source.json',
      }),
    ).rejects.toThrow('Invalid file source commit payload');

    onConsumeInitialOpenFile.mockRejectedValueOnce(new Error('startup failed'));
    await expect(
      getRegisteredHandler(IPCChannels.appConsumeInitialOpenFile)(senderEvent()),
    ).rejects.toThrow('startup failed');
  });

  it('keeps successful dialog reads pending until renderer commits them', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };

    readFileMock.mockResolvedValueOnce('{"fresh":true}');
    await expect(refresh(source)).rejects.toThrow('Unauthorized refresh file request');

    await commit(source);
    readFileMock.mockResolvedValueOnce('{"fresh":true}');
    await expect(refresh(source)).resolves.toMatchObject({
      content: '{"fresh":true}',
      sourceKind: 'refresh-file',
    });
  });

  it('does not replace committed source when pending source is cleared after ingest abort', async () => {
    const first = (await openDialogFile('/tmp/first.json')) as {
      sourceToken: string;
      path: string;
    };
    await commit(first);
    const second = (await openDialogFile('/tmp/second.json')) as {
      sourceToken: string;
      path: string;
    };

    await getRegisteredHandler(IPCChannels.fileClearOpenFileSource)(senderEvent(), {
      sourceToken: second.sourceToken,
      path: second.path,
      scope: 'pending',
    });

    readFileMock.mockResolvedValueOnce('{"first":2}');
    await expect(refresh(first)).resolves.toMatchObject({ path: '/tmp/first.json' });
  });

  it('commits pending source by matching sourceToken', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };

    await expect(commit(source)).resolves.toBe(true);
    await expect(
      getRegisteredHandler(IPCChannels.fileCommitOpenFileSource)(senderEvent(), {
        sourceToken: 'wrong',
        path: source.path,
      }),
    ).rejects.toThrow('Invalid file source commit payload');
  });

  it('refresh read validates committed token and returns a new pending refresh token', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);
    readFileMock.mockResolvedValueOnce('{"fresh":true}');

    const result = (await refresh(source)) as { sourceToken: string };

    expect(result).toMatchObject({
      path: '/tmp/source.json',
      content: '{"fresh":true}',
      sourceKind: 'refresh-file',
    });
    expect(result.sourceToken).not.toBe(source.sourceToken);
  });

  it('clearing stale refresh pending token preserves previous committed source', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);
    readFileMock.mockResolvedValueOnce('{"fresh":true}');
    const pendingRefresh = (await refresh(source)) as { sourceToken: string; path: string };

    await getRegisteredHandler(IPCChannels.fileClearOpenFileSource)(senderEvent(), {
      sourceToken: pendingRefresh.sourceToken,
      path: pendingRefresh.path,
      scope: 'pending',
    });

    readFileMock.mockResolvedValueOnce('{"again":true}');
    await expect(refresh(source)).resolves.toMatchObject({ content: '{"again":true}' });
  });

  it('clears committed source by matching sourceToken on reset document paste or drop', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);

    await getRegisteredHandler(IPCChannels.fileClearOpenFileSource)(senderEvent(), {
      sourceToken: source.sourceToken,
      path: source.path,
      scope: 'committed',
    });

    readFileMock.mockResolvedValueOnce('{"fresh":true}');
    await expect(refresh(source)).rejects.toThrow('Unauthorized refresh file request');
  });

  it('file-backed replacement commits new pending source over old committed source', async () => {
    const first = (await openDialogFile('/tmp/first.json')) as {
      sourceToken: string;
      path: string;
    };
    await commit(first);
    const second = (await openDialogFile('/tmp/second.json')) as {
      sourceToken: string;
      path: string;
    };
    await commit(second);

    readFileMock.mockResolvedValueOnce('{"second":2}');
    await expect(refresh(second)).resolves.toMatchObject({ path: '/tmp/second.json' });
    await expect(refresh(first)).rejects.toThrow('Unauthorized refresh file request');
  });

  it('does not clear committed source for rejected oversized paste drop open or refresh attempts', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);

    readFileMock.mockResolvedValueOnce('{"same":true}');
    await expect(refresh(source)).resolves.toMatchObject({ path: '/tmp/source.json' });
  });

  it('commit failure leaves pending source uncommitted and does not enable refresh', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };

    await expect(
      getRegisteredHandler(IPCChannels.fileCommitOpenFileSource)(senderEvent(), {
        sourceToken: 'wrong',
        path: source.path,
      }),
    ).rejects.toThrow('Invalid file source commit payload');
    await expect(refresh(source)).rejects.toThrow('Unauthorized refresh file request');
  });

  it('clear failure before accepted paste drop or reset preserves previous visible session and source state', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);

    await expect(
      getRegisteredHandler(IPCChannels.fileClearOpenFileSource)(senderEvent(), {
        sourceToken: 'wrong',
        path: source.path,
        scope: 'committed',
      }),
    ).rejects.toThrow('Invalid file source clear payload');

    readFileMock.mockResolvedValueOnce('{"still":true}');
    await expect(refresh(source)).resolves.toMatchObject({ content: '{"still":true}' });
  });

  it('rejects refresh reads when path is not the sender window committed source', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);

    await expect(refresh({ ...source, path: '/tmp/other.json' })).rejects.toThrow(
      'Unauthorized refresh file request',
    );
  });

  it('rejects refresh reads when sourceToken does not match the sender window committed source', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);

    await expect(refresh({ ...source, sourceToken: 'wrong' })).rejects.toThrow(
      'Unauthorized refresh file request',
    );
  });

  it('validates refresh read payload shape', async () => {
    await expect(
      getRegisteredHandler(IPCChannels.fileRefreshOpenFile)(senderEvent(), {
        path: '/tmp/source.json',
      }),
    ).rejects.toThrow('Invalid refresh file payload');
  });

  it('cleans up pending and committed authorized sources when the sender window is destroyed', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);
    const closedListener = parentWindow.on.mock.calls.find(([event]) => event === 'closed')?.[1] as
      | (() => void)
      | undefined;

    closedListener?.();

    await expect(refresh(source)).rejects.toThrow('Unauthorized refresh file request');
  });

  it('uses existing readOpenTextFile UTF-8 behavior without adding refresh-only decode rules', async () => {
    const source = (await openDialogFile()) as { sourceToken: string; path: string };
    await commit(source);
    readFileMock.mockResolvedValueOnce('plain text');

    await refresh(source);

    expect(readFileMock).toHaveBeenLastCalledWith('/tmp/source.json', 'utf8');
  });
});
