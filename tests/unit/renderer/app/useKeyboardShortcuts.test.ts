import { fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../../../../src/renderer/app/useKeyboardShortcuts';

const { hasPrimaryModifierMock } = vi.hoisted(() => ({
  hasPrimaryModifierMock: vi.fn(
    (event: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }) =>
      Boolean(event.metaKey) && !event.ctrlKey && !event.altKey,
  ),
}));

vi.mock('../../../../src/renderer/app/primaryModifier', () => ({
  hasPrimaryModifier: hasPrimaryModifierMock,
}));

type HarnessProps = {
  isOutputMode: boolean;
  paneMode: 'input' | 'output';
  hasContent: boolean;
  canPopOutputPane: boolean;
  openNewWindow: () => void;
  resetCurrentWindow: () => void;
  handlePaneModeChange: (nextMode: 'input' | 'output') => void;
  saveOutput: () => Promise<void>;
  copyOutput: () => Promise<void>;
  openFind: () => void;
  closeOutputPane: () => void;
  navigateOutputPaneViewport: (stepDelta: number) => void;
};

const KeyboardHarness = (props: HarnessProps) => {
  useKeyboardShortcuts(props);
  return null;
};

const createDefaults = () => ({
  isOutputMode: false,
  paneMode: 'input' as const,
  hasContent: false,
  canPopOutputPane: false,
  openNewWindow: vi.fn(),
  resetCurrentWindow: vi.fn(),
  handlePaneModeChange: vi.fn(),
  saveOutput: vi.fn().mockResolvedValue(undefined),
  copyOutput: vi.fn().mockResolvedValue(undefined),
  openFind: vi.fn(),
  closeOutputPane: vi.fn(),
  navigateOutputPaneViewport: vi.fn(),
});

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    hasPrimaryModifierMock.mockClear();
  });

  it('runs copy shortcut only in output mode with Cmd+Shift+C', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(KeyboardHarness, defaults));

    fireEvent.keyDown(window, { key: 'c', metaKey: true, shiftKey: true });
    expect(defaults.copyOutput).not.toHaveBeenCalled();

    rerender(
      createElement(KeyboardHarness, {
        ...defaults,
        hasContent: true,
        isOutputMode: true,
        paneMode: 'output',
      }),
    );

    fireEvent.keyDown(window, { key: 'c', metaKey: true, shiftKey: true });
    expect(defaults.copyOutput).toHaveBeenCalledTimes(1);
  });

  it('gates Cmd+O by output availability and switches when allowed', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(KeyboardHarness, defaults));

    fireEvent.keyDown(window, { key: 'o', metaKey: true });
    expect(defaults.handlePaneModeChange).not.toHaveBeenCalled();

    rerender(createElement(KeyboardHarness, { ...defaults, hasContent: true }));

    fireEvent.keyDown(window, { key: 'o', metaKey: true });
    expect(defaults.handlePaneModeChange).toHaveBeenCalledWith('output');
  });

  it('handles Cmd+N/Cmd+Shift+N/Cmd+S/Cmd+F with mode and modifier guards', () => {
    const defaults = createDefaults();
    render(
      createElement(KeyboardHarness, {
        ...defaults,
        hasContent: true,
        isOutputMode: true,
        paneMode: 'output',
      }),
    );

    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    fireEvent.keyDown(window, { key: 'n', metaKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    fireEvent.keyDown(window, { key: 's', metaKey: true, ctrlKey: true });

    expect(defaults.openNewWindow).toHaveBeenCalledTimes(1);
    expect(defaults.resetCurrentWindow).toHaveBeenCalledTimes(1);
    expect(defaults.saveOutput).toHaveBeenCalledTimes(1);
    expect(defaults.openFind).toHaveBeenCalledTimes(1);
  });

  it('routes literal Ctrl+Left/Ctrl+Right to split navigation only in output mode', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(KeyboardHarness, defaults));

    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    expect(defaults.navigateOutputPaneViewport).not.toHaveBeenCalled();

    rerender(
      createElement(KeyboardHarness, {
        ...defaults,
        isOutputMode: true,
        paneMode: 'output',
      }),
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });

    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(1, -1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(2, 1);
  });

  it('routes browser-style back and forward shortcuts to split navigation in output mode', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(KeyboardHarness, defaults));

    fireEvent.keyDown(window, { key: '[', metaKey: true });
    fireEvent.keyDown(window, { key: ']', metaKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });
    expect(defaults.navigateOutputPaneViewport).not.toHaveBeenCalled();

    rerender(
      createElement(KeyboardHarness, {
        ...defaults,
        isOutputMode: true,
        paneMode: 'output',
      }),
    );

    fireEvent.keyDown(window, { key: '[', metaKey: true });
    fireEvent.keyDown(window, { key: ']', metaKey: true });
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true });

    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(1, -1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(2, 1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(3, -1);
    expect(defaults.navigateOutputPaneViewport).toHaveBeenNthCalledWith(4, 1);
  });

  it('pops splits on Escape only when output mode is active and the event is not consumed', () => {
    const defaults = createDefaults();
    const { rerender } = render(createElement(KeyboardHarness, defaults));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaults.closeOutputPane).not.toHaveBeenCalled();

    rerender(
      createElement(KeyboardHarness, {
        ...defaults,
        canPopOutputPane: true,
        isOutputMode: true,
        paneMode: 'output',
      }),
    );

    const preventedEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    preventedEscape.preventDefault();
    window.dispatchEvent(preventedEscape);
    expect(defaults.closeOutputPane).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaults.closeOutputPane).toHaveBeenCalledTimes(1);
  });
});
