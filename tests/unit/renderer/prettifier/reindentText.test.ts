import { describe, expect, it } from 'vitest';
import { reindentText } from '../../../../src/renderer/prettifier/reindentText';

describe('reindentText', () => {
  it('expands indentation from 2 to 4 spaces', () => {
    const input = '{\n  "outer": {\n    "inner": 1\n  }\n}';

    expect(reindentText(input, 2, 4)).toBe('{\n    "outer": {\n        "inner": 1\n    }\n}');
  });

  it('contracts indentation from 4 to 2 spaces', () => {
    const input = '{\n    "outer": {\n        "inner": 1\n    }\n}';

    expect(reindentText(input, 4, 2)).toBe('{\n  "outer": {\n    "inner": 1\n  }\n}');
  });

  it('preserves lines without leading indentation', () => {
    const input = 'alpha\n  beta\ngamma';

    expect(reindentText(input, 2, 4)).toBe('alpha\n    beta\ngamma');
  });

  it('conservatively preserves irregular whitespace remainder', () => {
    const input = '   alpha\n\t beta\n';

    expect(reindentText(input, 2, 4)).toBe('     alpha\n     beta\n');
  });
});
