import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../src/renderer/App';
import { useUiStore } from '../../../src/renderer/state/uiStore';

const openFileMock = vi.fn();
const saveMock = vi.fn();
const copyMock = vi.fn();

beforeEach(() => {
  openFileMock.mockReset();
  saveMock.mockReset();
  copyMock.mockReset();
  openFileMock.mockResolvedValue(null);
  saveMock.mockResolvedValue(null);
  copyMock.mockResolvedValue(undefined);

  Object.defineProperty(window, 'prettypretty', {
    configurable: true,
    value: {
      dialog: { openFile: openFileMock },
      file: { save: saveMock },
      clipboard: { copy: copyMock },
      app: { getInfo: vi.fn().mockResolvedValue({ name: 'prettypretty', version: '0.1.0' }) },
    },
  });

  act(() => {
    useUiStore.setState({
      paneMode: 'input',
      themeMode: 'light',
      inputText: '',
      searchQuery: '',
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
        searchQuery: 'a',
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
  });
});
