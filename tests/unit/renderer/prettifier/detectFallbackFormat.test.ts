import { describe, expect, it } from 'vitest';
import { detectFallbackFormatLabel } from '../../../../src/renderer/prettifier/detectFallbackFormat';

describe('detectFallbackFormatLabel', () => {
  it('detects JSON-like malformed text as JSON', () => {
    expect(detectFallbackFormatLabel('{"a":1,}')).toBe('JSON');
  });

  it('treats object-like malformed text as JSON', () => {
    expect(detectFallbackFormatLabel('{bad')).toBe('JSON');
  });

  it('detects python-like malformed text as Python', () => {
    expect(detectFallbackFormatLabel("{'a': True, 'b': None,")).toBe('Python');
  });

  it('detects SQL text as SQL', () => {
    expect(detectFallbackFormatLabel('SELECT * FROM users WHERE id = 1')).toBe('SQL');
  });

  it('falls back to text when no format signal is found', () => {
    expect(detectFallbackFormatLabel('just words here')).toBe('text');
  });
});
