import { act, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import type { RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputEditorHandle } from '../../../../src/renderer/components/InputEditor';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';
import { useUiStore } from '../../../../src/renderer/state/uiStore';
import { useAppController } from '../../../../src/renderer/app/useAppController';

const usePrettifierFlowMock = vi.fn();
const usePreferencesFlowMock = vi.fn();
const useKeyboardShortcutsMock = vi.fn();
const openWindowMock = vi.fn();
const dialogOpenFileMock = vi.fn();
const fileSaveMock = vi.fn();
const clipboardCopyMock = vi.fn();
const preferencesUpdateMock = vi.fn();
const telemetryLogMock = vi.fn();
let onResetCurrentWindowListener: (() => void) | null = null;
let resetCurrentWindowUnsubscribeMock: ReturnType<typeof vi.fn>;

vi.mock('../../../../src/renderer/app/usePrettifierFlow', () => ({
  usePrettifierFlow: (options: unknown) => usePrettifierFlowMock(options),
}));

vi.mock('../../../../src/renderer/app/usePreferencesFlow', () => ({
  usePreferencesFlow: (options: unknown) => usePreferencesFlowMock(options),
}));

vi.mock('../../../../src/renderer/app/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (options: unknown) => useKeyboardShortcutsMock(options),
}));

type HarnessHandle = {
  getController: () => ReturnType<typeof useAppController>;
};

type HarnessProps = {
  inputEditorRef: RefObject<InputEditorHandle | null>;
  outputEditorRef: RefObject<OutputEditorHandle | null>;
};

const ControllerHarness = forwardRef<HarnessHandle, HarnessProps>((props, ref) => {
  const controller = useAppController(props);

  useImperativeHandle(
    ref,
    () => ({
      getController: () => controller,
    }),
    [controller],
  );

  return null;
});

ControllerHarness.displayName = 'ControllerHarness';

