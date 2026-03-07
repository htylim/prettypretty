import { describe, expect, it } from 'vitest';
import { createPrettifierService } from '../../../../src/renderer/prettifier/prettifierService';

describe('PrettifierService', () => {
  it('prettifies strict JSON with provided indentation', () => {
    const prettifier = createPrettifierService(2);

    const result = prettifier.prettify('{"outer":{"inner":1}}');

    expect(result).toContain('\n  "outer": {\n    "inner": 1\n  }\n');
  });

  it('prettifies strict JSON with indent size 4', () => {
    const prettifier = createPrettifierService(4);

    const result = prettifier.prettify('{"outer":{"inner":1}}');

    expect(result).toContain('\n    "outer": {\n        "inner": 1\n    }\n');
  });

  it('prettifies JSON5 object literal text', () => {
    const prettifier = createPrettifierService(2);

    const result = prettifier.prettify("{foo: 'bar', list: [1, 2,],}");

    expect(result).toBe('{\n  "foo": "bar",\n  "list": [\n    1,\n    2\n  ]\n}');
  });

  it('prettifies python dict-like payloads', () => {
    const prettifier = createPrettifierService(2);

    const result = prettifier.prettify("{'a': True, 'b': None, 'nested': {'ok': False}}");

    expect(result).toBe('{\n  "a": true,\n  "b": null,\n  "nested": {\n    "ok": false\n  }\n}');
  });

  it('prettifies newline-delimited JSON records', () => {
    const prettifier = createPrettifierService(2);

    const result = prettifier.prettify('{"a":1}\n{"b":[1,2]}');

    expect(result).toBe('{\n  "a": 1\n}\n{\n  "b": [\n    1,\n    2\n  ]\n}');
  });

  it('keeps token words inside string literals untouched during python normalization', () => {
    const prettifier = createPrettifierService(2);

    const result = prettifier.prettify("{'message': 'True False None', 'value': True}");

    expect(result).toContain('"message": "True False None"');
    expect(result).toContain('"value": true');
  });

  it('returns original text for malformed payloads', () => {
    const prettifier = createPrettifierService(2);
    const input = '{"a":1';

    expect(prettifier.prettify(input)).toBe(input);
  });

  it('returns original text for unsupported python constructs', () => {
    const prettifier = createPrettifierService(2);
    const input = "{'values': set([1, 2, 3])}";

    expect(prettifier.prettify(input)).toBe(input);
  });

  it('returns scalar roots unchanged', () => {
    const prettifier = createPrettifierService(2);

    expect(prettifier.prettify('42')).toBe('42');
    expect(prettifier.prettify("'hello'")).toBe("'hello'");
    expect(prettifier.prettify('true')).toBe('true');
  });

  it('returns original text when parsed values are not JSON-serializable', () => {
    const prettifier = createPrettifierService(2);
    const input = '{value: NaN}';

    expect(prettifier.prettify(input)).toBe(input);
  });
});
