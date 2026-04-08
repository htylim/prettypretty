import { act, render } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutputEditorHandle } from '../../../../src/renderer/components/OutputEditor';
import type { OutputLanguageId } from '../../../../src/renderer/output/detectOutputLanguage';
import { createInitialDocumentSessionState } from '../../../../src/renderer/app/session/documentSessionDomain';
import { useDocumentSession } from '../../../../src/renderer/app/session/useDocumentSession';
import { useOutputPaneController } from '../../../../src/renderer/app/useOutputPaneController';

type HarnessHandle = {
  getController: () => ReturnType<typeof useOutputPaneController>;
};

type HarnessProps = {
  outputText: string;
  paneMode: 'input' | 'output';
  rootOutputLanguageOverride?: OutputLanguageId | null;
};

const OutputPaneHarness = forwardRef<HarnessHandle, HarnessProps>((props, ref) => {
  const controller = useOutputPaneController({
    rootOutputLanguageOverride: null,
    ...props,
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

OutputPaneHarness.displayName = 'OutputPaneHarness';

const createOutputEditorHandle = (): OutputEditorHandle => ({
  collapseAll: vi.fn(),
  expandAll: vi.fn(),
  focus: vi.fn(),
  openFind: vi.fn(),
});

describe('useOutputPaneController', () => {
  beforeEach(() => {
    useDocumentSession.setState(createInitialDocumentSessionState());
  });

  it('returns the root pane by default', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      paneId: 'output-root-pane',
      testId: 'output-editor',
      viewRange: null,
    });
    expect(useDocumentSession.getState().outputPaneChainState).toEqual(
      createInitialDocumentSessionState().outputPaneChainState,
    );
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
    expect(ref.current?.getController().hasDerivedOutputPane).toBe(false);
  });

  it('preserves explicit root and child language overrides for invalid structured output', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": 1,\n  "tail"',
        rootOutputLanguageOverride: 'json',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      paneDocumentLanguage: 'json',
      languageOverride: 'json',
    });

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": 1,\n  "tail"',
        languageOverride: 'json',
      });
    });

    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneDocumentLanguage: 'json',
      languageOverride: 'json',
      value: '{\n  "nested": 1,\n  "tail"',
    });
  });

  it('opens independent output panes and replaces descendant content from the reopened parent', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
      ref.current?.getController().onOpenOutputPane('output-pane-1', {
        kind: 'independent-text',
        value: '{\n  "leaf": true\n}',
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(3);
    expect(useDocumentSession.getState().outputPaneChainState.derivedPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[2]).toMatchObject({
      paneId: 'output-pane-2',
      documentId: 'output-pane-2:document-2',
      value: '{\n  "leaf": true\n}',
      viewRange: null,
    });

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "replacement": true\n}',
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(useDocumentSession.getState().outputPaneChainState.derivedPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      documentId: 'output-pane-1:document-3',
      value: '{\n  "replacement": true\n}',
      viewRange: null,
    });
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-pane-1');
  });

  it('explicitly invalidates descendant panes when an upstream pane changes', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
      ref.current?.getController().onOpenOutputPane('output-pane-1', {
        kind: 'independent-text',
        value: '{\n  "leaf": true\n}',
      });
      ref.current?.getController().onNavigateOutputPaneViewport(-1);
    });

    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-root-pane');

    act(() => {
      ref.current?.getController().onInvalidateOutputPaneDescendants('output-pane-1');
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(useDocumentSession.getState().outputPaneChainState.derivedPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      paneId: 'output-pane-1',
      value: '{\n  "nested": true\n}',
    });
    expect(ref.current?.getController().activeOutputPaneId).toBe('output-root-pane');
    expect(ref.current?.getController().leftVisiblePaneIndex).toBe(0);
    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-root-pane',
      sequence: 4,
    });
  });

  it('toggles extracted-source panes and mirrors the active source range onto the parent pane', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onToggleExtractedSourcePane('output-root-pane', {
        kind: 'extracted-source',
        value: '{\n  "nested": true\n}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 2,
        },
        lineNumberStart: 2,
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(2);
    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      activeExtractedSourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 4,
        endColumn: 2,
      },
    });
    expect(ref.current?.getController().outputPanes[1]).toMatchObject({
      languageOverride: 'json',
      lineNumberStart: 2,
      value: '{\n  "nested": true\n}',
      viewRange: null,
    });

    act(() => {
      ref.current?.getController().onToggleExtractedSourcePane('output-root-pane', {
        kind: 'extracted-source',
        value: '{\n  "nested": true\n}',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 2,
        },
        lineNumberStart: 2,
      });
    });

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
    expect(ref.current?.getController().outputPanes[0]).toMatchObject({
      activeExtractedSourceRange: null,
    });
  });

  it('resets panes on output invalidation and when leaving output mode', () => {
    const ref = { current: null as HarnessHandle | null };
    const { rerender } = render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
    });

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": true\n}',
        paneMode: 'input',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);

    rerender(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "changed": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    expect(ref.current?.getController().outputPanes).toHaveLength(1);
  });

  it('routes active-pane lookup through the focused pane handle and emits focus requests for pane opens', () => {
    const ref = { current: null as HarnessHandle | null };
    render(
      createElement(OutputPaneHarness, {
        outputText: '{\n  "root": true\n}',
        paneMode: 'output',
        ref,
      }),
    );

    const rootHandle = createOutputEditorHandle();
    const childHandle = createOutputEditorHandle();
    const grandchildHandle = createOutputEditorHandle();

    ref.current?.getController().onOutputPaneHandleChange('output-root-pane', rootHandle);

    act(() => {
      ref.current?.getController().onOpenOutputPane('output-root-pane', {
        kind: 'independent-text',
        value: '{\n  "nested": true\n}',
      });
    });

    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-pane-1',
      sequence: 1,
    });
    expect(useDocumentSession.getState().outputPaneChainState.activePaneId).toBe('output-pane-1');

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-pane-1', childHandle);
      ref.current?.getController().onOpenOutputPane('output-pane-1', {
        kind: 'independent-text',
        value: '{\n  "leaf": true\n}',
      });
    });

    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-pane-2',
      sequence: 2,
    });
    expect(useDocumentSession.getState().outputPaneChainState.activePaneId).toBe('output-pane-2');

    act(() => {
      ref.current?.getController().onOutputPaneHandleChange('output-pane-2', grandchildHandle);
    });

    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(grandchildHandle);

    act(() => {
      ref.current?.getController().onNavigateOutputPaneViewport(-1);
    });

    expect(ref.current?.getController().outputPaneFocusRequest).toEqual({
      paneId: 'output-root-pane',
      sequence: 3,
    });
    expect(useDocumentSession.getState().outputPaneChainState.activePaneId).toBe(
      'output-root-pane',
    );
    expect(ref.current?.getController().getActiveOutputPaneHandle()).toBe(rootHandle);
    expect(rootHandle.focus).not.toHaveBeenCalled();
    expect(childHandle.focus).not.toHaveBeenCalled();
    expect(grandchildHandle.focus).not.toHaveBeenCalled();
  });
});