describe('useAppController', () => {
  beforeEach(() => {
    usePrettifierFlowMock.mockReset();
    usePreferencesFlowMock.mockReset();
    useKeyboardShortcutsMock.mockReset();

    usePrettifierFlowMock.mockReturnValue({
      outputText: '{\n  "hello": true\n}',
      isLlmRunning: false,
      fallbackWaitState: null,
      cancelActiveFallback: vi.fn().mockResolvedValue(undefined),
      runPrettifier: vi.fn(),
      ingestInputText: vi.fn(),
      resetPrettifierState: vi.fn(),
      isInputAlreadyPrettified: vi.fn().mockReturnValue(false),
      reindentOutputIfPrettified: vi.fn().mockReturnValue(null),
      restoreOutputFromSnapshot: vi.fn(),
      alignOutputIndentAfterPersist: vi.fn(),
    });

    usePreferencesFlowMock.mockReturnValue({
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 300,
      persistThemeMode: vi.fn().mockResolvedValue(undefined),
      persistFallbackAgentId: vi.fn().mockResolvedValue(undefined),
    });
    openWindowMock.mockReset().mockResolvedValue(undefined);
    dialogOpenFileMock.mockReset().mockResolvedValue(null);
    fileSaveMock.mockReset().mockResolvedValue(null);
    clipboardCopyMock.mockReset().mockResolvedValue(undefined);
    preferencesUpdateMock
      .mockReset()
      .mockImplementation(async (patch: { indentSize?: number }) => ({
        indentSize: patch.indentSize ?? 2,
      }));
    telemetryLogMock.mockReset().mockResolvedValue(undefined);
    resetCurrentWindowUnsubscribeMock = vi.fn();
    onResetCurrentWindowListener = null;

    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: {
        dialog: {
          openFile: dialogOpenFileMock,
        },
        file: {
          save: fileSaveMock,
        },
        clipboard: {
          copy: clipboardCopyMock,
        },
        app: {
          getInfo: vi.fn(),
          openWindow: openWindowMock,
          onResetCurrentWindow: (listener: () => void) => {
            onResetCurrentWindowListener = listener;
            return resetCurrentWindowUnsubscribeMock;
          },
          initialThemeMode: null,
        },
        logs: {
          getHistory: vi.fn(),
          onLine: vi.fn(),
        },
        preferences: {
          getAll: vi.fn(),
          update: preferencesUpdateMock,
          reset: vi.fn(),
        },
        prettifier: {
          run: vi.fn(),
          cancel: vi.fn(),
          onProgress: vi.fn(),
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
        inputText: '{"hello":true}',
        ingestNotice: null,
      });
    });
  });

  it('exposes derived view-model data and delegates to flow hooks', async () => {
    const inputEditorRef: RefObject<InputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
      },
    };
    const outputEditorRef: RefObject<OutputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
        openFind: vi.fn(),
      },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(ControllerHarness, { inputEditorRef, outputEditorRef, ref }));

    const controller = ref.current?.getController();
    expect(controller?.hasContent).toBe(true);
    expect(controller?.outputDocumentId).toMatch(/^output-/u);
    expect(controller?.fallbackAgentId).toBe('codex');
    expect(controller?.fallbackWarningLineThreshold).toBe(300);
    expect(controller?.fallbackModalState).toBeNull();
    expect(controller?.fallbackAgentOptions).toEqual([
      { id: 'codex', name: 'Codex', enabled: true },
    ]);

    await act(async () => {
      await controller?.onThemeModeChange('dark');
    });
    await act(async () => {
      await controller?.onIndentSizeChange(6);
    });
    await act(async () => {
      await controller?.onFallbackAgentIdChange(null);
    });
    act(() => {
      controller?.onIngestInput('{"next":1}', 'paste');
    });

    expect(usePreferencesFlowMock.mock.results[0]?.value.persistThemeMode).toHaveBeenCalledWith(
      'dark',
    );
    expect(
      usePreferencesFlowMock.mock.results[0]?.value.persistFallbackAgentId,
    ).toHaveBeenCalledWith(null);
    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).toHaveBeenCalledWith(
      '{"next":1}',
      'paste',
    );
    expect(useUiStore.getState().indentSize).toBe(6);
  });

  it('routes collapse and expand actions to active editor ref', () => {
    const inputCollapse = vi.fn();
    const inputExpand = vi.fn();
    const outputCollapse = vi.fn();
    const outputExpand = vi.fn();

    const inputEditorRef: RefObject<InputEditorHandle | null> = {
      current: {
        collapseAll: inputCollapse,
        expandAll: inputExpand,
      },
    };
    const outputEditorRef: RefObject<OutputEditorHandle | null> = {
      current: {
        collapseAll: outputCollapse,
        expandAll: outputExpand,
        openFind: vi.fn(),
      },
    };
    const ref = { current: null as HarnessHandle | null };

    const { rerender } = render(
      createElement(ControllerHarness, { inputEditorRef, outputEditorRef, ref }),
    );

    ref.current?.getController().onCollapseAll();
    ref.current?.getController().onExpandAll();

    expect(inputCollapse).toHaveBeenCalledTimes(1);
    expect(inputExpand).toHaveBeenCalledTimes(1);
    expect(outputCollapse).not.toHaveBeenCalled();
    expect(outputExpand).not.toHaveBeenCalled();

    act(() => {
      useUiStore.setState({ paneMode: 'output' });
    });

    rerender(createElement(ControllerHarness, { inputEditorRef, outputEditorRef, ref }));

    ref.current?.getController().onCollapseAll();
    ref.current?.getController().onExpandAll();

    expect(outputCollapse).toHaveBeenCalledTimes(1);
    expect(outputExpand).toHaveBeenCalledTimes(1);
  });

  it('opens a new window via preload and resets only the current window on main-process signal', async () => {
    const inputEditorRef: RefObject<InputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
      },
    };
    const outputEditorRef: RefObject<OutputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
        openFind: vi.fn(),
      },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(ControllerHarness, { inputEditorRef, outputEditorRef, ref }));

    await act(async () => {
      ref.current?.getController().onNew();
      await Promise.resolve();
    });

    expect(openWindowMock).toHaveBeenCalledTimes(1);

    act(() => {
      useUiStore.setState({
        paneMode: 'output',
        inputText: '{"stale":true}',
        ingestNotice: 'stale',
      });
    });

    act(() => {
      onResetCurrentWindowListener?.();
    });

    expect(useUiStore.getState().paneMode).toBe('input');
    expect(useUiStore.getState().inputText).toBe('');
    expect(useUiStore.getState().ingestNotice).toBeNull();
    expect(usePrettifierFlowMock.mock.results[0]?.value.resetPrettifierState).toHaveBeenCalled();
  });

  it('blocks output mode switches while fallback execution is active', () => {
    usePrettifierFlowMock.mockReturnValueOnce({
      outputText: '',
      isLlmRunning: true,
      fallbackWaitState: {
        requestId: 1,
        formatLabel: 'JSON',
        agentName: 'Codex',
        progressLines: ['working...'],
      },
      cancelActiveFallback: vi.fn().mockResolvedValue(undefined),
      runPrettifier: vi.fn(),
      ingestInputText: vi.fn(),
      resetPrettifierState: vi.fn(),
      isInputAlreadyPrettified: vi.fn().mockReturnValue(false),
      reindentOutputIfPrettified: vi.fn().mockReturnValue(null),
      restoreOutputFromSnapshot: vi.fn(),
      alignOutputIndentAfterPersist: vi.fn(),
    });

    act(() => {
      useUiStore.setState({
        paneMode: 'input',
        inputText: '{bad',
      });
    });

    const inputEditorRef: RefObject<InputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
      },
    };
    const outputEditorRef: RefObject<OutputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
        openFind: vi.fn(),
      },
    };
    const ref = { current: null as HarnessHandle | null };

    render(createElement(ControllerHarness, { inputEditorRef, outputEditorRef, ref }));

    act(() => {
      ref.current?.getController().onPaneModeChange('output');
    });

    expect(useUiStore.getState().paneMode).toBe('input');
    expect(usePrettifierFlowMock.mock.results[0]?.value.runPrettifier).not.toHaveBeenCalled();
  });

  it('safely no-ops side-effect actions when preload bridge is unavailable', async () => {
    const originalBridge = (window as Window & { prettypretty?: unknown }).prettypretty;
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: undefined,
    });

    const inputEditorRef: RefObject<InputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
      },
    };
    const outputEditorRef: RefObject<OutputEditorHandle | null> = {
      current: {
        collapseAll: vi.fn(),
        expandAll: vi.fn(),
        openFind: vi.fn(),
      },
    };
    const ref = { current: null as HarnessHandle | null };

    try {
      render(createElement(ControllerHarness, { inputEditorRef, outputEditorRef, ref }));

      await act(async () => {
        ref.current?.getController().onNew();
        await ref.current?.getController().onSave();
        await ref.current?.getController().onCopy();
        await ref.current?.getController().onOpenFile();
      });

      expect(openWindowMock).not.toHaveBeenCalled();
      expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'prettypretty', {
        configurable: true,
        value: originalBridge,
      });
    }
  });
});
