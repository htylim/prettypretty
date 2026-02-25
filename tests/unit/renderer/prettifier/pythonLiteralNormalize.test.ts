import { describe, expect, it } from 'vitest';
import { normalizePythonLiterals } from '../../../../src/renderer/prettifier/pythonLiteralNormalize';

describe('normalizePythonLiterals', () => {
  it('normalizes True/False/None tokens outside strings', () => {
    const input = "{'a': True, 'b': False, 'c': None}";
    expect(normalizePythonLiterals(input)).toBe("{'a': true, 'b': false, 'c': null}");
  });

  it('does not rewrite token words inside quoted strings', () => {
    const input = "{'text': 'True False None', 'quoted': \"None True\"}";
    expect(normalizePythonLiterals(input)).toBe(input);
  });
});
