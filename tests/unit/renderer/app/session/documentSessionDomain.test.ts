import { describe, expect, it } from 'vitest';
import {
  createInitialDocumentSessionState,
  resetDocumentSessionEditorState,
} from '../../../../../src/renderer/app/session/documentSessionDomain';

describe('documentSessionDomain', () => {
  it('creates the expected initial state', () => {
    expect(createInitialDocumentSessionState()).toEqual({
      paneMode: 'input',
      themeMode: 'light',
      indentSize: 2,
      inputText: '',
      ingestNotice: null,
      ingestRejectionPrompt: null,
      fallbackAgentId: null,
      fallbackAgentOptions: [],
      fallbackWarningLineThreshold: 300,
      outputPaneChainState: {
        activePaneId: 'output-root-pane',
        derivedPanes: [],
        leftVisiblePaneIndex: 0,
        nextDerivedPaneSequence: 1,
      },
      outputText: '',
      outputFormattingState: {
        isPrettified: false,
        indentSize: null,
        reindentStrategy: 'none',
      },
      outputLanguageOverride: null,
      fallbackWaitState: null,
      fallbackModalState: null,
      lastPrettifiedInput: null,
      fileSource: null,
    });
  });

  it('tracks refreshable file source in initial and updated document session state', () => {
    const initial = createInitialDocumentSessionState();

    expect(initial.fileSource).toBeNull();

    expect({
      ...initial,
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"a":1}',
      },
    }).toMatchObject({
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"a":1}',
      },
    });
  });

  it('resets editor session fields while preserving preferences', () => {
    const initial = createInitialDocumentSessionState();
    const reset = resetDocumentSessionEditorState({
      ...initial,
      paneMode: 'output',
      themeMode: 'dark',
      indentSize: 6,
      inputText: 'content',
      ingestNotice: 'notice',
      ingestRejectionPrompt: {
        message: 'too large',
        recoveryText: 'partial',
        source: 'paste',
        originalCharCount: 10,
        switchToOutputOnComplete: true,
        rejectionReason: 'char-count',
        rejectionActual: 10,
        rejectionLimit: 9,
        pendingFileSource: null,
      },
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 420,
      outputPaneChainState: {
        activePaneId: 'output-pane-1',
        derivedPanes: [],
        leftVisiblePaneIndex: 0,
        nextDerivedPaneSequence: 9,
      },
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'dialog-open-file',
        lastLoadedText: '{"a":1}',
      },
    });

    expect(reset).toEqual({
      paneMode: 'input',
      themeMode: 'dark',
      indentSize: 6,
      inputText: '',
      ingestNotice: null,
      ingestRejectionPrompt: null,
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 420,
      outputPaneChainState: {
        activePaneId: 'output-root-pane',
        derivedPanes: [],
        leftVisiblePaneIndex: 0,
        nextDerivedPaneSequence: 1,
      },
      outputText: '',
      outputFormattingState: {
        isPrettified: false,
        indentSize: null,
        reindentStrategy: 'none',
      },
      outputLanguageOverride: null,
      fallbackWaitState: null,
      fallbackModalState: null,
      lastPrettifiedInput: null,
      fileSource: null,
    });
  });

  it('reset clears refreshable file source while preserving preferences', () => {
    const reset = resetDocumentSessionEditorState({
      ...createInitialDocumentSessionState(),
      themeMode: 'dark',
      indentSize: 6,
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 420,
      fileSource: {
        sourceToken: 'token-1',
        path: '/tmp/source.json',
        sourceKind: 'startup-open-file',
        lastLoadedText: '{"a":1}',
      },
    });

    expect(reset.fileSource).toBeNull();
    expect(reset.themeMode).toBe('dark');
    expect(reset.indentSize).toBe(6);
    expect(reset.fallbackAgentId).toBe('codex');
    expect(reset.fallbackAgentOptions).toEqual([{ id: 'codex', name: 'Codex', enabled: true }]);
    expect(reset.fallbackWarningLineThreshold).toBe(420);
  });
});
