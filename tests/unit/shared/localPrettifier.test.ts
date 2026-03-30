import { parse } from 'graphql';
import { describe, expect, it } from 'vitest';
import { runLocalPrettifier } from '../../../src/shared/localPrettifier';

describe('runLocalPrettifier', () => {
  it('returns plain text as a local no-op text result', async () => {
    const result = await runLocalPrettifier('hello world', 2);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'text',
      outputText: 'hello world',
    });
  });

  it('returns multiline prose as a local no-op text result', async () => {
    const input = 'notes:\nship later';
    const result = await runLocalPrettifier(input, 2);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'text',
      outputText: input,
    });
  });

  it('prettifies graphql operations locally', async () => {
    const result = await runLocalPrettifier(
      'query ListShipments($first: Int){shipments(first:$first){edges{node{id}}}}',
      2,
    );

    expect(result).toEqual({
      kind: 'applied',
      detection: 'graphql',
      outputText:
        'query ListShipments($first: Int) {\n' +
        '  shipments(first: $first) {\n' +
        '    edges {\n' +
        '      node {\n' +
        '        id\n' +
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '}',
    });
  });

  it('prettifies graphql fragments locally', async () => {
    const result = await runLocalPrettifier('fragment ShipmentFields on Shipment{id legacy_id}', 2);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'graphql',
      outputText: 'fragment ShipmentFields on Shipment {\n  id\n  legacy_id\n}',
    });
  });

  it('prettifies graphql schema documents locally', async () => {
    const result = await runLocalPrettifier('type Shipment{id:ID! request_id:String}', 2);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'graphql',
      outputText: 'type Shipment {\n  id: ID!\n  request_id: String\n}',
    });
  });

  it('preserves graphql comments when formatting locally', async () => {
    const result = await runLocalPrettifier('# lead\nquery X{field # tail\n child}', 2);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'graphql',
      outputText: '# lead\nquery X {\n  field # tail\n  child\n}',
    });
  });

  it('formats graphql with the requested indent without changing block-string values', async () => {
    const input = 'mutation Update{update(payload:"""\n x\n   y\n""")}';
    const result = await runLocalPrettifier(input, 4);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'graphql',
      outputText:
        'mutation Update {\n' +
        '    update(\n' +
        '        payload: """\n' +
        '        x\n' +
        '          y\n' +
        '        """\n' +
        '    )\n' +
        '}',
    });

    if (result.kind !== 'applied') {
      throw new Error('expected graphql local prettify to succeed');
    }

    const getBlockStringValue = (documentText: string): string => {
      const document = parse(documentText, { noLocation: true });
      const operation = document.definitions[0];
      if (operation?.kind !== 'OperationDefinition') {
        throw new Error('expected operation definition');
      }

      const field = operation.selectionSet.selections[0];
      if (field?.kind !== 'Field') {
        throw new Error('expected field');
      }

      const argument = field.arguments?.[0];
      if (!argument || argument.value.kind !== 'StringValue') {
        throw new Error('expected string argument');
      }

      return argument.value.value;
    };

    expect(getBlockStringValue(result.outputText)).toBe(getBlockStringValue(input));
  });

  it('returns malformed for invalid graphql documents', async () => {
    const result = await runLocalPrettifier('query ListShipments { shipments { id }', 2);

    expect(result).toEqual({
      kind: 'failed',
      detection: 'malformed',
    });
  });

  it('returns malformed for invalid json-like structured text', async () => {
    const result = await runLocalPrettifier('{bad', 2);

    expect(result).toEqual({
      kind: 'failed',
      detection: 'malformed',
    });
  });

  it('keeps malformed classification for supported syntax behind leading comments', async () => {
    await expect(runLocalPrettifier('# note\nquery Shipments {', 2)).resolves.toEqual({
      kind: 'failed',
      detection: 'malformed',
    });

    await expect(runLocalPrettifier('/* note */ {bad', 2)).resolves.toEqual({
      kind: 'failed',
      detection: 'malformed',
    });
  });

  it('does not classify keyword-leading prose as malformed graphql', async () => {
    const result = await runLocalPrettifier('Query planning notes for next sprint', 2);

    expect(result).toEqual({
      kind: 'applied',
      detection: 'text',
      outputText: 'Query planning notes for next sprint',
    });
  });

  it('keeps scalar roots on the existing local success path', async () => {
    await expect(runLocalPrettifier('42', 2)).resolves.toEqual({
      kind: 'applied',
      detection: 'json',
      outputText: '42',
    });
    await expect(runLocalPrettifier("'hello'", 2)).resolves.toEqual({
      kind: 'applied',
      detection: 'json5',
      outputText: "'hello'",
    });
  });
});
