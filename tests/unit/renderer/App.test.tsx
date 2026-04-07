import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrettifyRunResponse } from '../../../src/shared/prettifier';
import type { Preferences } from '../../../src/shared/preferences';
import { App } from '../../../src/renderer/App';
import { MONACO_MAX_TOKENIZATION_LINE_LENGTH } from '../../../src/renderer/app/appDomain';
import { createInitialDocumentSessionState } from '../../../src/renderer/app/session/documentSessionDomain';
import { useDocumentSession } from '../../../src/renderer/app/session/useDocumentSession';

const useUiStore = useDocumentSession;

const openFileMock = vi.fn();
const saveMock = vi.fn();
const copyMock = vi.fn();
const preferencesGetAllMock = vi.fn();
const preferencesUpdateMock = vi.fn();
const preferencesResetMock = vi.fn();
const prettifierRunMock = vi.fn();
const prettifierCancelMock = vi.fn();
const prettifierOnProgressMock = vi.fn();
const telemetryLogMock = vi.fn();
const openWindowMock = vi.fn();
const appOnResetCurrentWindowMock = vi.fn();
const outputCollapseAllMock = vi.fn();
const outputExpandAllMock = vi.fn();
const outputFocusMock = vi.fn();
const inputCollapseAllMock = vi.fn();
const inputExpandAllMock = vi.fn();
const openFindMock = vi.fn();
let onPrettifierProgressListener: ((event: { requestId: number; line: string }) => void) | null =
  null;
let onResetCurrentWindowListener: (() => void) | null = null;

const getPrimaryModifierKey = (): 'Control' | 'Meta' => {
  return /mac|iphone|ipad|ipod/iu.test(window.navigator.platform) ? 'Meta' : 'Control';
};

const emitPrettifierProgress = (event: { requestId: number; line: string }): void => {
  onPrettifierProgressListener?.(event);
};

