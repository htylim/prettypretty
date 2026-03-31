import { describe, expect, it } from 'vitest';
import { areOutputPaneSourceRangesEqual } from '../../../../src/renderer/output/outputRange';

describe('outputRange', () => {
  it('compares pane source ranges structurally', () => {
    expect(
      areOutputPaneSourceRangesEqual(
        {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
        {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
      ),
    ).toBe(true);

    expect(
      areOutputPaneSourceRangesEqual(
        {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
        {
          startLineNumber: 3,
          startColumn: 1,
          endLineNumber: 6,
          endColumn: 2,
        },
      ),
    ).toBe(false);
  });
});
