import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../../src/renderer/App';
import { useUiStore } from '../../../src/renderer/state/uiStore';

const openFileMock = vi.fn();
const saveMock = vi.fn();
const copyMock = vi.fn();

beforeEach(() => {
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
  it('renders empty-state prompt by default', () => {
    render(<App />);

    expect(screen.getByTestId('empty-state-cta')).toHaveTextContent(/^Paste, Drop or Click$/);
  });

  it('opens file dialog when click action is pressed', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Click' }));

    expect(openFileMock).toHaveBeenCalledTimes(1);
  });

  it('toggles pane to output and renders formatted content', async () => {
    const user = userEvent.setup();

    act(() => {
      useUiStore.setState({ inputText: '{"a":1}' });
    });

    render(<App />);

    await user.click(screen.getByTestId('toggle-pane'));

    expect(screen.getByTestId('output-editor')).toHaveTextContent('"a": 1');
  });
});
