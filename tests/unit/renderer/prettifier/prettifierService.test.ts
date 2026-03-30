import { describe, expect, it } from 'vitest';
import { createPrettifierService } from '../../../../src/renderer/prettifier/prettifierService';

describe('PrettifierService', () => {
  it('prettifies strict JSON with provided indentation', async () => {
    const prettifier = createPrettifierService(2);

    const result = await prettifier.prettify('{"outer":{"inner":1}}');

    expect(result).toContain('\n  "outer": {\n    "inner": 1\n  }\n');
  });

  it('prettifies strict JSON with indent size 4', async () => {
    const prettifier = createPrettifierService(4);

    const result = await prettifier.prettify('{"outer":{"inner":1}}');

    expect(result).toContain('\n    "outer": {\n        "inner": 1\n    }\n');
  });

  it('prettifies JSON5 object literal text', async () => {
    const prettifier = createPrettifierService(2);

    const result = await prettifier.prettify("{foo: 'bar', list: [1, 2,],}");

    expect(result).toBe('{\n  "foo": "bar",\n  "list": [\n    1,\n    2\n  ]\n}');
  });

  it('prettifies python dict-like payloads', async () => {
    const prettifier = createPrettifierService(2);

    const result = await prettifier.prettify("{'a': True, 'b': None, 'nested': {'ok': False}}");

    expect(result).toBe('{\n  "a": true,\n  "b": null,\n  "nested": {\n    "ok": false\n  }\n}');
  });

  it('prettifies newline-delimited JSON records', async () => {
    const prettifier = createPrettifierService(2);

    const result = await prettifier.prettify('{"a":1}\n{"b":[1,2]}');

    expect(result).toBe('{\n  "a": 1\n}\n{\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it('prettifies graphql documents with the configured indent size', async () => {
    const prettifier = createPrettifierService(4);

    const result = await prettifier.prettify(
      'query ListShipments($first: Int){shipments(first:$first){edges{node{id}}}}',
    );

    expect(result).toBe(
      'query ListShipments($first: Int) {\n' +
        '    shipments(first: $first) {\n' +
        '        edges {\n' +
        '            node {\n' +
        '                id\n' +
        '            }\n' +
        '        }\n' +
        '    }\n' +
        '}',
    );
  });

  it('keeps token words inside string literals untouched during python normalization', async () => {
    const prettifier = createPrettifierService(2);

    const result = await prettifier.prettify("{'message': 'True False None', 'value': True}");

    expect(result).toContain('"message": "True False None"');
    expect(result).toContain('"value": true');
  });

  it('returns original text for malformed payloads', async () => {
    const prettifier = createPrettifierService(2);
    const input = '{"a":1';

    await expect(prettifier.prettify(input)).resolves.toBe(input);
  });

  it('returns original text for malformed graphql documents', async () => {
    const prettifier = createPrettifierService(2);
    const input = 'query ListShipments { shipments { id }';

    await expect(prettifier.prettify(input)).resolves.toBe(input);
    await expect(prettifier.prettifyDetailed(input)).resolves.toEqual({
      kind: 'failed',
      localDetection: 'malformed',
      outputText: input,
    });
  });

  it('reports graphql as the local detection on successful graphql formatting', async () => {
    const prettifier = createPrettifierService(2);

    const result = await prettifier.prettifyDetailed('type Shipment{id:ID! request_id:String}');

    expect(result).toEqual({
      kind: 'applied',
      localDetection: 'graphql',
      outputText: 'type Shipment {\n  id: ID!\n  request_id: String\n}',
    });
  });

  it('returns original text for unsupported python constructs', async () => {
    const prettifier = createPrettifierService(2);
    const input = "{'values': set([1, 2, 3])}";

    await expect(prettifier.prettify(input)).resolves.toBe(input);
  });

  it('returns scalar roots unchanged', async () => {
    const prettifier = createPrettifierService(2);

    await expect(prettifier.prettify('42')).resolves.toBe('42');
    await expect(prettifier.prettify("'hello'")).resolves.toBe("'hello'");
    await expect(prettifier.prettify('true')).resolves.toBe('true');
  });

  it('returns original text when parsed values are not JSON-serializable', async () => {
    const prettifier = createPrettifierService(2);
    const input = '{value: NaN}';

    await expect(prettifier.prettify(input)).resolves.toBe(input);
  });
});
