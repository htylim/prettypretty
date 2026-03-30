import { describe, expect, it } from 'vitest';
import { createOutputPaneChainState } from '../../../../../src/renderer/app/outputPaneDomain';
import { useDocumentSession } from '../../../../../src/renderer/app/session/useDocumentSession';
import { createInitialDocumentSessionState } from '../../../../../src/renderer/app/session/documentSessionDomain';

describe('useDocumentSession', () => {
  it('updates pane and theme modes through explicit setters', () => {
    useDocumentSession.setState(createInitialDocumentSessionState());

    useDocumentSession.getState().setPaneMode('output');
    useDocumentSession.getState().setThemeMode('dark');
    useDocumentSession.getState().setFallbackAgentId('codex');
    useDocumentSession
      .getState()
      .setFallbackAgentOptions([{ id: 'codex', name: 'Codex', enabled: true }]);
    useDocumentSession.getState().setFallbackWarningLineThreshold(420);
    useDocumentSession.getState().setOutputPaneChainState({
      ...createOutputPaneChainState(),
      activePaneId: 'output-pane-1',
      derivedPanes: [
        {
          parentPaneId: 'output-root-pane',
          paneId: 'output-pane-1',
          content: {
            kind: 'independent-text',
            documentId: 'output-pane-1:document-1',
            value: '{\n  "nested": true\n}',
          },
          viewStateKey: 'output-pane-1:content-1',
        },
      ],
      leftVisiblePaneIndex: 0,
      nextDerivedPaneSequence: 2,
    });
    useDocumentSession.getState().setOutputText('{\n  "content": true\n}');
    useDocumentSession.getState().setOutputFormattingState({
      isPrettified: true,
      indentSize: 2,
      reindentStrategy: 'leading-whitespace',
    });
    useDocumentSession.getState().setFallbackWaitState({
      requestId: 1,
      formatLabel: 'JSON',
      agentName: 'Codex',
      progressLines: ['working'],
    });
    useDocumentSession.getState().setFallbackModalState({ kind: 'agent-selection' });
    useDocumentSession.getState().setLastPrettifiedInput('{"content":true}');

    expect(useDocumentSession.getState().paneMode).toBe('output');
    expect(useDocumentSession.getState().themeMode).toBe('dark');
    expect(useDocumentSession.getState().fallbackAgentId).toBe('codex');
    expect(useDocumentSession.getState().fallbackAgentOptions).toEqual([
      { id: 'codex', name: 'Codex', enabled: true },
    ]);
    expect(useDocumentSession.getState().fallbackWarningLineThreshold).toBe(420);
    expect(useDocumentSession.getState().outputPaneChainState.activePaneId).toBe('output-pane-1');
    expect(useDocumentSession.getState().outputPaneChainState.derivedPanes).toHaveLength(1);
    expect(useDocumentSession.getState().outputText).toBe('{\n  "content": true\n}');
    expect(useDocumentSession.getState().outputFormattingState).toEqual({
      isPrettified: true,
      indentSize: 2,
      reindentStrategy: 'leading-whitespace',
    });
    expect(useDocumentSession.getState().fallbackWaitState).toEqual({
      requestId: 1,
      formatLabel: 'JSON',
      agentName: 'Codex',
      progressLines: ['working'],
    });
    expect(useDocumentSession.getState().fallbackModalState).toEqual({ kind: 'agent-selection' });
    expect(useDocumentSession.getState().lastPrettifiedInput).toBe('{"content":true}');
  });

  it('reset clears editor content and returns to input mode', () => {
    useDocumentSession.setState({
      ...createInitialDocumentSessionState(),
      paneMode: 'output',
      themeMode: 'dark',
      indentSize: 6,
      inputText: 'content',
      ingestNotice: 'File has no content.',
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 420,
      outputPaneChainState: {
        ...createOutputPaneChainState(),
        activePaneId: 'output-pane-1',
        derivedPanes: [
          {
            parentPaneId: 'output-root-pane',
            paneId: 'output-pane-1',
            content: {
              kind: 'independent-text',
              documentId: 'output-pane-1:document-1',
              value: '{\n  "nested": true\n}',
            },
            viewStateKey: 'output-pane-1:content-1',
          },
        ],
        leftVisiblePaneIndex: 0,
        nextDerivedPaneSequence: 2,
      },
      outputText: '{\n  "content": true\n}',
      outputFormattingState: {
        isPrettified: true,
        indentSize: 2,
        reindentStrategy: 'leading-whitespace',
      },
      fallbackWaitState: {
        requestId: 1,
        formatLabel: 'JSON',
        agentName: 'Codex',
        progressLines: ['working'],
      },
      fallbackModalState: { kind: 'agent-selection' },
      lastPrettifiedInput: '{"content":true}',
    });

    useDocumentSession.getState().reset();

    expect(useDocumentSession.getState().paneMode).toBe('input');
    expect(useDocumentSession.getState().inputText).toBe('');
    expect(useDocumentSession.getState().indentSize).toBe(6);
    expect(useDocumentSession.getState().ingestNotice).toBeNull();
    expect(useDocumentSession.getState().fallbackAgentId).toBe('codex');
    expect(useDocumentSession.getState().fallbackAgentOptions).toEqual([
      { id: 'codex', name: 'Codex', enabled: true },
    ]);
    expect(useDocumentSession.getState().fallbackWarningLineThreshold).toBe(420);
    expect(useDocumentSession.getState().outputPaneChainState).toEqual(
      createOutputPaneChainState(),
    );
    expect(useDocumentSession.getState().outputText).toBe('');
    expect(useDocumentSession.getState().outputFormattingState).toEqual({
      isPrettified: false,
      indentSize: null,
      reindentStrategy: 'none',
    });
    expect(useDocumentSession.getState().fallbackWaitState).toBeNull();
    expect(useDocumentSession.getState().fallbackModalState).toBeNull();
    expect(useDocumentSession.getState().lastPrettifiedInput).toBeNull();
  });
});
