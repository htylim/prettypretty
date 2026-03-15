import { describe, expect, it } from 'vitest';
import { isJsonSerializableValue } from '../../../../src/shared/localPrettifier';

describe('isJsonSerializableValue', () => {
  it('accepts nested plain objects and arrays with finite numbers', () => {
    expect(
      isJsonSerializableValue({
        alpha: [1, 2, { beta: true }],
      }),
    ).toBe(true);
  });

  it('rejects non-finite numbers', () => {
    expect(isJsonSerializableValue({ value: Number.NaN })).toBe(false);
    expect(isJsonSerializableValue({ value: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isJsonSerializableValue({ value: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it('rejects unsupported object-like values', () => {
    expect(isJsonSerializableValue(new Map())).toBe(false);
    expect(isJsonSerializableValue({ fn: () => undefined })).toBe(false);
  });
});
