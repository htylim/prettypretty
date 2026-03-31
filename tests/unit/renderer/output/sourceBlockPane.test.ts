import { describe, expect, it } from 'vitest';
import {
  extractRebasedSourceBlockText,
  getDisplayedLineNumber,
} from '../../../../src/renderer/output/sourceBlockPane';

describe('sourceBlockPane', () => {
  it('rebases common leading indentation while preserving relative indentation and blank lines', () => {
    const model = {
      getLineContent: (lineNumber: number) =>
        (
          ({
            3: '      {',
            4: '        "leaf": 1,',
            5: '',
            6: '      }',
          }) as Record<number, string>
        )[lineNumber] ?? '',
    };

    expect(
      extractRebasedSourceBlockText(model, {
        startLineNumber: 3,
        endLineNumber: 6,
      }),
    ).toBe('{\n  "leaf": 1,\n\n}');
  });

  it('maps local pane line numbers back to the displayed source numbering', () => {
    expect(getDisplayedLineNumber(3, null)).toBe(3);
    expect(getDisplayedLineNumber(3, 41)).toBe(43);
  });
});
