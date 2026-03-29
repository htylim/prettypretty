import { act, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import type { RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputEditorHandle } from '../../../../src/renderer/components/InputEditor';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';
import { useAppController } from '../../../../src/renderer/app/useAppController';
import { useUiStore } from '../../../../src/renderer/state/uiStore';

const usePrettifierFlowMock = vi.fn();
const usePreferencesFlowMock = vi.fn();
const useKeyboardShortcutsMock = vi.fn();
const useMouseNavigationShortcutsMock = vi.fn();
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

vi.mock('../../../../src/renderer/app/useMouseNavigationShortcuts', () => ({
  useMouseNavigationShortcuts: (options: unknown) => useMouseNavigationShortcutsMock(options),
}));

type HarnessHandle = {
  getController: () => ReturnType<typeof useAppController>;
};

type HarnessProps = {
  inputEditorRef: RefObject<InputEditorHandle | null>;
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

const createInputEditorRef = (
  overrides: Partial<InputEditorHandle> = {},
): RefObject<InputEditorHandle | null> => ({
  current: {
    collapseAll: vi.fn(),
    expandAll: vi.fn(),
    ...overrides,
  },
});

const createOutputEditorHandle = (
  overrides: Partial<OutputEditorHandle> = {},
): OutputEditorHandle => ({
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  focus: vi.fn(),
  openFind: vi.fn(),
  ...overrides,
});

describe('useAppController', () => {
  beforeEach(() => {
    usePrettifierFlowMock.mockReset();
    usePreferencesFlowMock.mockReset();
    useKeyboardShortcutsMock.mockReset();
    useMouseNavigationShortcutsMock.mockReset();

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
      invalidateHydratedPreferences: vi.fn(),
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
          onNavigationCommand: vi.fn().mockImplementation(() => vi.fn()),
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
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };

    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    expect(controller?.hasContent).toBe(true);
    expect(controller?.outputDocumentId).toMatch(/^output-/u);
    expect(controller?.outputPanes).toHaveLength(1);
    expect(controller?.outputPanes[0]).toMatchObject({
      paneId: 'output-root-pane',
      testId: 'output-editor',
    });
    expect(controller?.visibleOutputPanePosition).toBeNull();
    expect(controller?.hasDerivedOutputPane).toBe(false);
    expect(controller?.fallbackAgentId).toBe('codex');
    expect(controller?.fallbackWarningLineThreshold).toBe(300);
    expect(controller?.fallbackModalState).toBeNull();
    expect(controller?.fallbackAgentOptions).toEqual([
      { id: 'codex', name: 'Codex', enabled: true },
    ]);

    await act(async () => {
      await controller?.onThemeModeChange('dark');
      await controller?.onIndentSizeChange(6);
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
    expect(
      usePreferencesFlowMock.mock.results[0]?.value.invalidateHydratedPreferences,
    ).toHaveBeenCalledTimes(1);
    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).toHaveBeenCalledWith(
      '{"next":1}',
      'paste',
    );
    expect(useUiStore.getState().indentSize).toBe(6);
  });

  it('routes output collapse, expand, and find actions to the active output pane while save/copy stay root-scoped', async () => {
    const inputCollapse = vi.fn();
    const inputExpand = vi.fn();
    const inputEditorRef = createInputEditorRef({
      collapseAll: inputCollapse,
      expandAll: inputExpand,
    });
    const rootHandle = createOutputEditorHandle();
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(createElement(ControllerHarness, { inputEditorRef, ref }));

    ref.current?.getController().onCollapseAll();
    ref.current?.getController().onExpandAll();

    expect(inputCollapse).toHaveBeenCalledTimes(1);
    expect(inputExpand).toHaveBeenCalledTimes(1);

    act(() => {
      useUiStore.setState({ paneMode: 'output' });
    });
    rerender(createElement(ControllerHarness, { inputEditorRef, ref }));

    expect(ref.current?.getController().visibleOutputPanePosition).toEqual({
      current: 1,
      total: 1,
    });

    ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);
    ref.current?.getController().onCollapseAll();
    ref.current?.getController().onExpandAll();

    expect(rootHandle.collapseAll).toHaveBeenCalledTimes(1);
    expect(rootHandle.expandAll).toHaveBeenCalledTimes(1);

    useKeyboardShortcutsMock.mock.calls.at(-1)?.[0]?.openFind();
    expect(rootHandle.openFind).toHaveBeenCalledTimes(1);

    await act(async () => {
      await ref.current?.getController().onSave();
      await ref.current?.getController().onCopy();
    });

    expect(fileSaveMock).toHaveBeenCalledWith('{\n  "hello": true\n}');
    expect(clipboardCopyMock).toHaveBeenCalledWith('{\n  "hello": true\n}');
  });

  it('resets pane and renderer state on current-window reset', () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useUiStore.setState({ paneMode: 'output' });
    });
    rerender(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      ref.current
        ?.getController()
        .onOutputPaneHandleChange('output-root-pane', createOutputEditorHandle());
      onResetCurrentWindowListener?.();
    });

    expect(useUiStore.getState().paneMode).toBe('input');
    expect(useUiStore.getState().inputText).toBe('');
    expect(useUiStore.getState().ingestNotice).toBeNull();
    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(usePrettifierFlowMock.mock.results[0]?.value.resetPrettifierState).toHaveBeenCalled();
  });

  it('blocks output mode switches while fallback execution is active', () => {
    usePrettifierFlowMock.mockReturnValue({
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

    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef: createInputEditorRef(), ref }));

    act(() => {
      ref.current?.getController().onPaneModeChange('output');
    });

    expect(useUiStore.getState().paneMode).toBe('input');
    expect(usePrettifierFlowMock.mock.results[0]?.value.runPrettifier).not.toHaveBeenCalled();
  });

  it('safely no-ops side-effect actions when the preload bridge is unavailable', async () => {
    const originalBridge = (window as Window & { prettypretty?: unknown }).prettypretty;
    Object.defineProperty(window, 'prettypretty', {
      configurable: true,
      value: undefined,
    });

    const ref = { current: null as HarnessHandle | null };

    try {
      render(createElement(ControllerHarness, { inputEditorRef: createInputEditorRef(), ref }));

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
