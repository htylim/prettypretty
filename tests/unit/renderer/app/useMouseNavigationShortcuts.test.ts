import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMouseNavigationShortcuts } from '../../../../src/renderer/app/useMouseNavigationShortcuts';

let onNavigationCommandListener:
  | ((command: 'browser-backward' | 'browser-forward') => void)
  | null = null;
const onNavigationCommandUnsubscribeMock = vi.fn();

type HarnessProps = {
  isOutputMode: boolean;
  navigateOutputPaneViewport: (stepDelta: number) => void;
};

const MouseNavigationHarness = (props: HarnessProps) => {
  useMouseNavigationShortcuts(props);
  return null;
};

const createDefaults = () => ({
  isOutputMode: false,
  navigateOutputPaneViewport: vi.fn(),
});

describe('useMouseNavigationShortcuts', () => {
  beforeEach(() => {
    onNavigationCommandListener = null;
    onNavigationCommandUnsubscribeMock.mockReset();

    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: {
        app: {
          onNavigationCommand: (listener: typeof onNavigationCommandListener) => {
            onNavigationCommandListener = listener;
            return onNavigationCommandUnsubscribeMock;
          },
        },
      },
    });
  });

  it('routes native browser navigation commands to split navigation only in output mode', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(MouseNavigationHarness, defaults));

    onNavigationCommandListener?.('browser-backward');
    onNavigationCommandListener?.('browser-forward');
    expect(defaults.navigateOutputPaneViewport).not.toHaveBeenCalled();

    rerender(
      createElement(MouseNavigationHarness, {
        ...defaults,
        isOutputMode: true,
      }),
    );

    onNavigationCommandListener?.('browser-backward');
    onNavigationCommandListener?.('browser-forward');

    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(1, -1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(2, 1);
  });

  it('uses side mouse buttons as a renderer fallback in output mode', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(MouseNavigationHarness, defaults));

    fireEvent.mouseDown(window, { button: 3 });
    fireEvent.mouseDown(window, { button: 4 });
    expect(defaults.navigateOutputPaneViewport).not.toHaveBeenCalled();

    rerender(
      createElement(MouseNavigationHarness, {
        ...defaults,
        isOutputMode: true,
      }),
    );

    fireEvent.mouseDown(window, { button: 3 });
    fireEvent.mouseDown(window, { button: 4 });

    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(1, -1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(2, 1);
  });

  it('deduplicates native and DOM delivery for the same mouse navigation command', () => {
    const defaults = createDefaults();
    render(
      createElement(MouseNavigationHarness, {
        ...defaults,
        isOutputMode: true,
      }),
    );

    onNavigationCommandListener?.('browser-backward');
    fireEvent.mouseDown(window, { button: 3 });
    onNavigationCommandListener?.('browser-forward');
    fireEvent.mouseDown(window, { button: 4 });

    expect(defaults.navigateOutputPaneViewport).toHaveBeenCalledTimes(2);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(1, -1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(2, 1);
  });
});
