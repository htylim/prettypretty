import { describe, expect, it } from 'vitest';
import {
  normalizeOutputEmbeddedSelectionText,
  resolveOutputEmbeddedSelection,
} from '../../../../src/renderer/output/outputEmbeddedSelection';

const getColumnForSnippet = (lineText: string, snippet: string): number => {
  const snippetOffset = lineText.indexOf(snippet);
  if (snippetOffset === -1) {
    throw new Error(`Could not find snippet "${snippet}" in "${lineText}"`);
  }

  return snippetOffset + 1;
};

describe('outputEmbeddedSelection', () => {
  it('prefers the outermost nested candidate that contains the clicked source position', () => {
    const outputText = `{
  "payload": "{\\"query\\":\\"{ user { id } }\\"}"
}`;
    const payloadLine = outputText.split('\n')[1] ?? '';

    const selection = resolveOutputEmbeddedSelection(outputText, {
      type: 'position',
      lineNumber: 2,
      column: getColumnForSnippet(payloadLine, '{ user { id } }'),
    });

    expect(selection).toEqual({
      payload: '{"query":"{ user { id } }"}',
      sourceRange: {
        startLineNumber: 2,
        startColumn: getColumnForSnippet(payloadLine, '"{\\"query\\":\\"{ user { id } }\\"}"'),
        endLineNumber: 2,
        endColumn:
          getColumnForSnippet(payloadLine, '"{\\"query\\":\\"{ user { id } }\\"}"') +
          '"{\\"query\\":\\"{ user { id } }\\"}"'.length,
      },
    });
  });

  it('picks the first matching candidate in source order for selection ranges', () => {
    const outputText = `{
  "query": "{ user { id } }",
  "variables": "{\\"id\\":1}"
}`;

    const selection = resolveOutputEmbeddedSelection(outputText, {
      type: 'range',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 30,
      },
    });

    expect(selection?.payload).toBe('{ user { id } }');
    expect(selection?.sourceRange).toMatchObject({
      startLineNumber: 2,
      endLineNumber: 2,
    });
  });

  it('returns null for plain unsupported text with no structured embedded payload', () => {
    const outputText = `{
  "message": "hello world"
}`;
    const messageLine = outputText.split('\n')[1] ?? '';

    expect(
      resolveOutputEmbeddedSelection(outputText, {
        type: 'position',
        lineNumber: 2,
        column: getColumnForSnippet(messageLine, 'hello world'),
      }),
    ).toBeNull();
  });

  it('ignores candidates outside the active pane view range', () => {
    const outputText = `{
  "query": "{ user { id } }",
  "variables": "{\\"id\\":1}"
}`;

    const selection = resolveOutputEmbeddedSelection(
      outputText,
      {
        type: 'range',
        sourceRange: {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 3,
          endColumn: 30,
        },
      },
      {
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 3,
        endColumn: 30,
      },
    );

    expect(selection?.payload).toBe('{"id":1}');
    expect(selection?.sourceRange).toMatchObject({
      startLineNumber: 3,
      endLineNumber: 3,
    });
  });

  it('resolves nested object literals that are embedded as source values, not only quoted strings', () => {
    const outputText = `{
  "query": "query Example { viewer { id } }",
  "variables": {
    "first": 2
  }
}`;
    const variablesLine = outputText.split('\n')[3] ?? '';

    const selection = resolveOutputEmbeddedSelection(outputText, {
      type: 'position',
      lineNumber: 4,
      column: getColumnForSnippet(variablesLine, '"first"'),
    });

    expect(selection).toEqual({
      payload: `{
    "first": 2
  }`,
      sourceRange: {
        startLineNumber: 3,
        startColumn: getColumnForSnippet(outputText.split('\n')[2] ?? '', '{'),
        endLineNumber: 5,
        endColumn: 4,
      },
    });
  });

  it('normalizes quoted structured selections by unwrapping and decoding them', () => {
    expect(normalizeOutputEmbeddedSelectionText('"{\\"id\\":1}"')).toBe('{"id":1}');
  });

  it('normalizes escaped GraphQL selections even when the quotes are not selected', () => {
    expect(
      normalizeOutputEmbeddedSelectionText(
        'query ListShipments(\\n  $first: Int\\n) {\\n  shipments {\\n    request_id\\n  }\\n}',
      ),
    ).toBe('query ListShipments(\n  $first: Int\n) {\n  shipments {\n    request_id\n  }\n}');
  });

  it('keeps plain non-structured selections as trimmed passthrough text', () => {
    expect(normalizeOutputEmbeddedSelectionText('  hello world  ')).toBe('hello world');
  });
});
