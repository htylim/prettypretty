import { describe, expect, it } from 'vitest';
import { getLocalResultOutputLanguageOverride } from '../../../../src/renderer/prettifier/localResultOutputLanguage';
import type { LocalPrettifySummary } from '../../../../src/shared/prettifier';

describe('getLocalResultOutputLanguageOverride', () => {
  it('returns json for structured json-like output, including token-preserving results', () => {
    const canonicalResult: LocalPrettifySummary = {
      kind: 'applied',
      family: 'json-like',
      mode: 'canonical',
      variant: 'json',
    };
    const tokenPreservingResult: LocalPrettifySummary = {
      kind: 'applied',
      family: 'json-like',
      mode: 'token-preserving',
      variant: 'json-like-token-preserving',
    };

    expect(getLocalResultOutputLanguageOverride(canonicalResult, '{\n  "value": true\n}')).toBe(
      'json',
    );
    expect(
      getLocalResultOutputLanguageOverride(tokenPreservingResult, '{\n  "value": true\n'),
    ).toBe('json');
  });

  it('returns json for ndjson output', () => {
    const localResult: LocalPrettifySummary = {
      kind: 'applied',
      family: 'json-like',
      mode: 'canonical',
      variant: 'ndjson',
    };

    expect(getLocalResultOutputLanguageOverride(localResult, '{"a":1}\n{"b":2}')).toBe('json');
  });

  it('returns graphql for graphql output', () => {
    const localResult: LocalPrettifySummary = {
      kind: 'applied',
      family: 'graphql',
      mode: 'canonical',
      variant: 'graphql',
    };

    expect(getLocalResultOutputLanguageOverride(localResult, 'query X {\n  field\n}')).toBe(
      'graphql',
    );
  });

  it('returns null for scalar json-like roots, text output, and failed local results', () => {
    const scalarJsonResult: LocalPrettifySummary = {
      kind: 'applied',
      family: 'json-like',
      mode: 'canonical',
      variant: 'json',
    };
    const textResult: LocalPrettifySummary = {
      kind: 'applied',
      family: 'text',
      mode: 'passthrough',
      variant: 'text',
    };
    const failedResult: LocalPrettifySummary = {
      kind: 'failed',
      family: 'json-like',
      reason: 'malformed',
    };

    expect(getLocalResultOutputLanguageOverride(scalarJsonResult, '42')).toBeNull();
    expect(getLocalResultOutputLanguageOverride(textResult, 'hello')).toBeNull();
    expect(getLocalResultOutputLanguageOverride(failedResult, '{bad')).toBeNull();
  });
});
