import { describe, expect, it } from 'vitest';
import { detectOutputLanguage } from '../../../../src/renderer/output/detectOutputLanguage';

describe('detectOutputLanguage', () => {
  it('detects valid json', () => {
    expect(detectOutputLanguage('{"a":1}')).toBe('json');
  });

  it('detects malformed json-like content as json', () => {
    expect(detectOutputLanguage('{"a":1,}')).toBe('json');
  });

  it('detects newline-delimited json as json', () => {
    expect(detectOutputLanguage('{"a":1}\n{"b":2}')).toBe('json');
  });

  it('detects typescript', () => {
    const input = 'interface Item { id: string }\nconst value: Item = { id: "1" };';
    expect(detectOutputLanguage(input)).toBe('typescript');
  });

  it('detects javascript', () => {
    const input = 'const sum = (a, b) => a + b;';
    expect(detectOutputLanguage(input)).toBe('javascript');
  });

  it('detects yaml', () => {
    const input = 'name: prettypretty\nversion: 1';
    expect(detectOutputLanguage(input)).toBe('yaml');
  });

  it('detects xml', () => {
    const input = '<root><item id="1"/></root>';
    expect(detectOutputLanguage(input)).toBe('xml');
  });

  it('detects sql', () => {
    const input = 'SELECT id, name FROM users WHERE active = 1;';
    expect(detectOutputLanguage(input)).toBe('sql');
  });

  it('detects graphql operations', () => {
    const input =
      'query ListShipments($first: Int) { shipments(first: $first) { edges { node { id } } } }';
    expect(detectOutputLanguage(input)).toBe('graphql');
  });

  it('detects graphql schema definitions', () => {
    const input = 'type Shipment {\n  id: ID!\n  request_id: String\n}';
    expect(detectOutputLanguage(input)).toBe('graphql');
  });

  it('detects markdown', () => {
    const input = '# Title\n\n- first\n- second';
    expect(detectOutputLanguage(input)).toBe('markdown');
  });

  it('falls back to plaintext', () => {
    expect(detectOutputLanguage('just random words')).toBe('plaintext');
  });
});
