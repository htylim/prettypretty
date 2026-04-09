import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RendererBootstrap } from '../../../src/renderer/RendererBootstrap';

const appRenderProps: Array<{ initialOpenFile: { path: string; content: string } | null }> = [];
const logWindowRenderMock = vi.fn();

vi.mock('../../../src/renderer/App', async () => {
  const React = await import('react');

  return {
    App: (props: { initialOpenFile: { path: string; content: string } | null }) => {
      appRenderProps.push(props);
      return React.createElement('div', { 'data-testid': 'app' });
    },
  };
});

vi.mock('../../../src/renderer/LogWindowApp', async () => {
  const React = await import('react');

  return {
    LogWindowApp: () => {
      logWindowRenderMock();
      return React.createElement('div', { 'data-testid': 'log-window' });
    },
  };
});

describe('RendererBootstrap', () => {
  beforeEach(() => {
    appRenderProps.length = 0;
    logWindowRenderMock.mockReset();
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: {
        app: {
          consumeInitialOpenFile: vi.fn().mockResolvedValue(null),
        },
      },
    });
  });

  it('renders the app immediately even when initial open-file consumption rejects', async () => {
    const consumeInitialOpenFile = vi.fn().mockRejectedValue(new Error('boom'));
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: {
        app: {
          consumeInitialOpenFile,
        },
      },
    });

    render(<RendererBootstrap activeWindow={null} />);

    expect(screen.getByTestId('app')).toBeInTheDocument();
    await waitFor(() => {
      expect(consumeInitialOpenFile).toHaveBeenCalledTimes(1);
    });
    expect(appRenderProps.at(-1)?.initialOpenFile).toBeNull();
  });

  it('updates the app with the consumed initial file when startup consumption succeeds', async () => {
    const consumeInitialOpenFile = vi.fn().mockResolvedValue({
      path: '/tmp/launch.json',
      content: '{"launch":true}',
    });
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: {
        app: {
          consumeInitialOpenFile,
        },
      },
    });

    render(<RendererBootstrap activeWindow={null} />);

    expect(screen.getByTestId('app')).toBeInTheDocument();
    await waitFor(() => {
      expect(appRenderProps.at(-1)?.initialOpenFile).toEqual({
        path: '/tmp/launch.json',
        content: '{"launch":true}',
      });
    });
  });

  it('renders the log window without probing startup open-file state', () => {
    const consumeInitialOpenFile = vi.fn().mockResolvedValue(null);
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: {
        app: {
          consumeInitialOpenFile,
        },
      },
    });

    render(<RendererBootstrap activeWindow="log" />);

    expect(screen.getByTestId('log-window')).toBeInTheDocument();
    expect(consumeInitialOpenFile).not.toHaveBeenCalled();
    expect(logWindowRenderMock).toHaveBeenCalledTimes(1);
  });
});
