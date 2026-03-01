import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrettifyRunResponse } from '../../../src/shared/prettifier';
import type { Preferences } from '../../../src/shared/preferences';
import { App } from '../../../src/renderer/App';
import { useUiStore } from '../../../src/renderer/state/uiStore';

const openFileMock = vi.fn();
const saveMock = vi.fn();
const copyMock = vi.fn();
const preferencesGetAllMock = vi.fn();
const preferencesUpdateMock = vi.fn();
const preferencesResetMock = vi.fn();
const prettifierRunMock = vi.fn();
const prettifierOnProgressMock = vi.fn();
const telemetryLogMock = vi.fn();
const outputCollapseAllMock = vi.fn();
const outputExpandAllMock = vi.fn();
const inputCollapseAllMock = vi.fn();
const inputExpandAllMock = vi.fn();
const openFindMock = vi.fn();
let onPrettifierProgressListener: ((event: { requestId: number; line: string }) => void) | null =
  null;

const emitPrettifierProgress = (event: { requestId: number; line: string }): void => {
  onPrettifierProgressListener?.(event);
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};

const createPreferences = (overrides: Partial<Preferences> = {}): Preferences => ({
  version: 2,
  themeMode: 'light',
  indentSize: 2,
  agents: [
    {
      id: 'amp',
      name: 'Amp',
      executable: 'amp',
      argsTemplate: ['-x'],
      promptTemplate: '<TEXT>\n{input}\n</TEXT>',
      promptDelivery: 'stdin',
      enabled: true,
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
    },
    {
      id: 'codex',
      name: 'Codex',
      executable: 'codex',
      argsTemplate: ['exec', '--skip-git-repo-check', '-'],
      promptTemplate: '<TEXT>\n{input}\n</TEXT>',
      promptDelivery: 'stdin',
      enabled: true,
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
    },
  ],
  fallbackAgentId: 'codex',
  ...overrides,
});

const createPrettifierResponse = (
  overrides: Partial<PrettifyRunResponse> = {},
): PrettifyRunResponse => ({
  status: 'applied-fallback',
  outputText: '{\n  "fallback": true\n}',
  localDetection: 'malformed',
  fallbackStatus: 'applied',
  agentId: 'codex',
  durationMs: 10,
  ...overrides,
});

const renderApp = async (): Promise<void> => {
  render(<App />);
  await act(async () => {
    await Promise.resolve();
  });
};

vi.mock('../../../src/renderer/components/InputEditor', async () => {
  const React = await import('react');

  return {
    InputEditor: React.forwardRef(
      ({ value, onChange }: { value: string; onChange: (value: string) => void }, ref) => {
        React.useImperativeHandle(
          ref,
          () => ({
            collapseAll: inputCollapseAllMock,
            expandAll: inputExpandAllMock,
          }),
          [],
        );

        return React.createElement('textarea', {
          'data-testid': 'input-editor',
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        });
      },
    ),
  };
});

vi.mock('../../../src/renderer/components/OutputEditor', async () => {
  const React = await import('react');

  return {
    OutputEditor: React.forwardRef(
      (
        props: {
          value: string;
        },
        ref,
      ) => {
        React.useImperativeHandle(
          ref,
          () => ({
            collapseAll: outputCollapseAllMock,
            expandAll: outputExpandAllMock,
            openFind: openFindMock,
          }),
          [],
        );

        return React.createElement('div', { 'data-testid': 'output-editor' }, props.value);
      },
    ),
  };
});

