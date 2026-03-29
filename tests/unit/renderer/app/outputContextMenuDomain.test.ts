import { describe, expect, it } from 'vitest';
import type { ContextPrettifyTarget } from '../../../../src/renderer/output/contextPrettifyTarget';
import {
  getOutputContextMenuLabel,
  isOutputContextMenuEnabled,
} from '../../../../src/renderer/app/outputContextMenuDomain';

const createTarget = (label: string | null): ContextPrettifyTarget => ({
  label,
  decodedText: '{}',
  sourceRange: {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 3,
  },
  paneDocumentLanguage: 'json',
  sourceKind: 'string-scalar',
});

describe('outputContextMenuDomain', () => {
  it('derives the prettify label from the target label when present', () => {
    expect(getOutputContextMenuLabel(createTarget('payload'))).toBe('Prettify payload...');
    expect(getOutputContextMenuLabel(createTarget(null))).toBe('Prettify ...');
    expect(getOutputContextMenuLabel(null)).toBe('Prettify ...');
  });

  it('treats only concrete targets as enabled', () => {
    expect(isOutputContextMenuEnabled(createTarget('payload'))).toBe(true);
    expect(isOutputContextMenuEnabled(null)).toBe(false);
  });
});
