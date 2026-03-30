import { describe, expect, it } from 'vitest';
import {
  applyLocalPrettifyOutput,
  applyPassthroughOutput,
  createInitialPrettifierSessionState,
  createOutputReindentTransition,
  resetPrettifierSessionState,
  shouldPromptForFallbackConfirmation,
  shouldRequestFallbackAgentSelection,
} from '../../../../../src/renderer/app/session/prettifierSessionDomain';

describe('prettifierSessionDomain', () => {
  it('applies local prettify output into session state', () => {
    const nextState = applyLocalPrettifyOutput(
      createInitialPrettifierSessionState(),
      '{"a":1}',
      '{\n  "a": 1\n}',
      2,
      'json',
    );

    expect(nextState).toEqual({
      outputText: '{\n  "a": 1\n}',
      outputFormattingState: {
        isPrettified: true,
        indentSize: 2,
        reindentStrategy: 'leading-whitespace',
      },
      fallbackWaitState: null,
      fallbackModalState: null,
      lastPrettifiedInput: '{"a":1}',
    });
  });

  it('applies passthrough output into session state', () => {
    const nextState = applyPassthroughOutput(createInitialPrettifierSessionState(), '{bad');

    expect(nextState).toEqual({
      outputText: '{bad',
      outputFormattingState: {
        isPrettified: false,
        indentSize: null,
        reindentStrategy: 'none',
      },
      fallbackWaitState: null,
      fallbackModalState: null,
      lastPrettifiedInput: '{bad',
    });
  });

  it('encodes fallback prompt decisions deterministically', () => {
    expect(shouldRequestFallbackAgentSelection(false, true)).toBe(true);
    expect(shouldRequestFallbackAgentSelection(true, true)).toBe(false);
    expect(shouldPromptForFallbackConfirmation(4, 3, true)).toBe(true);
    expect(shouldPromptForFallbackConfirmation(2, 3, true)).toBe(false);
    expect(shouldPromptForFallbackConfirmation(4, 3, false)).toBe(false);
  });

  it('resets transient prettifier session fields', () => {
    const reset = resetPrettifierSessionState({
      ...createInitialPrettifierSessionState(),
      outputText: '{\n  "a": 1\n}',
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
      lastPrettifiedInput: '{"a":1}',
    });

    expect(reset).toEqual(createInitialPrettifierSessionState());
  });

  it('creates a reindent transition only when the output is already prettified', () => {
    const transition = createOutputReindentTransition(
      {
        ...createInitialPrettifierSessionState(),
        outputText: '{\n  "nested": {\n    "leaf": true\n  }\n}',
        outputFormattingState: {
          isPrettified: true,
          indentSize: 2,
          reindentStrategy: 'leading-whitespace',
        },
        lastPrettifiedInput: '{"nested":{"leaf":true}}',
      },
      {
        paneMode: 'output',
        inputText: '{"nested":{"leaf":true}}',
        nextIndentSize: 4,
      },
    );

    expect(transition).not.toBeNull();
    expect(transition?.snapshot).toEqual({
      outputText: '{\n  "nested": {\n    "leaf": true\n  }\n}',
      formattingState: {
        isPrettified: true,
        indentSize: 2,
        reindentStrategy: 'leading-whitespace',
      },
    });
    expect(transition?.nextState.outputText).toBe(
      '{\n    "nested": {\n        "leaf": true\n    }\n}',
    );
    expect(transition?.nextState.outputFormattingState).toEqual({
      isPrettified: true,
      indentSize: 4,
      reindentStrategy: 'leading-whitespace',
    });
  });

  it('does not create a reindent transition for graphql output', () => {
    const transition = createOutputReindentTransition(
      {
        ...createInitialPrettifierSessionState(),
        outputText: 'query Shipment {\n  id\n}',
        outputFormattingState: {
          isPrettified: true,
          indentSize: 2,
          reindentStrategy: 'none',
        },
        lastPrettifiedInput: 'query Shipment{id}',
      },
      {
        paneMode: 'output',
        inputText: 'query Shipment{id}',
        nextIndentSize: 4,
      },
    );

    expect(transition).toBeNull();
  });
});
