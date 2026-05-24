import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import type { RefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InputEditorHandle } from '../../../../src/renderer/components/InputEditor';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';
import type { RefreshableOpenTextFile } from '../../../../src/shared/ipc-contracts';
import { useAppController } from '../../../../src/renderer/app/useAppController';
import {
  createOutputPaneChainState,
  openOrReplaceDerivedOutputPane,
} from '../../../../src/renderer/app/outputPaneDomain';
import { createInitialDocumentSessionState } from '../../../../src/renderer/app/session/documentSessionDomain';
import { useDocumentSession } from '../../../../src/renderer/app/session/useDocumentSession';

const usePrettifierFlowMock = vi.fn();
const usePreferencesFlowMock = vi.fn();
const useKeyboardShortcutsMock = vi.fn();
const useMouseNavigationShortcutsMock = vi.fn();
const openWindowMock = vi.fn();
const consumeInitialOpenFileMock = vi.fn();
const dialogOpenFileMock = vi.fn();
const fileSaveMock = vi.fn();
const fileRefreshOpenFileMock = vi.fn();
const fileClearOpenFileSourceMock = vi.fn();
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
  initialOpenFile?: RefreshableOpenTextFile | null;
  inputEditorRef: RefObject<InputEditorHandle | null>;
};

const ControllerHarness = forwardRef<HarnessHandle, HarnessProps>((props, ref) => {
  const controller = useAppController({
    initialOpenFile: props.initialOpenFile ?? null,
    inputEditorRef: props.inputEditorRef,
  });

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
    captureViewportSnapshot: vi.fn().mockReturnValue(null),
    restoreViewportSnapshot: vi.fn(),
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
  captureViewportSnapshot: vi.fn().mockReturnValue(null),
  restoreViewportSnapshot: vi.fn(),
  ...overrides,
});

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};

