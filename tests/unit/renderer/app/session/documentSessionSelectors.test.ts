import { describe, expect, it } from 'vitest';
import type { DocumentSessionState } from '../../../../../src/renderer/app/session/documentSessionDomain';
import {
  selectFallbackModalState,
  selectFallbackAgentId,
  selectFallbackAgentOptions,
  selectFallbackWarningLineThreshold,
  selectFallbackWaitState,
  selectIndentSize,
  selectIngestNotice,
  selectInputText,
  selectLastPrettifiedInput,
  selectOutputFormattingState,
  selectOutputPaneChainState,
  selectOutputText,
  selectPaneMode,
  selectThemeMode,
} from '../../../../../src/renderer/app/session/documentSessionSelectors';
import { createInitialDocumentSessionState } from '../../../../../src/renderer/app/session/documentSessionDomain';

describe('documentSessionSelectors', () => {
  it('reads fields from the document session state', () => {
    const state: DocumentSessionState = {
      ...createInitialDocumentSessionState(),
      paneMode: 'output' as const,
      themeMode: 'dark' as const,
      indentSize: 4 as const,
      inputText: '{"next":1}',
      ingestNotice: 'notice',
      fallbackAgentId: 'codex',
      fallbackAgentOptions: [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold: 420,
      outputPaneChainState: {
        activePaneId: 'output-pane-1',
        derivedPanes: [],
        leftVisiblePaneIndex: 0,
        nextDerivedPaneSequence: 3,
      },
      outputText: '{\n  "next": 1\n}',
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
      lastPrettifiedInput: '{"next":1}',
    };

    expect(selectPaneMode(state)).toBe('output');
    expect(selectThemeMode(state)).toBe('dark');
    expect(selectIndentSize(state)).toBe(4);
    expect(selectInputText(state)).toBe('{"next":1}');
    expect(selectIngestNotice(state)).toBe('notice');
    expect(selectFallbackAgentId(state)).toBe('codex');
    expect(selectFallbackAgentOptions(state)).toEqual([
      { id: 'codex', name: 'Codex', enabled: true },
    ]);
    expect(selectFallbackWarningLineThreshold(state)).toBe(420);
    expect(selectOutputPaneChainState(state)).toEqual({
      activePaneId: 'output-pane-1',
      derivedPanes: [],
      leftVisiblePaneIndex: 0,
      nextDerivedPaneSequence: 3,
    });
    expect(selectOutputText(state)).toBe('{\n  "next": 1\n}');
    expect(selectOutputFormattingState(state)).toEqual({
      isPrettified: true,
      indentSize: 2,
      reindentStrategy: 'leading-whitespace',
    });
    expect(selectFallbackWaitState(state)).toEqual({
      requestId: 1,
      formatLabel: 'JSON',
      agentName: 'Codex',
      progressLines: ['working'],
    });
    expect(selectFallbackModalState(state)).toEqual({ kind: 'agent-selection' });
    expect(selectLastPrettifiedInput(state)).toBe('{"next":1}');
  });
});
