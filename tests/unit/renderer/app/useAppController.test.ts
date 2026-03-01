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
      persistThemeMode: vi.fn().mockResolvedValue(undefined),
      persistFallbackAgentId: vi.fn().mockResolvedValue(undefined),
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

  it('blocks output mode switches while fallback execution is active', () => {
    usePrettifierFlowMock.mockReturnValueOnce({
      outputText: '',
      isLlmRunning: true,
      fallbackWaitState: {
        requestId: 1,
        formatLabel: 'JSON',
        agentName: 'Codex',
        progressLine: 'working...',
      },
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
        await ref.current?.getController().onSave();
        await ref.current?.getController().onCopy();
        await ref.current?.getController().onOpenFile();
      });

      expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'prettypretty', {
        configurable: true,
        value: originalBridge,
      });
    }
  });
});