beforeEach(() => {
  openFileMock.mockReset();
  saveMock.mockReset();
  copyMock.mockReset();
  preferencesGetAllMock.mockReset();
  preferencesUpdateMock.mockReset();
  preferencesResetMock.mockReset();
  prettifierRunMock.mockReset();
  prettifierOnProgressMock.mockReset();
  telemetryLogMock.mockReset();
  outputCollapseAllMock.mockReset();
  outputExpandAllMock.mockReset();
  inputCollapseAllMock.mockReset();
  inputExpandAllMock.mockReset();
  openFindMock.mockReset();

  openFileMock.mockResolvedValue(null);
  saveMock.mockResolvedValue(null);
  copyMock.mockResolvedValue(undefined);
  preferencesGetAllMock.mockResolvedValue(createPreferences());
  preferencesUpdateMock.mockImplementation(
    async (patch: {
      themeMode?: string;
      indentSize?: number;
      fallbackAgentId?: string | null;
    }) => ({
      ...createPreferences(),
      themeMode: patch.themeMode ?? 'light',
      indentSize: patch.indentSize ?? 2,
      fallbackAgentId:
        patch.fallbackAgentId !== undefined
          ? patch.fallbackAgentId
          : createPreferences().fallbackAgentId,
    }),
  );
  preferencesResetMock.mockResolvedValue(createPreferences());
  prettifierRunMock.mockResolvedValue(createPrettifierResponse());
  prettifierOnProgressMock.mockImplementation((listener) => {
    onPrettifierProgressListener = listener;
    return () => {
      onPrettifierProgressListener = null;
    };
  });
  telemetryLogMock.mockResolvedValue(undefined);

  Object.defineProperty(window, 'prettypretty', {
    configurable: true,
    value: {
      dialog: { openFile: openFileMock },
      file: { save: saveMock },
      clipboard: { copy: copyMock },
      app: {
        getInfo: vi.fn().mockResolvedValue({ name: 'prettypretty', version: '0.1.0' }),
        initialThemeMode: null,
      },
      preferences: {
        getAll: preferencesGetAllMock,
        update: preferencesUpdateMock,
        reset: preferencesResetMock,
      },
      prettifier: {
        run: prettifierRunMock,
        onProgress: prettifierOnProgressMock,
      },
      telemetry: {
        log: telemetryLogMock,
      },
    },
  });

  act(() => {
    useUiStore.setState({
      paneMode: 'input',
      themeMode: 'light',
      indentSize: 2,
      inputText: '',
      ingestNotice: null,
    });
  });
  onPrettifierProgressListener = null;
});

