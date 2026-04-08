import { describe, expect, it } from 'vitest';
import { tryFormatJsonLikeTokenPreserving } from '../../../src/shared/jsonLikeTokenPreservingFormatter';

const stripInterTokenWhitespace = (inputText: string): string => {
  let output = '';
  let index = 0;
  let activeQuote: '"' | "'" | null = null;
  let escapeNextCharacter = false;

  while (index < inputText.length) {
    const currentCharacter = inputText[index];
    if (currentCharacter === undefined) {
      break;
    }

    if (activeQuote) {
      output += currentCharacter;

      if (escapeNextCharacter) {
        escapeNextCharacter = false;
        index += 1;
        continue;
      }

      if (currentCharacter === '\\') {
        escapeNextCharacter = true;
        index += 1;
        continue;
      }

      if (currentCharacter === activeQuote) {
        activeQuote = null;
      }

      index += 1;
      continue;
    }

    if (currentCharacter === '"' || currentCharacter === "'") {
      activeQuote = currentCharacter;
      output += currentCharacter;
      index += 1;
      continue;
    }

    if (/\s/u.test(currentCharacter)) {
      index += 1;
      continue;
    }

    output += currentCharacter;
    index += 1;
  }

  return output;
};

describe('tryFormatJsonLikeTokenPreserving', () => {
  it('formats a truncated trailing property key without dropping it', () => {
    const input = '{"foo":1,"bar":2,"baz"';

    const output = tryFormatJsonLikeTokenPreserving(input, 2);

    expect(output).toBe('{\n  "foo": 1,\n  "bar": 2,\n  "baz"');
    expect(stripInterTokenWhitespace(output ?? '')).toBe(stripInterTokenWhitespace(input));
  });

  it('formats truncated nested objects and arrays without inventing closing punctuation', () => {
    expect(tryFormatJsonLikeTokenPreserving('{"foo":{"bar":[1,2,3', 2)).toBe(
      '{\n  "foo": {\n    "bar": [\n      1,\n      2,\n      3',
    );
  });

  it('keeps unterminated strings visible', () => {
    expect(tryFormatJsonLikeTokenPreserving('{"foo":"unterminated', 2)).toBe(
      '{\n  "foo": "unterminated',
    );
  });

  it('keeps missing commas missing while still separating siblings by whitespace', () => {
    const input = '{"foo":1 "bar":2}';

    const output = tryFormatJsonLikeTokenPreserving(input, 2);

    expect(output).toBe('{\n  "foo": 1\n  "bar": 2\n}');
    expect(output).not.toContain(',');
    expect(stripInterTokenWhitespace(output ?? '')).toBe(stripInterTokenWhitespace(input));
  });

  it('formats unquoted object-literal keys when they are followed by a colon', () => {
    const input = '{value: NaN}';

    const output = tryFormatJsonLikeTokenPreserving(input, 2);

    expect(output).toBe('{\n  value: NaN\n}');
    expect(stripInterTokenWhitespace(output ?? '')).toBe(stripInterTokenWhitespace(input));
  });

  it('returns null for unsupported malformed object keys', () => {
    expect(tryFormatJsonLikeTokenPreserving('{bad', 2)).toBeNull();
  });

  it('returns null when a quoted token contains a raw newline', () => {
    expect(tryFormatJsonLikeTokenPreserving('{"foo":"line1\nline2', 2)).toBeNull();
  });
});
