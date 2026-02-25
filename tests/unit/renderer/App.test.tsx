import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../src/renderer/App';
import { useUiStore } from '../../../src/renderer/state/uiStore';
import type { Preferences } from '../../../src/shared/preferences';

const openFileMock = vi.fn();
const saveMock = vi.fn();
const copyMock = vi.fn();
const preferencesGetAllMock = vi.fn();
const preferencesUpdateMock = vi.fn();
const preferencesResetMock = vi.fn();
const outputCollapseAllMock = vi.fn();
const outputExpandAllMock = vi.fn();
const inputCollapseAllMock = vi.fn();
const inputExpandAllMock = vi.fn();
const openFindMock = vi.fn();
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
  fallbackAgentId: null,
  ...overrides,
});

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
    async (patch: { themeMode?: string; indentSize?: number }) => ({
      ...createPreferences(),
      themeMode: patch.themeMode ?? 'light',
      indentSize: patch.indentSize ?? 2,
    }),
  );
  preferencesResetMock.mockResolvedValue(createPreferences());

  Object.defineProperty(window, 'prettypretty', {
    configurable: true,
    value: {
      dialog: { openFile: openFileMock },
      file: { save: saveMock },
      clipboard: { copy: copyMock },
      app: { getInfo: vi.fn().mockResolvedValue({ name: 'prettypretty', version: '0.1.0' }) },
      preferences: {
        getAll: preferencesGetAllMock,
        update: preferencesUpdateMock,
        reset: preferencesResetMock,
      },
    },
  });

  act(() => {
    useUiStore.setState({
      paneMode: 'input',
      themeMode: 'light',
      indentSize: 2,
      inputText: '',
    });
  });
});

describe('App', () => {
  it('renders empty-state prompt with input active and output disabled in input mode', () => {
    render(<App />);

    expect(screen.getByTestId('empty-state-cta')).toHaveTextContent(/^Paste, Drop or Click$/);
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
  });

  it('opens file dialog when click action is pressed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Click' }));

    expect(openFileMock).toHaveBeenCalledTimes(1);
  });

  it('uses open file ingestion path to switch to output and render formatted content', async () => {
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({ path: '/tmp/example.json', content: '{"a":1}' });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Click' }));

    expect(openFileMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"a": 1');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses drop ingestion path to switch to output and render formatted content', async () => {
    const droppedFile = {
      text: vi.fn().mockResolvedValue('{"a":1}'),
    } as unknown as File;

    render(<App />);

    fireEvent.drop(screen.getByTestId('editor-shell'), {
      dataTransfer: { files: [droppedFile] },
    });

    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"a": 1');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses paste ingestion path to switch to output and render formatted content', async () => {
    render(<App />);

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '{"a":1}',
      },
    });

    expect(await screen.findByTestId('output-editor')).toHaveTextContent('"a": 1');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to output on empty ingestion and keeps output segment enabled', async () => {
    render(<App />);

    fireEvent.paste(screen.getByTestId('editor-shell'), {
      clipboardData: {
        getData: () => '',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'true');
    });

    expect(screen.getByTestId('pane-segment-output')).not.toBeDisabled();
    expect(screen.getByTestId('empty-state-cta')).toHaveTextContent(/^Paste, Drop or Click$/);
    expect(screen.getByRole('button', { name: 'Expand' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeDisabled();
  });

  it('typing in input editor updates text without forcing output mode', () => {
    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: 'alpha',
      });
    });

    render(<App />);

    fireEvent.change(screen.getByTestId('input-editor'), {
      target: { value: 'beta' },
    });

    expect(screen.getByTestId('input-editor')).toHaveValue('beta');
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
  });

  it('resets back to input mode and disables output segment', async () => {
    const user = userEvent.setup();

    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
      });
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.getByTestId('empty-state-cta')).toHaveTextContent(/^Paste, Drop or Click$/);
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toBeDisabled();
  });

  it('switches theme via segmented control and updates document dataset', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByTestId('theme-segment-dark'));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    expect(screen.getByTestId('theme-segment-dark')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('theme-segment-light')).toHaveAttribute('aria-pressed', 'false');
    expect(preferencesUpdateMock).toHaveBeenCalledWith({ themeMode: 'dark' });
  });

  it('hydrates theme mode from persisted preferences at startup', async () => {
    preferencesGetAllMock.mockResolvedValue(createPreferences({ themeMode: 'dark' }));

    render(<App />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    expect(preferencesGetAllMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('theme-segment-dark')).toHaveAttribute('aria-pressed', 'true');
  });

  it('rolls back optimistic theme change if persistence fails for latest request', async () => {
    const user = userEvent.setup();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    preferencesUpdateMock.mockRejectedValue(new Error('disk write failed'));

    render(<App />);

    await user.click(screen.getByTestId('theme-segment-dark'));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    expect(preferencesUpdateMock).toHaveBeenCalledWith({ themeMode: 'dark' });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('hydrates indent size from preferences and applies it to formatted output', async () => {
    preferencesGetAllMock.mockResolvedValue(createPreferences({ indentSize: 4 }));
    const user = userEvent.setup();
    openFileMock.mockResolvedValue({ path: '/tmp/example.json', content: '{"outer":{"inner":1}}' });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Click' }));

    const output = await screen.findByTestId('output-editor');
    const renderedText = output.textContent ?? '';
    expect(renderedText).toContain('\n        "inner": 1');
  });

  it('wires collapse and expand toolbar actions to output editor in output mode', async () => {
    const user = userEvent.setup();

    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
      });
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    await user.click(screen.getByRole('button', { name: 'Expand' }));

    expect(outputCollapseAllMock).toHaveBeenCalledTimes(1);
    expect(outputExpandAllMock).toHaveBeenCalledTimes(1);
    expect(inputCollapseAllMock).not.toHaveBeenCalled();
    expect(inputExpandAllMock).not.toHaveBeenCalled();
  });

  it('wires collapse and expand toolbar actions to input editor in input mode', async () => {
    const user = userEvent.setup();

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: 'alpha',
      });
    });

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Collapse' }));
    await user.click(screen.getByRole('button', { name: 'Expand' }));

    expect(inputCollapseAllMock).toHaveBeenCalledTimes(1);
    expect(inputExpandAllMock).toHaveBeenCalledTimes(1);
    expect(outputCollapseAllMock).not.toHaveBeenCalled();
    expect(outputExpandAllMock).not.toHaveBeenCalled();
  });

  it('supports command shortcuts for pane switching, save/copy, and reset', () => {
    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"a":1}',
      });
    });

    render(<App />);

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
    expect(screen.getByTestId('empty-state-cta')).toHaveTextContent(/^Paste, Drop or Click$/);
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps output-only shortcuts disabled in input mode', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 's', metaKey: true });
    fireEvent.keyDown(window, { key: 'c', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 'o', metaKey: true });

    expect(saveMock).not.toHaveBeenCalled();
    expect(copyMock).not.toHaveBeenCalled();
    expect(openFindMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('pane-segment-input')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('pane-segment-output')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('pane-segment-output')).toBeDisabled();
  });
});