describe('App', () => {
  it('renders empty-state prompt with input active and output disabled in input mode', async () => {
    await renderApp();

    expect(screen.getByTestId('empty-state-cta')).toHaveTextContent(/^Paste, Drop or Click$/);
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toBeDisabled();
  });

  it('uses open file ingestion path to switch to output and render local formatted content', async () => {
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({ path: '/tmp/example.json', content: '{"a":1}' });

    await renderApp();

    await user.click(screen.getByRole('button', { name: 'Click' }));

    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"a": 1');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('uses drop ingestion path to switch to output and render local formatted content', async () => {
    const droppedFile = {
      text: vi.fn().mockResolvedValue('{"a":1}'),
    } as unknown as File;

    await renderApp();

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"a": 1');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('uses paste ingestion path to switch to output and render local formatted content', async () => {
    await renderApp();

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '{"a":1}',
      },
    });

    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"a": 1');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('stays in input mode and shows notice for empty open-file content', async () => {
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({ path: '/tmp/empty.json', content: '' });

    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Click' }));

    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ingest-notice')).toHaveTextContent('File has no content.');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('stays in input mode and shows notice for empty dropped file content', async () => {
    const droppedFile = {
      text: vi.fn().mockResolvedValue(''),
    } as unknown as File;

    await renderApp();

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('ingest-notice')).toHaveTextContent('File has no content.');
    });
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('keeps input mode for empty paste and does not show empty-file notice', async () => {
    await renderApp();

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    });

    expect(screen.queryByTestId('ingest-notice')).not.toBeInTheDocument();
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('typing in input editor updates text without forcing output mode', async () => {
    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: 'alpha',
        ingestNotice: null,
      });
    });

    await renderApp();

    fireEvent.change(screen.getByTestId('input-editor'), {
      target: { value: '{bad' },
    });

    expect(screen.getByTestId('input-editor')).toHaveValue('{bad');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('runs fallback via main prettifier when local parsing fails on output switch', async () => {
    const user = userEvent.setup();
    prettifierRunMock.mockResolvedValue(
      createPrettifierResponse({
        outputText: '{\n  "fallback": true\n}',
      }),
    );

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));

    await waitFor(() => {
      expect(prettifierRunMock).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"fallback": true');
  });

  it('shows fallback wait screen while fallback request is running and hides output editor', async () => {
    const user = userEvent.setup();
    const deferredRun = createDeferred<PrettifyRunResponse>();
    prettifierRunMock.mockReturnValue(deferredRun.promise);

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));

    expect(await screen.findByTestId('fallback-wait-screen')).toBeInTheDocument();
    expect(screen.getByTestId('fallback-wait-message')).toHaveTextContent(
      'Malformed JSON. Calling Codex.',
    );
    expect(screen.getByTestId('fallback-wait-line')).toHaveTextContent('Waiting for agent output');
    expect(screen.queryByTestId('output-editor')).not.toBeInTheDocument();

    deferredRun.resolve(createPrettifierResponse({ outputText: '{\n  "fromAgent": 1\n}' }));

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-wait-screen')).not.toBeInTheDocument();
    });
  });

  it('shows streamed fallback progress line for the active request only', async () => {
    const user = userEvent.setup();
    const deferredRun = createDeferred<PrettifyRunResponse>();
    prettifierRunMock.mockReturnValue(deferredRun.promise);

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));
    expect(await screen.findByTestId('fallback-wait-screen')).toBeInTheDocument();

    const request = prettifierRunMock.mock.calls[0]?.[0] as { requestId: number };

    act(() => {
      emitPrettifierProgress({ requestId: request.requestId + 10, line: 'stale run' });
    });
    expect(screen.getByTestId('fallback-wait-line')).not.toHaveTextContent('stale run');

    act(() => {
      emitPrettifierProgress({
        requestId: request.requestId,
        line: 'Analyzing malformed object...',
      });
    });
    expect(screen.getByTestId('fallback-wait-line')).toHaveTextContent(
      'Analyzing malformed object...',
    );

    deferredRun.resolve(createPrettifierResponse({ outputText: '{\n  "done": true\n}' }));
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-wait-screen')).not.toBeInTheDocument();
    });
  });

  it('keeps input pane selected during malformed paste fallback and switches to output on completion', async () => {
    const deferredRun = createDeferred<PrettifyRunResponse>();
    prettifierRunMock.mockReturnValue(deferredRun.promise);

    await renderApp();

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '{bad',
      },
    });

    expect(await screen.findByTestId('fallback-wait-screen')).toBeInTheDocument();
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('output-editor')).not.toBeInTheDocument();

    deferredRun.resolve(createPrettifierResponse({ outputText: '{\n  "ingest": true\n}' }));

    await waitFor(() => {
      expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByTestId('output-editor')).toHaveTextContent('"ingest": true');
  });

  it('ignores stale fallback responses', async () => {
    const user = userEvent.setup();
    const firstRun = createDeferred<PrettifyRunResponse>();
    const secondRun = createDeferred<PrettifyRunResponse>();
    prettifierRunMock.mockReturnValueOnce(firstRun.promise).mockReturnValueOnce(secondRun.promise);

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad1',
        ingestNotice: null,
      });
    });

    await renderApp();

    await user.click(screen.getByTestId('pane-segment-output'));
    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '{bad2',
      },
    });

    firstRun.resolve(createPrettifierResponse({ outputText: '{\n  "stale": 1\n}' }));
    secondRun.resolve(createPrettifierResponse({ outputText: '{\n  "latest": 2\n}' }));

    await waitFor(() => {
      expect(screen.getByTestId('output-editor')).toHaveTextContent('"latest": 2');
    });
    expect(screen.getByTestId('output-editor')).not.toHaveTextContent('"stale": 1');
  });

  it('switches theme via segmented control and updates document dataset', async () => {
    const user = userEvent.setup();

    await renderApp();

    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(screen.getByTestId('theme-segment-dark'));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(preferencesUpdateMock).toHaveBeenCalledWith({ themeMode: 'dark' });
  });

  it('renders fallback selector with no-fallback and configured agent options', async () => {
    preferencesGetAllMock.mockResolvedValue(
      createPreferences({
        fallbackAgentId: null,
        agents: [
          {
            id: 'amp',
            name: 'Amp',
            executable: 'amp',
            argsTemplate: ['-x'],
            promptTemplate: '<TEXT>\n{input}\n</TEXT>',
            promptDelivery: 'stdin',
            enabled: true,
            timeoutMs: 30_000,
            maxOutputBytes: 1_000_000,
          },
          {
            id: 'codex',
            name: 'Codex',
            executable: 'codex',
            argsTemplate: ['exec', '--skip-git-repo-check', '-'],
            promptTemplate: '<TEXT>\n{input}\n</TEXT>',
            promptDelivery: 'stdin',
            enabled: false,
            timeoutMs: 30_000,
            maxOutputBytes: 1_000_000,
          },
        ],
      }),
    );

    await renderApp();

    const trigger = await screen.findByTestId('fallback-agent-select');
    await waitFor(() => {
      expect(trigger).toHaveTextContent('No Fallback');
    });

    await userEvent.click(trigger);

    expect(screen.getByTestId('fallback-option-none')).toHaveTextContent('No Fallback');
    expect(screen.getByTestId('fallback-option-amp')).toHaveTextContent('Amp');
    expect(screen.getByTestId('fallback-option-codex')).toBeDisabled();
    expect(screen.getByTestId('fallback-option-codex')).toHaveTextContent('Codex (Disabled)');
  });

  it('persists fallback agent selection changes from the toolbar dropdown', async () => {
    const user = userEvent.setup();

    await renderApp();

    const trigger = await screen.findByTestId('fallback-agent-select');

    await waitFor(() => {
      expect(trigger).toHaveTextContent('Codex');
    });

    await user.click(trigger);
    await user.click(screen.getByTestId('fallback-option-amp'));
    expect(preferencesUpdateMock).toHaveBeenCalledWith({ fallbackAgentId: 'amp' });

    await user.click(trigger);
    await user.click(screen.getByTestId('fallback-option-none'));
    expect(preferencesUpdateMock).toHaveBeenCalledWith({ fallbackAgentId: null });
  });

  it('hydrates indent size from preferences and applies it to local formatted output', async () => {
    preferencesGetAllMock.mockResolvedValue(createPreferences({ indentSize: 4 }));
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({ path: '/tmp/example.json', content: '{"outer":{"inner":1}}' });

    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Click' }));

    const output = await screen.findByTestId('output-editor');
    expect(output.textContent ?? '').toContain('\n        "inner": 1');
  });

  it('wires collapse and expand toolbar actions to output editor in output mode', async () => {
    const user = userEvent.setup();

    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    await user.click(screen.getByRole('button', { name: 'Expand' }));

    expect(outputCollapseAllMock).toHaveBeenCalledTimes(1);
    expect(outputExpandAllMock).toHaveBeenCalledTimes(1);
  });

  it('supports command shortcuts for pane switching, save/copy, and reset', async () => {
    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
        ingestNotice: null,
      });
    });

    await renderApp();

    fireEvent.keyDown(window, { key: 'i', metaKey: true });
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 'o', metaKey: true });
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(window, { key: 's', metaKey: true });
    fireEvent.keyDown(window, { key: 'c', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(copyMock).toHaveBeenCalledTimes(1);
    expect(openFindMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
  });
});