const pressPrimaryShortcut = async (
  user: ReturnType<typeof userEvent.setup>,
  key: string,
  options?: {
    shiftKey?: boolean;
  },
): Promise<void> => {
  const primaryModifierKey = getPrimaryModifierKey();
  await user.keyboard(
    options?.shiftKey
      ? `{${primaryModifierKey}>}{Shift>}${key}{/Shift}{/${primaryModifierKey}}`
      : `{${primaryModifierKey}>}${key}{/${primaryModifierKey}}`,
  );
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
  fallbackWarningLineThreshold: 300,
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
            focus: outputFocusMock,
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
  prettifierCancelMock.mockReset().mockResolvedValue(true);
  prettifierOnProgressMock.mockReset();
  telemetryLogMock.mockReset();
  openWindowMock.mockReset().mockResolvedValue(undefined);
  appOnResetCurrentWindowMock.mockReset().mockImplementation((listener: () => void) => {
    onResetCurrentWindowListener = listener;
    return vi.fn();
  });
  outputCollapseAllMock.mockReset();
  outputExpandAllMock.mockReset();
  outputFocusMock.mockReset();
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
      fallbackWarningLineThreshold?: number;
      fallbackAgentId?: string | null;
    }) => ({
      ...createPreferences(),
      themeMode: patch.themeMode ?? 'light',
      indentSize: patch.indentSize ?? 2,
      fallbackWarningLineThreshold: patch.fallbackWarningLineThreshold ?? 300,
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
        getInfo: vi.fn().mockResolvedValue({ name: 'prettypretty', version: '0.2.0' }),
        openWindow: openWindowMock,
        onResetCurrentWindow: appOnResetCurrentWindowMock,
        onNavigationCommand: vi.fn().mockImplementation(() => vi.fn()),
        initialThemeMode: null,
      },
      preferences: {
        getAll: preferencesGetAllMock,
        update: preferencesUpdateMock,
        reset: preferencesResetMock,
      },
      prettifier: {
        run: prettifierRunMock,
        cancel: prettifierCancelMock,
        onProgress: prettifierOnProgressMock,
      },
      telemetry: {
        log: telemetryLogMock,
      },
    },
  });

  act(() => {
    useUiStore.setState(createInitialDocumentSessionState());
  });
  onPrettifierProgressListener = null;
  onResetCurrentWindowListener = null;
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

  it('aborts oversized open-file ingestion and returns to the idle window after dismissing the dialog', async () => {
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({
      path: '/tmp/too-large.json',
      content: 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
    });

    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Click' }));

    expect(await screen.findByRole('heading', { name: 'Content too large' })).toBeInTheDocument();
    expect(screen.getByText(/Monaco stops tokenizing lines/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open readable portion' })).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('output-editor')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abort' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Content too large' })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('empty-state-cta')).toBeInTheDocument();
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('routes toolbar New to the app open-window bridge', async () => {
    const user = userEvent.setup();

    await renderApp();
    await user.click(screen.getByRole('button', { name: 'New' }));

    expect(openWindowMock).toHaveBeenCalledTimes(1);
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

  it('aborts oversized dropped content and keeps the current output intact after dismissing the dialog', async () => {
    const user = userEvent.setup();
    const droppedFile = {
      text: vi.fn().mockResolvedValue('x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH)),
    } as unknown as File;

    act(() => {
      useUiStore.setState({
        ...createInitialDocumentSessionState(),
        paneMode: 'output',
        inputText: '{"existing":true}',
        outputText: '{\n  "existing": true\n}',
      });
    });

    await renderApp();

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    expect(await screen.findByRole('heading', { name: 'Content too large' })).toBeInTheDocument();
    expect(screen.getByText(/Monaco stops tokenizing lines/i)).toBeInTheDocument();
    expect(screen.getByTestId('output-editor')).toHaveTextContent('"existing": true');

    await user.click(screen.getByRole('button', { name: 'Abort' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Content too large' })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('output-editor')).toHaveTextContent('"existing": true');
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

  it('opens the readable portion for oversized pasted content when confirmed', async () => {
    const user = userEvent.setup();

    await renderApp();

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => 'x'.repeat(MONACO_MAX_TOKENIZATION_LINE_LENGTH),
      },
    });

    expect(await screen.findByRole('heading', { name: 'Content too large' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open readable portion' }));

    const output = await screen.findByTestId('output-editor');
    expect(output.textContent).toHaveLength(MONACO_MAX_TOKENIZATION_LINE_LENGTH - 1);
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Content too large' })).not.toBeInTheDocument();
    });
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

  it('does not ingest paste events coming from the Monaco find widget', async () => {
    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"before":1}',
        ingestNotice: null,
      });
    });

    await renderApp();

    const shell = screen.getByTestId('editor-shell');
    const findWidget = document.createElement('div');
    findWidget.className = 'find-widget';
    const findInput = document.createElement('input');
    findWidget.appendChild(findInput);
    shell.appendChild(findWidget);

    fireEvent.paste(findInput, {
      clipboardData: {
        getData: () => '{"after":2}',
      },
    });

    expect(useUiStore.getState().inputText).toBe('{"before":1}');
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

  it('shows confirmation modal for large malformed input before fallback runs', async () => {
    const user = userEvent.setup();
    const largeMalformedInput = `{bad\n${Array.from(
      { length: 301 },
      (_, index) => `line-${index.toString()}: value`,
    ).join('\n')}`;

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: largeMalformedInput,
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));

    expect(screen.getByTestId('fallback-confirmation-modal')).toBeInTheDocument();
    expect(
      screen.getByText(/Content exceeds 300 lines\. Use fallback agent\?/),
    ).toBeInTheDocument();
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('keeps passthrough output and skips fallback when large-content confirmation is canceled', async () => {
    const user = userEvent.setup();
    const largeMalformedInput = `{bad\n${Array.from(
      { length: 301 },
      (_, index) => `line-${index.toString()}: value`,
    ).join('\n')}`;

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: largeMalformedInput,
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-confirmation-modal')).not.toBeInTheDocument();
    });
    expect(prettifierRunMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('output-editor')).toHaveTextContent('line-0: value');
    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');
  });

  it('asks for a fallback agent when prettify fails and no fallback is configured', async () => {
    const user = userEvent.setup();
    preferencesGetAllMock.mockResolvedValue(createPreferences({ fallbackAgentId: null }));

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));

    expect(screen.getByTestId('fallback-confirmation-modal')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Couldn't prettify this text locally\. Call a fallback agent for this run\?/,
      ),
    ).toBeInTheDocument();
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('closes the no-fallback modal as No when escape is pressed', async () => {
    const user = userEvent.setup();
    preferencesGetAllMock.mockResolvedValue(createPreferences({ fallbackAgentId: null }));

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-confirmation-modal')).not.toBeInTheDocument();
    });
    expect(prettifierRunMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');
  });

  it('runs the default fallback agent when enter is pressed in the no-fallback modal', async () => {
    const user = userEvent.setup();
    preferencesGetAllMock.mockResolvedValue(createPreferences({ fallbackAgentId: null }));
    prettifierRunMock.mockResolvedValue(
      createPrettifierResponse({
        outputText: '{\n  "agent": "amp"\n}',
        agentId: 'amp',
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
    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(prettifierRunMock).toHaveBeenCalledTimes(1);
    });
    expect(prettifierRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackAgentIdOverride: 'amp',
      }),
    );
    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"agent": "amp"');
  });

  it('uses arrow navigation in the no-fallback modal to change the selected agent before running it', async () => {
    const user = userEvent.setup();
    preferencesGetAllMock.mockResolvedValue(createPreferences({ fallbackAgentId: null }));
    prettifierRunMock.mockResolvedValue(
      createPrettifierResponse({
        outputText: '{\n  "agent": "codex"\n}',
        agentId: 'codex',
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
    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByTestId('fallback-agent-combo-button')).toHaveTextContent('Codex');
    expect(prettifierRunMock).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(prettifierRunMock).toHaveBeenCalledTimes(1);
    });
    expect(prettifierRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackAgentIdOverride: 'codex',
      }),
    );
    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"agent": "codex"');
  });

  it('closes the no-fallback modal on escape even when the agent menu is open', async () => {
    const user = userEvent.setup();
    preferencesGetAllMock.mockResolvedValue(createPreferences({ fallbackAgentId: null }));

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    await renderApp();
    await user.click(screen.getByTestId('pane-segment-output'));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('fallback-agent-combo-panel')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-confirmation-modal')).not.toBeInTheDocument();
    });
    expect(prettifierRunMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');
  });

  it('runs a one-shot fallback agent only after the selection is confirmed from the main split button', async () => {
    const user = userEvent.setup();
    preferencesGetAllMock.mockResolvedValue(createPreferences({ fallbackAgentId: null }));
    prettifierRunMock.mockResolvedValue(
      createPrettifierResponse({
        outputText: '{\n  "agent": "amp"\n}',
        agentId: 'amp',
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
    await user.click(screen.getByTestId('fallback-agent-combo-toggle'));
    await user.click(screen.getByTestId('fallback-agent-combo-option-amp'));

    expect(prettifierRunMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('fallback-agent-combo-button'));

    await waitFor(() => {
      expect(prettifierRunMock).toHaveBeenCalledTimes(1);
    });
    expect(prettifierRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackAgentIdOverride: 'amp',
      }),
    );
    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"agent": "amp"');
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
      /Malformed JSON\s*Calling Codex/,
    );
    expect(screen.getByTestId('fallback-wait-line')).toHaveTextContent('Waiting for agent output');
    expect(screen.queryByTestId('output-editor')).not.toBeInTheDocument();

    deferredRun.resolve(createPrettifierResponse({ outputText: '{\n  "fromAgent": 1\n}' }));

    await waitFor(() => {
      expect(screen.queryByTestId('fallback-wait-screen')).not.toBeInTheDocument();
    });
  });

  it('cancels the active fallback request from the wait screen and keeps passthrough output visible', async () => {
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
    await user.click(screen.getByTestId('fallback-wait-cancel'));

    expect(prettifierCancelMock).toHaveBeenCalledWith({ requestId: request.requestId });
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-wait-screen')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');

    deferredRun.resolve(createPrettifierResponse({ fallbackStatus: 'failed-canceled' }));

    await waitFor(() => {
      expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');
    });
  });

  it('treats escape on the wait screen as cancel and keeps passthrough output visible', async () => {
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
    await user.keyboard('{Escape}');

    expect(prettifierCancelMock).toHaveBeenCalledWith({ requestId: request.requestId });
    await waitFor(() => {
      expect(screen.queryByTestId('fallback-wait-screen')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');

    deferredRun.resolve(createPrettifierResponse({ fallbackStatus: 'failed-canceled' }));

    await waitFor(() => {
      expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');
    });
  });

  it('shows the last five streamed fallback progress lines for the active request only', async () => {
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
      emitPrettifierProgress({ requestId: request.requestId, line: 'line 1' });
      emitPrettifierProgress({ requestId: request.requestId, line: 'line 2' });
      emitPrettifierProgress({ requestId: request.requestId, line: 'line 3' });
      emitPrettifierProgress({ requestId: request.requestId, line: 'line 4' });
      emitPrettifierProgress({ requestId: request.requestId, line: 'line 5' });
      emitPrettifierProgress({ requestId: request.requestId, line: 'line 6' });
    });
    expect(screen.getByTestId('fallback-wait-line')).not.toHaveTextContent('line 1');
    expect(screen.getByTestId('fallback-wait-line')).toHaveTextContent('line 2');
    expect(screen.getByTestId('fallback-wait-line')).toHaveTextContent('line 6');

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

  it('persists indentation size changes from the toolbar dropdown', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByTestId('indent-size-select'));
    await user.click(screen.getByTestId('indent-size-option-6'));

    expect(preferencesUpdateMock).toHaveBeenCalledWith({ indentSize: 6 });
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

  it('reindents already prettified output when indentation preference changes without rerunning prettifier', async () => {
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({ path: '/tmp/example.json', content: '{"outer":{"inner":1}}' });

    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Click' }));

    const output = await screen.findByTestId('output-editor');
    expect(output.textContent ?? '').toContain('\n    "inner": 1');
    expect(prettifierRunMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('indent-size-select'));
    await user.click(screen.getByTestId('indent-size-option-4'));

    expect(screen.getByTestId('output-editor').textContent ?? '').toContain('\n        "inner": 1');
    expect(prettifierRunMock).not.toHaveBeenCalled();
  });

  it('does not reindent passthrough output when indentation preference changes', async () => {
    const user = userEvent.setup();
    prettifierRunMock.mockResolvedValue(
      createPrettifierResponse({
        status: 'passthrough-no-fallback',
        outputText: '{bad',
        fallbackStatus: 'skipped-no-fallback',
        agentId: null,
      }),
    );

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
        ingestNotice: null,
      });
    });

    render(<App />);
    await user.click(screen.getByTestId('pane-segment-output'));

    await waitFor(() => {
      expect(prettifierRunMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');

    await user.click(screen.getByTestId('indent-size-select'));
    await user.click(screen.getByTestId('indent-size-option-7'));

    expect(screen.getByTestId('output-editor')).toHaveTextContent('{bad');
    expect(prettifierRunMock).toHaveBeenCalledTimes(1);
  });

  it('does not run prettifier when indentation changes with empty input', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByTestId('indent-size-select'));
    await user.click(screen.getByTestId('indent-size-option-5'));

    expect(preferencesUpdateMock).toHaveBeenCalledWith({ indentSize: 5 });
    expect(prettifierRunMock).not.toHaveBeenCalled();
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

  it('supports command shortcuts for pane switching, save/copy, new window, and reset', async () => {
    const user = userEvent.setup();

    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
        ingestNotice: null,
      });
    });

    await renderApp();

    await pressPrimaryShortcut(user, 'i');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');

    await pressPrimaryShortcut(user, 'o');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');

    await pressPrimaryShortcut(user, 's');
    await pressPrimaryShortcut(user, 'c', { shiftKey: true });
    await pressPrimaryShortcut(user, 'f');

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(copyMock).toHaveBeenCalledTimes(1);
    expect(openFindMock).toHaveBeenCalledTimes(1);

    await pressPrimaryShortcut(user, 'n');
    expect(openWindowMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');

    await pressPrimaryShortcut(user, 'n', { shiftKey: true });
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
  });

  it('resets the current window when the main process requests it', async () => {
    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
        ingestNotice: 'stale',
      });
    });

    await renderApp();

    act(() => {
      onResetCurrentWindowListener?.();
    });

    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
    expect(useUiStore.getState().inputText).toBe('');
    expect(useUiStore.getState().ingestNotice).toBeNull();
  });
});
