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
      fallbackWaitState: null,
      fallbackModalState: null,
      lastPrettifiedInput: null,
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
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 420,
      outputPaneChainState: {
        activePaneId: 'output-pane-1',
        derivedPanes: [],
        leftVisiblePaneIndex: 0,
        nextDerivedPaneSequence: 9,
      },
    });

    expect(reset).toEqual({
      paneMode: 'input',
      themeMode: 'dark',
      indentSize: 6,
      inputText: '',
      ingestNotice: null,
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
      fallbackWaitState: null,
      fallbackModalState: null,
      lastPrettifiedInput: null,
    });
  });
});