describe('useAppController', () => {
  beforeEach(() => {
    usePrettifierFlowMock.mockReset();
    usePreferencesFlowMock.mockReset();
    useKeyboardShortcutsMock.mockReset();
    useMouseNavigationShortcutsMock.mockReset();
    useDocumentSession.setState(createInitialDocumentSessionState());

    usePrettifierFlowMock.mockReturnValue({
      outputText: '{\n  "hello": true\n}',
      outputLanguageOverride: null,
      isLlmRunning: false,
      fallbackWaitState: null,
      ingestRejectionPrompt: null,
      cancelActiveFallback: vi.fn().mockResolvedValue(undefined),
      runPrettifierRequest: vi.fn().mockResolvedValue({
        status: 'applied-local',
        outputText: '{\n  "query": "formatted"\n}',
        localResult: {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: 'json',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      }),
      runPrettifier: vi.fn(),
      ingestInputText: vi.fn().mockResolvedValue('accepted'),
      openReadableIngestSlice: vi.fn(),
      dismissIngestRejection: vi.fn(),
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
    consumeInitialOpenFileMock.mockReset().mockResolvedValue(null);
    dialogOpenFileMock.mockReset().mockResolvedValue(null);
    fileSaveMock.mockReset().mockResolvedValue(null);
    fileRefreshOpenFileMock.mockReset().mockResolvedValue({
      path: '/tmp/source.json',
      content: '{"refreshed":true}',
      sourceToken: 'refresh-token',
      sourceKind: 'refresh-file',
    });
    fileClearOpenFileSourceMock.mockReset().mockResolvedValue(true);
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
          refreshOpenFile: fileRefreshOpenFileMock,
          commitOpenFileSource: vi.fn(),
          clearOpenFileSource: fileClearOpenFileSourceMock,
        },
        clipboard: {
          copy: clipboardCopyMock,
        },
        app: {
          getInfo: vi.fn(),
          openWindow: openWindowMock,
          consumeInitialOpenFile: consumeInitialOpenFileMock,
          onResetCurrentWindow: (listener: () => void) => {
            onResetCurrentWindowListener = listener;
            return resetCurrentWindowUnsubscribeMock;
          },
          onRefreshCurrentWindow: vi.fn().mockImplementation(() => vi.fn()),
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
      useDocumentSession.setState({
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
    expect(useDocumentSession.getState().indentSize).toBe(6);
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
      useDocumentSession.setState({ paneMode: 'output' });
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

  it('opens a context menu target for JSON strings and expands the clicked pane into a child output pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    expect(controller?.outputContextMenuState).toBeNull();

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 24,
          anchorY: 36,
          isContentHit: true,
          position: { lineNumber: 2, column: 4 },
          hasSelection: false,
        },
        '{\n  "query": "{\\n  field\\n}"\n}',
        'json',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: '{\n  field\n}',
    });

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 24,
          anchorY: 36,
          isContentHit: true,
          position: { lineNumber: 2, column: 4 },
          hasSelection: true,
        },
        '{\n  "query": "{\\n  field\\n}"\n}',
        'json',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toBeNull();

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 24,
          anchorY: 36,
          isContentHit: true,
          position: { lineNumber: 2, column: 4 },
          hasSelection: false,
        },
        '{\n  "query": "{\\n  field\\n}"\n}',
        'json',
      );
    });

    await act(async () => {
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(usePrettifierFlowMock.mock.results[0]?.value.runPrettifierRequest).toHaveBeenCalledWith(
      '{\n  field\n}',
      'context-pane-prettify',
    );
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "query": "formatted"\n}',
    });
  });

  it('replaces an extracted-source child when context prettify opens a new direct child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();

    act(() => {
      controller?.onToggleExtractedSourcePane('output-root-pane', {
        kind: 'extracted-source',
        value: '{\n  "leaf": 1\n}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 2,
        },
        lineNumberStart: 2,
      });
    });

    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      activeExtractedSourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    });
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      lineNumberStart: 2,
      value: '{\n  "leaf": 1\n}',
    });

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 24,
          anchorY: 36,
          isContentHit: true,
          position: { lineNumber: 2, column: 4 },
          hasSelection: false,
        },
        '{\n  "query": "{\\n  field\\n}"\n}',
        'json',
      );
    });

    await act(async () => {
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      activeExtractedSourceRange: null,
    });
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      lineNumberStart: null,
      value: '{\n  "query": "formatted"\n}',
    });
  });

  it('resolves YAML block scalars through the output context menu and opens a child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    const yamlText = 'name: hello-world';
    const runPrettifierRequest = usePrettifierFlowMock.mock.results[0]?.value
      ?.runPrettifierRequest as ReturnType<typeof vi.fn>;

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 18,
          anchorY: 24,
          isContentHit: true,
          position: { lineNumber: 1, column: 4 },
          hasSelection: false,
        },
        yamlText,
        'yaml',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: 'hello-world',
      paneDocumentLanguage: 'yaml',
    });

    await act(async () => {
      runPrettifierRequest.mockResolvedValueOnce({
        status: 'applied-local',
        outputText: '{\n  "leaf": 1\n}',
        localResult: {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: 'json',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      });
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(runPrettifierRequest).toHaveBeenCalledWith('hello-world', 'context-pane-prettify');
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "leaf": 1\n}',
    });
  });

  it('resolves TypeScript string bindings through the output context menu and opens a child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    const tsText = 'const query: string = "{\\"leaf\\":1}";';
    const runPrettifierRequest = usePrettifierFlowMock.mock.results[0]?.value
      ?.runPrettifierRequest as ReturnType<typeof vi.fn>;

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 20,
          anchorY: 28,
          isContentHit: true,
          position: { lineNumber: 1, column: 7 },
          hasSelection: false,
        },
        tsText,
        'typescript',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'typescript',
    });

    await act(async () => {
      runPrettifierRequest.mockResolvedValueOnce({
        status: 'applied-local',
        outputText: '{\n  "leaf": 1\n}',
        localResult: {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: 'json',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      });
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(runPrettifierRequest).toHaveBeenCalledWith('{"leaf":1}', 'context-pane-prettify');
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "leaf": 1\n}',
    });
  });

  it('resolves json graphql query strings through the output context menu and opens a child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    const jsonText =
      '{\n' +
      '  "query": "query ListShipments(\\n  $first: Int\\n) {\\n  shipments(first: $first) {\\n    edges {\\n      node {\\n        id\\n      }\\n    }\\n  }\\n}",\n' +
      '  "variables": {"first": 2}\n' +
      '}';
    const decodedQuery =
      'query ListShipments(\n' +
      '  $first: Int\n' +
      ') {\n' +
      '  shipments(first: $first) {\n' +
      '    edges {\n' +
      '      node {\n' +
      '        id\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '}';
    const runPrettifierRequest = usePrettifierFlowMock.mock.results[0]?.value
      ?.runPrettifierRequest as ReturnType<typeof vi.fn>;

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 24,
          anchorY: 30,
          isContentHit: true,
          position: { lineNumber: 2, column: 4 },
          hasSelection: false,
        },
        jsonText,
        'json',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: decodedQuery,
      paneDocumentLanguage: 'json',
    });

    await act(async () => {
      runPrettifierRequest.mockResolvedValueOnce({
        status: 'applied-local',
        outputText: decodedQuery,
        localResult: {
          kind: 'applied',
          family: 'graphql',
          mode: 'canonical',
          variant: 'graphql',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      });
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(runPrettifierRequest).toHaveBeenCalledWith(decodedQuery, 'context-pane-prettify');
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: decodedQuery,
    });
  });

  it('resolves GraphQL block string arguments through the output context menu and opens a child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    const graphqlText = 'mutation Update { update(payload: """\n  {\n    "leaf": 1\n  }\n""") }';
    const runPrettifierRequest = usePrettifierFlowMock.mock.results[0]?.value
      ?.runPrettifierRequest as ReturnType<typeof vi.fn>;

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 26,
          anchorY: 34,
          isContentHit: true,
          position: { lineNumber: 1, column: 27 },
          hasSelection: false,
        },
        graphqlText,
        'graphql',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: '{\n  "leaf": 1\n}',
      paneDocumentLanguage: 'graphql',
    });

    await act(async () => {
      runPrettifierRequest.mockResolvedValueOnce({
        status: 'applied-local',
        outputText: '{\n  "leaf": 1\n}',
        localResult: {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: 'json',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      });
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(runPrettifierRequest).toHaveBeenCalledWith('{\n  "leaf": 1\n}', 'context-pane-prettify');
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "leaf": 1\n}',
    });
  });

  it('resolves XML attribute payloads through the output context menu and opens a child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    const xmlText = '<request payload="{&quot;leaf&quot;:1}" />';
    const runPrettifierRequest = usePrettifierFlowMock.mock.results[0]?.value
      ?.runPrettifierRequest as ReturnType<typeof vi.fn>;

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 28,
          anchorY: 36,
          isContentHit: true,
          position: { lineNumber: 1, column: 10 },
          hasSelection: false,
        },
        xmlText,
        'xml',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
    });

    await act(async () => {
      runPrettifierRequest.mockResolvedValueOnce({
        status: 'applied-local',
        outputText: '{\n  "leaf": 1\n}',
        localResult: {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: 'json',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      });
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(runPrettifierRequest).toHaveBeenCalledWith('{"leaf":1}', 'context-pane-prettify');
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "leaf": 1\n}',
    });
  });

  it('resolves SQL string literals through the output context menu and opens a child pane', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    const controller = ref.current?.getController();
    const sqlText = 'select * from requests where payload = \'{"leaf":1}\';';
    const runPrettifierRequest = usePrettifierFlowMock.mock.results[0]?.value
      ?.runPrettifierRequest as ReturnType<typeof vi.fn>;

    act(() => {
      controller?.onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 30,
          anchorY: 38,
          isContentHit: true,
          position: { lineNumber: 1, column: 30 },
          hasSelection: false,
        },
        sqlText,
        'sql',
      );
    });

    expect(ref.current?.getController().outputContextMenuState?.target).toMatchObject({
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'sql',
    });

    await act(async () => {
      runPrettifierRequest.mockResolvedValueOnce({
        status: 'applied-local',
        outputText: '{\n  "leaf": 1\n}',
        localResult: {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: 'json',
        },
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: 1,
      });
      await ref.current?.getController().onTriggerOutputContextPrettify();
    });

    expect(runPrettifierRequest).toHaveBeenCalledWith('{"leaf":1}', 'context-pane-prettify');
    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "leaf": 1\n}',
    });
  });

  it('resets pane and renderer state on current-window reset', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        paneMode: 'output',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"a":1}',
        },
      });
    });
    rerender(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      ref.current
        ?.getController()
        .onOutputPaneHandleChange('output-root-pane', createOutputEditorHandle());
      onResetCurrentWindowListener?.();
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().paneMode).toBe('input');
    });
    expect(useDocumentSession.getState().inputText).toBe('');
    expect(useDocumentSession.getState().ingestNotice).toBeNull();
    expect(fileClearOpenFileSourceMock).toHaveBeenCalledWith({
      sourceToken: 'token-1',
      path: '/tmp/source.json',
      scope: 'committed',
    });
    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(usePrettifierFlowMock.mock.results[0]?.value.resetPrettifierState).toHaveBeenCalled();
  });

  it('stale reset clear result preserves newer input and disables local file source', async () => {
    const clearDeferred = createDeferred<boolean>();
    fileClearOpenFileSourceMock.mockReturnValueOnce(clearDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      onResetCurrentWindowListener?.();
      useDocumentSession.setState({ inputText: 'newer edit' });
    });

    await act(async () => {
      clearDeferred.resolve(true);
      await clearDeferred.promise;
    });

    expect(useDocumentSession.getState().inputText).toBe('newer edit');
    expect(useDocumentSession.getState().fileSource).toBeNull();
    expect(
      usePrettifierFlowMock.mock.results[0]?.value.resetPrettifierState,
    ).not.toHaveBeenCalled();
  });

  it('stale reset clear result preserves newer session state when input is unchanged', async () => {
    const clearDeferred = createDeferred<boolean>();
    fileClearOpenFileSourceMock.mockReturnValueOnce(clearDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        outputText: '{\n  "old": true\n}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      onResetCurrentWindowListener?.();
      useDocumentSession.setState({
        outputText: '{\n  "newer": true\n}',
        ingestNotice: 'Newer state',
      });
    });

    await act(async () => {
      clearDeferred.resolve(true);
      await clearDeferred.promise;
    });

    expect(useDocumentSession.getState().inputText).toBe('{"old":true}');
    expect(useDocumentSession.getState().outputText).toContain('"newer": true');
    expect(useDocumentSession.getState().ingestNotice).toBe('Newer state');
    expect(useDocumentSession.getState().fileSource).toBeNull();
    expect(
      usePrettifierFlowMock.mock.results[0]?.value.resetPrettifierState,
    ).not.toHaveBeenCalled();
  });

  it('exposes refresh availability only for refreshable idle file-backed sessions', () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(createElement(ControllerHarness, { inputEditorRef, ref }));

    expect(ref.current?.getController().canRefreshFile).toBe(false);

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });
    rerender(createElement(ControllerHarness, { inputEditorRef, ref }));

    expect(ref.current?.getController().canRefreshFile).toBe(true);
  });

  it('refresh reads the current file and routes refreshed content through refresh ingestion', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        paneMode: 'output',
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
    });

    await waitFor(() => {
      expect(fileRefreshOpenFileMock).toHaveBeenCalledWith({
        path: '/tmp/source.json',
        sourceToken: 'token-1',
      });
    });
    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).toHaveBeenCalledWith(
      '{"refreshed":true}',
      'refresh-file',
      {
        fileSource: {
          sourceToken: 'refresh-token',
          path: '/tmp/source.json',
          sourceKind: 'refresh-file',
          baselineText: '{"refreshed":true}',
        },
        switchToOutputOnComplete: true,
        awaitPrettifierCompletion: true,
        isCurrent: expect.any(Function),
      },
    );
    const refreshOptions = usePrettifierFlowMock.mock.results[0]?.value.ingestInputText.mock
      .calls[0]?.[2] as { isCurrent: () => boolean };
    expect(refreshOptions.isCurrent()).toBe(true);

    act(() => {
      useDocumentSession.setState({ paneMode: 'input' });
    });

    expect(refreshOptions.isCurrent()).toBe(false);
  });

  it('restores output refresh viewport on the root pane after derived panes reset', async () => {
    const rootHandle = createOutputEditorHandle();
    const derivedHandle = createOutputEditorHandle({
      captureViewportSnapshot: vi.fn().mockReturnValue({
        lineNumber: 2,
        column: 3,
        topLineNumber: 1,
        scrollLeft: 0,
        scrollTop: 40,
      }),
    });
    const outputPaneChainState = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      {
        kind: 'source-range',
        documentId: 'root-doc',
        value: '{"old":true}',
        sourceRange: {
          startLineNumber: 10,
          startColumn: 1,
          endLineNumber: 12,
          endColumn: 2,
        },
      },
    );
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    useDocumentSession.setState({
      paneMode: 'output',
      inputText: '{"old":true}',
      outputPaneChainState,
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"old":true}',
      },
    });
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;
    ingestInputText.mockImplementationOnce(async (content: string) => {
      useDocumentSession.setState({
        inputText: content,
        fileSource: {
          sourceToken: 'refresh-token',
          path: '/tmp/source.json',
          sourceKind: 'refresh-file',
          lastLoadedText: content,
        },
      });
      return 'accepted';
    });

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);
      ref.current?.getController().onOutputPaneHandleChange('output-pane-1', derivedHandle);
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
    });

    await waitFor(() => {
      expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).toHaveBeenCalledWith(
        '{"refreshed":true}',
        'refresh-file',
        expect.any(Object),
      );
    });
    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);
    });

    await waitFor(() => {
      expect(rootHandle.restoreViewportSnapshot).toHaveBeenCalledWith({
        lineNumber: 2,
        column: 3,
        topLineNumber: 1,
        scrollLeft: 0,
        scrollTop: 40,
        restoreScrollPosition: false,
      });
    });
    expect(derivedHandle.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('clears output context state when output refresh ingests an empty file into input mode', async () => {
    const outputPaneChainState = openOrReplaceDerivedOutputPane(
      createOutputPaneChainState(),
      'output-root-pane',
      {
        kind: 'source-range',
        documentId: 'root-doc',
        value: '{"old":true}',
        sourceRange: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 13,
        },
      },
    );
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    fileRefreshOpenFileMock.mockResolvedValueOnce({
      path: '/tmp/source.json',
      content: '',
      sourceToken: 'refresh-token',
      sourceKind: 'refresh-file',
    });
    useDocumentSession.setState({
      paneMode: 'output',
      inputText: '{"old":true}',
      outputPaneChainState,
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"old":true}',
      },
    });
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;
    ingestInputText.mockImplementationOnce(async (content: string) => {
      useDocumentSession.setState({
        paneMode: 'input',
        inputText: content,
        fileSource: {
          sourceToken: 'refresh-token',
          path: '/tmp/source.json',
          sourceKind: 'refresh-file',
          lastLoadedText: content,
        },
      });
      return 'accepted';
    });

    act(() => {
      ref.current?.getController().onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 12,
          anchorY: 24,
          isContentHit: true,
          position: { lineNumber: 1, column: 2 },
          hasSelection: false,
        },
        '{"old":true}',
        'json',
      );
    });
    expect(ref.current?.getController().outputContextMenuState).not.toBeNull();
    expect(useDocumentSession.getState().outputPaneChainState.derivedPanes).toHaveLength(1);

    act(() => {
      ref.current?.getController().onRefreshFile();
    });

    await waitFor(() => {
      expect(ref.current?.getController().outputContextMenuState).toBeNull();
    });
    expect(useDocumentSession.getState().outputPaneChainState).toEqual(
      createOutputPaneChainState(),
    );
    expect(inputEditorRef.current?.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('ignores duplicate refresh invocations while a read is in flight', async () => {
    const refreshDeferred = createDeferred<{
      path: string;
      content: string;
      sourceToken: string;
      sourceKind: 'refresh-file';
    }>();
    fileRefreshOpenFileMock.mockReturnValueOnce(refreshDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
      ref.current?.getController().onRefreshFile();
    });

    expect(fileRefreshOpenFileMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      refreshDeferred.resolve({
        path: '/tmp/source.json',
        content: '{"refreshed":true}',
        sourceToken: 'refresh-token',
        sourceKind: 'refresh-file',
      });
      await refreshDeferred.promise;
    });
  });

  it('reset clears an in-flight refresh guard before the stale refresh settles', async () => {
    const refreshDeferred = createDeferred<{
      path: string;
      content: string;
      sourceToken: string;
      sourceKind: 'refresh-file';
    }>();
    fileRefreshOpenFileMock.mockReturnValueOnce(refreshDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });
    rerender(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      ref.current?.getController().onRefreshFile();
    });
    await waitFor(() => {
      expect(ref.current?.getController().isRefreshingFile).toBe(true);
    });

    act(() => {
      onResetCurrentWindowListener?.();
    });

    await waitFor(() => {
      expect(ref.current?.getController().isRefreshingFile).toBe(false);
    });

    await act(async () => {
      refreshDeferred.resolve({
        path: '/tmp/source.json',
        content: '{"refreshed":true}',
        sourceToken: 'refresh-token',
        sourceKind: 'refresh-file',
      });
      await refreshDeferred.promise;
    });
    expect(ref.current?.getController().isRefreshingFile).toBe(false);
  });

  it('does not restore a stale refresh viewport after reset during refresh ingestion', async () => {
    const ingestDeferred = createDeferred<'accepted'>();
    const rootHandle = createOutputEditorHandle({
      captureViewportSnapshot: vi.fn().mockReturnValue({
        lineNumber: 4,
        column: 2,
        topLineNumber: 3,
        scrollLeft: 0,
        scrollTop: 120,
      }),
    });
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    useDocumentSession.setState({
      paneMode: 'output',
      inputText: '{"old":true}',
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"old":true}',
      },
    });
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;
    ingestInputText.mockReturnValueOnce(ingestDeferred.promise);

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);
      ref.current?.getController().onRefreshFile();
    });
    await waitFor(() => {
      expect(ingestInputText).toHaveBeenCalled();
    });

    act(() => {
      onResetCurrentWindowListener?.();
    });

    await act(async () => {
      ingestDeferred.resolve('accepted');
      await ingestDeferred.promise;
    });
    expect(rootHandle.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('blocked refresh ingest keeps existing output context state untouched', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;
    ingestInputText.mockResolvedValueOnce('blocked');

    act(() => {
      useDocumentSession.setState({
        paneMode: 'output',
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
      ref.current?.getController().onOutputPaneContextMenu(
        'output-root-pane',
        {
          anchorX: 12,
          anchorY: 24,
          isContentHit: true,
          position: { lineNumber: 2, column: 4 },
          hasSelection: false,
        },
        '{\n  "query": "{ leaf }"\n}',
        'json',
      );
    });

    expect(ref.current?.getController().outputContextMenuState).not.toBeNull();

    act(() => {
      ref.current?.getController().onRefreshFile();
    });

    await waitFor(() => {
      expect(ingestInputText).toHaveBeenCalledWith(
        '{"refreshed":true}',
        'refresh-file',
        expect.any(Object),
      );
    });
    expect(ref.current?.getController().outputContextMenuState).not.toBeNull();
  });

  it('stale refresh after pane mode changes clears the pending token without ingesting', async () => {
    const refreshDeferred = createDeferred<{
      path: string;
      content: string;
      sourceToken: string;
      sourceKind: 'refresh-file';
    }>();
    fileRefreshOpenFileMock.mockReturnValueOnce(refreshDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;

    act(() => {
      useDocumentSession.setState({
        paneMode: 'output',
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
      ref.current?.getController().onRefreshFile();
      useDocumentSession.setState({ paneMode: 'input' });
    });

    await act(async () => {
      refreshDeferred.resolve({
        path: '/tmp/source.json',
        content: '{"refreshed":true}',
        sourceToken: 'refresh-token',
        sourceKind: 'refresh-file',
      });
      await refreshDeferred.promise;
    });

    expect(fileClearOpenFileSourceMock).toHaveBeenCalledWith({
      sourceToken: 'refresh-token',
      path: '/tmp/source.json',
      scope: 'pending',
    });
    expect(ingestInputText).not.toHaveBeenCalled();
  });

  it('refresh blocked by a newer ingest prompt clears the pending token without ingesting', async () => {
    const refreshDeferred = createDeferred<{
      path: string;
      content: string;
      sourceToken: string;
      sourceKind: 'refresh-file';
    }>();
    fileRefreshOpenFileMock.mockReturnValueOnce(refreshDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
      ref.current?.getController().onRefreshFile();
      useDocumentSession.setState({
        ingestRejectionPrompt: {
          message: 'too large',
          recoveryText: '{"old":true}',
          source: 'paste',
          originalCharCount: 10,
          switchToOutputOnComplete: true,
          rejectionReason: 'char-count',
          rejectionActual: 10,
          rejectionLimit: 9,
          pendingFileSource: null,
        },
      });
    });

    await act(async () => {
      refreshDeferred.resolve({
        path: '/tmp/source.json',
        content: '{"refreshed":true}',
        sourceToken: 'refresh-token',
        sourceKind: 'refresh-file',
      });
      await refreshDeferred.promise;
    });

    await waitFor(() => {
      expect(fileClearOpenFileSourceMock).toHaveBeenCalledWith({
        sourceToken: 'refresh-token',
        path: '/tmp/source.json',
        scope: 'pending',
      });
    });
    expect(ingestInputText).not.toHaveBeenCalled();
  });

  it('refresh blocked by newer fallback wait state clears the pending token without ingesting', async () => {
    const refreshDeferred = createDeferred<{
      path: string;
      content: string;
      sourceToken: string;
      sourceKind: 'refresh-file';
    }>();
    fileRefreshOpenFileMock.mockReturnValueOnce(refreshDeferred.promise);
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));
    const ingestInputText = usePrettifierFlowMock.mock.results[0]?.value
      .ingestInputText as ReturnType<typeof vi.fn>;

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
      ref.current?.getController().onRefreshFile();
      useDocumentSession.setState({
        fallbackWaitState: {
          requestId: 1,
          formatLabel: 'JSON',
          agentName: 'Codex',
          progressLines: ['working...'],
        },
      });
    });

    await act(async () => {
      refreshDeferred.resolve({
        path: '/tmp/source.json',
        content: '{"refreshed":true}',
        sourceToken: 'refresh-token',
        sourceKind: 'refresh-file',
      });
      await refreshDeferred.promise;
    });

    await waitFor(() => {
      expect(fileClearOpenFileSourceMock).toHaveBeenCalledWith({
        sourceToken: 'refresh-token',
        path: '/tmp/source.json',
        scope: 'pending',
      });
    });
    expect(ingestInputText).not.toHaveBeenCalled();
  });

  it('dirty refresh opens confirmation and cancel leaves current content untouched', () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"dirty":true}',
        outputText: '{\n  "old": true\n}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
    });

    expect(ref.current?.getController().dirtyRefreshPrompt).toMatchObject({
      inputText: '{"dirty":true}',
    });
    expect(fileRefreshOpenFileMock).not.toHaveBeenCalled();

    act(() => {
      ref.current?.getController().onCancelDirtyRefresh();
    });

    expect(ref.current?.getController().dirtyRefreshPrompt).toBeNull();
    expect(useDocumentSession.getState().inputText).toBe('{"dirty":true}');
    expect(useDocumentSession.getState().outputText).toContain('"old": true');
  });

  it('confirming dirty refresh revalidates the prompt snapshot before reading', async () => {
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"dirty":true}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
      useDocumentSession.setState({ inputText: '{"newer":true}' });
      ref.current?.getController().onConfirmDirtyRefresh();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fileRefreshOpenFileMock).not.toHaveBeenCalled();
  });

  it('refresh read failure preserves content and shows refresh failure notice', async () => {
    fileRefreshOpenFileMock.mockRejectedValueOnce(new Error('missing'));
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        outputText: '{\n  "old": true\n}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().ingestNotice).toBe('Unable to refresh file.');
    });
    expect(useDocumentSession.getState().inputText).toBe('{"old":true}');
    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).not.toHaveBeenCalled();
  });

  it('stale refresh read failure does not show refresh failure notice', async () => {
    let rejectRefresh!: (error: Error) => void;
    fileRefreshOpenFileMock.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectRefresh = reject;
      }),
    );
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef, ref }));

    act(() => {
      useDocumentSession.setState({
        inputText: '{"old":true}',
        outputText: '{\n  "old": true\n}',
        fileSource: {
          sourceToken: 'token-1',
          path: '/tmp/source.json',
          sourceKind: 'dialog-open-file',
          lastLoadedText: '{"old":true}',
        },
      });
    });

    act(() => {
      ref.current?.getController().onRefreshFile();
      useDocumentSession.setState({ inputText: '{"newer":true}' });
    });

    await act(async () => {
      rejectRefresh(new Error('missing'));
      await Promise.resolve();
    });

    expect(useDocumentSession.getState().ingestNotice).toBeNull();
    expect(useDocumentSession.getState().inputText).toBe('{"newer":true}');
    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).not.toHaveBeenCalled();
  });

  it('consumes an initial launch file and routes it through open-file ingestion', async () => {
    const initialOpenFile = {
      path: '/tmp/launch.json',
      content: '{"launch":true}',
      sourceToken: 'startup-token',
      sourceKind: 'startup-open-file' as const,
    };
    const inputEditorRef = createInputEditorRef();
    const ref = { current: null as HarnessHandle | null };

    const firstRender = render(
      createElement(ControllerHarness, {
        initialOpenFile,
        inputEditorRef,
        ref,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(usePrettifierFlowMock.mock.results[0]?.value.resetPrettifierState).toHaveBeenCalled();
    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).toHaveBeenCalledWith(
      '{"launch":true}',
      'open-file',
      {
        fileSource: {
          sourceToken: 'startup-token',
          path: '/tmp/launch.json',
          sourceKind: 'startup-open-file',
          baselineText: '{"launch":true}',
        },
      },
    );

    firstRender.unmount();
    render(
      createElement(ControllerHarness, {
        initialOpenFile,
        inputEditorRef,
        ref,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(usePrettifierFlowMock.mock.results[0]?.value.ingestInputText).toHaveBeenCalledTimes(1);
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
      ingestRejectionPrompt: null,
      cancelActiveFallback: vi.fn().mockResolvedValue(undefined),
      runPrettifierRequest: vi.fn().mockResolvedValue(null),
      runPrettifier: vi.fn(),
      ingestInputText: vi.fn(),
      openReadableIngestSlice: vi.fn(),
      dismissIngestRejection: vi.fn(),
      resetPrettifierState: vi.fn(),
      isInputAlreadyPrettified: vi.fn().mockReturnValue(false),
      reindentOutputIfPrettified: vi.fn().mockReturnValue(null),
      restoreOutputFromSnapshot: vi.fn(),
      alignOutputIndentAfterPersist: vi.fn(),
    });

    act(() => {
      useDocumentSession.setState({
        paneMode: 'input',
        inputText: '{bad',
      });
    });

    const ref = { current: null as HarnessHandle | null };
    render(createElement(ControllerHarness, { inputEditorRef: createInputEditorRef(), ref }));

    act(() => {
      ref.current?.getController().onPaneModeChange('output');
    });

    expect(useDocumentSession.getState().paneMode).toBe('input');
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
