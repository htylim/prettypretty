import { describe, expect, it } from 'vitest';
import { resolveContextPrettifyTarget } from '../../../../src/renderer/output/contextPrettifyTarget';

const position = (lineNumber: number, column: number) => ({ lineNumber, column });

describe('resolveContextPrettifyTarget', () => {
  it('resolves a JSON key click to the associated string value and label', () => {
    const text = '{\n  "query": "{\\n  field\\n}"\n}';

    const target = resolveContextPrettifyTarget('json', text, position(2, 4));

    expect(target).toEqual({
      label: 'query',
      decodedText: '{\n  field\n}',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 12,
        endLineNumber: 2,
        endColumn: 27,
      },
      paneDocumentLanguage: 'json',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves a JSON string scalar click inside the scalar body', () => {
    const text = '{\n  "name": "alpha\\nbeta"\n}';

    const target = resolveContextPrettifyTarget('json', text, position(2, 15));

    expect(target).toEqual({
      label: 'name',
      decodedText: 'alpha\nbeta',
      sourceRange: {
        startLineNumber: 2,
        startColumn: 11,
        endLineNumber: 2,
        endColumn: 24,
      },
      paneDocumentLanguage: 'json',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves NDJSON records independently', () => {
    const text = '{\n  "first": "one"\n}\n{\n  "second": "two"\n}';

    const target = resolveContextPrettifyTarget('json', text, position(5, 15));

    expect(target).toEqual({
      label: 'second',
      decodedText: 'two',
      sourceRange: {
        startLineNumber: 5,
        startColumn: 13,
        endLineNumber: 5,
        endColumn: 18,
      },
      paneDocumentLanguage: 'json',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves quoted YAML scalars from either the key or the scalar body', () => {
    const text = 'payload: "query {\\n  field\\n}"';

    expect(resolveContextPrettifyTarget('yaml', text, position(1, 4))).toMatchObject({
      label: 'payload',
      decodedText: 'query {\n  field\n}',
      paneDocumentLanguage: 'yaml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('yaml', text, position(1, 12))).toMatchObject({
      label: 'payload',
      decodedText: 'query {\n  field\n}',
      paneDocumentLanguage: 'yaml',
      sourceKind: 'string-scalar',
    });
  });

  it('decodes quoted YAML key labels before exposing them in the context target', () => {
    const text = '"payload \\"key\\"": hello-world';

    const target = resolveContextPrettifyTarget('yaml', text, position(1, 4));

    expect(target).toMatchObject({
      label: 'payload "key"',
      decodedText: 'hello-world',
      paneDocumentLanguage: 'yaml',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves plain YAML string scalars and keeps non-string literals disabled', () => {
    const text = 'name: hello-world\ncount: 4\nactive: true';

    expect(resolveContextPrettifyTarget('yaml', text, position(1, 3))).toMatchObject({
      label: 'name',
      decodedText: 'hello-world',
      paneDocumentLanguage: 'yaml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('yaml', text, position(2, 3))).toBeNull();
    expect(resolveContextPrettifyTarget('yaml', text, position(3, 3))).toBeNull();
  });

  it('keeps obviously ambiguous YAML plain scalars disabled', () => {
    const text = 'url: http://example.com';

    expect(resolveContextPrettifyTarget('yaml', text, position(1, 8))).toBeNull();
  });

  it('resolves YAML block scalars for literal and folded styles', () => {
    const literalText = 'payload: |\n  query ListShipments\n  {\n    shipments\n  }';
    const foldedText = 'summary: >\n  first line\n  second line\n\n  third line';

    expect(resolveContextPrettifyTarget('yaml', literalText, position(1, 4))).toMatchObject({
      label: 'payload',
      decodedText: 'query ListShipments\n{\n  shipments\n}',
      paneDocumentLanguage: 'yaml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('yaml', foldedText, position(1, 4))).toMatchObject({
      label: 'summary',
      decodedText: 'first line second line\nthird line',
      paneDocumentLanguage: 'yaml',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves JavaScript string literals from a named binding', () => {
    const text = 'const query = "{\\"leaf\\":1}";';

    expect(resolveContextPrettifyTarget('javascript', text, position(1, 7))).toMatchObject({
      label: 'query',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'javascript',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('javascript', text, position(1, 18))).toMatchObject({
      label: 'query',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'javascript',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves TypeScript no-interpolation template literals and disables interpolated templates', () => {
    const templateText = 'const query: string = `query ListShipments\\n{\\n  shipments\\n}`;';
    const interpolatedText = 'const query = `hello ${name}`;';

    expect(resolveContextPrettifyTarget('typescript', templateText, position(1, 7))).toMatchObject({
      label: 'query',
      decodedText: 'query ListShipments\n{\n  shipments\n}',
      paneDocumentLanguage: 'typescript',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('typescript', interpolatedText, position(1, 7))).toBeNull();
    expect(
      resolveContextPrettifyTarget('typescript', interpolatedText, position(1, 17)),
    ).toBeNull();
  });

  it('resolves GraphQL quoted string values from argument names or string bodies', () => {
    const text = 'query Search { search(query: "{\\"leaf\\":1}") }';

    expect(resolveContextPrettifyTarget('graphql', text, position(1, 23))).toMatchObject({
      label: 'query',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'graphql',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('graphql', text, position(1, 31))).toMatchObject({
      label: 'query',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'graphql',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves GraphQL block string values and keeps non-string values disabled', () => {
    const text = 'mutation Update { update(payload: """\n  {\n    "leaf": 1\n  }\n""", count: 4) }';

    expect(resolveContextPrettifyTarget('graphql', text, position(1, 27))).toMatchObject({
      label: 'payload',
      decodedText: '{\n  "leaf": 1\n}',
      paneDocumentLanguage: 'graphql',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('graphql', text, position(2, 5))).toMatchObject({
      label: 'payload',
      decodedText: '{\n  "leaf": 1\n}',
      paneDocumentLanguage: 'graphql',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('graphql', text, position(5, 13))).toBeNull();
  });

  it('keeps malformed GraphQL containers disabled', () => {
    const text = 'query Search { search(query: "{\\"leaf\\":1}"';

    expect(resolveContextPrettifyTarget('graphql', text, position(1, 23))).toBeNull();
    expect(resolveContextPrettifyTarget('graphql', text, position(1, 31))).toBeNull();
  });

  it('resolves XML attribute values from attribute names or value bodies', () => {
    const text = '<request payload="{&quot;leaf&quot;:1}" />';

    expect(resolveContextPrettifyTarget('xml', text, position(1, 10))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('xml', text, position(1, 21))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
      sourceKind: 'string-scalar',
    });
  });

  it('resolves XML text nodes and CDATA payloads from element names or payload bodies', () => {
    const textNodeText = '<payload>{"leaf":1}</payload>';
    const cdataText = '<payload><![CDATA[{"leaf":1}]]></payload>';

    expect(resolveContextPrettifyTarget('xml', textNodeText, position(1, 2))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('xml', textNodeText, position(1, 13))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('xml', cdataText, position(1, 2))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('xml', cdataText, position(1, 21))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'xml',
      sourceKind: 'string-scalar',
    });
  });

  it('keeps malformed or whitespace-only XML targets disabled', () => {
    const malformedText = '<payload>{"leaf":1}';
    const whitespaceText = '<payload>   </payload>';

    expect(resolveContextPrettifyTarget('xml', malformedText, position(1, 2))).toBeNull();
    expect(resolveContextPrettifyTarget('xml', whitespaceText, position(1, 2))).toBeNull();
  });

  it('resolves SQL quoted string literals from column names or literal bodies', () => {
    const text = 'select * from requests where payload = \'{"leaf":1}\';';

    expect(resolveContextPrettifyTarget('sql', text, position(1, 30))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'sql',
      sourceKind: 'string-scalar',
    });
    expect(resolveContextPrettifyTarget('sql', text, position(1, 42))).toMatchObject({
      label: 'payload',
      decodedText: '{"leaf":1}',
      paneDocumentLanguage: 'sql',
      sourceKind: 'string-scalar',
    });
  });

  it('keeps malformed or non-string SQL regions disabled', () => {
    const malformedText = 'select * from requests where payload = \'{"leaf":1};';
    const nonStringText = 'select * from requests where count = 4;';

    expect(resolveContextPrettifyTarget('sql', malformedText, position(1, 30))).toBeNull();
    expect(resolveContextPrettifyTarget('sql', nonStringText, position(1, 28))).toBeNull();
  });

  it('disables empty decoded string scalars', () => {
    const text = '{\n  "empty": ""\n}';

    expect(resolveContextPrettifyTarget('json', text, position(2, 4))).toBeNull();
    expect(resolveContextPrettifyTarget('json', text, position(2, 13))).toBeNull();
  });

  it('disables non-string or non-structured targets', () => {
    const jsonText = '{\n  "count": 4\n}';
    const plaintextText = 'plain text';

    expect(resolveContextPrettifyTarget('json', jsonText, position(2, 13))).toBeNull();
    expect(resolveContextPrettifyTarget('plaintext', plaintextText, position(1, 1))).toBeNull();
  });
});
