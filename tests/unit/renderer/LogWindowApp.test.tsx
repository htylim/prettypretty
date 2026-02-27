import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogWindowApp } from '../../../src/renderer/LogWindowApp';

const getHistoryMock = vi.fn();
const unsubscribeMock = vi.fn();

let onLineListener: ((line: string) => void) | null = null;

beforeEach(() => {
  getHistoryMock.mockReset();
  unsubscribeMock.mockReset();
  onLineListener = null;

  getHistoryMock.mockResolvedValue(['{"event":"app.bootstrap.start"}']);

  Object.defineProperty(window, 'prettypretty', {
    configurable: true,
    value: {
      logs: {
        getHistory: getHistoryMock,
        onLine: (listener: (line: string) => void) => {
          onLineListener = listener;
          return unsubscribeMock;
        },
      },
    },
  });
});

describe('LogWindowApp', () => {
  it('renders log history on load', async () => {
    render(<LogWindowApp />);

    await waitFor(() => {
      expect(screen.getByTestId('log-window-content')).toHaveTextContent(
        '{"event":"app.bootstrap.start"}',
      );
    });
  });

  it('appends live log lines while open', async () => {
    render(<LogWindowApp />);

    await waitFor(() => {
      expect(getHistoryMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      onLineListener?.('{"event":"prettifier.run.completed"}');
    });

    expect(screen.getByTestId('log-window-content')).toHaveTextContent(
      '{"event":"prettifier.run.completed"}',
    );
  });

  it('unsubscribes from log stream on unmount', () => {
    const { unmount } = render(<LogWindowApp />);

    unmount();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
