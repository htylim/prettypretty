import { describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor, IRange } from 'monaco-editor';
import { applyOutputViewRange } from '../../../../src/renderer/output/outputViewRange';

const createEditor = (
  lineCount: number,
  setHiddenAreas = vi.fn(),
): MonacoEditor.IStandaloneCodeEditor => {
  return {
    getModel: () =>
      ({
        getLineCount: () => lineCount,
      }) as MonacoEditor.ITextModel,
    setHiddenAreas,
  } as unknown as MonacoEditor.IStandaloneCodeEditor;
};

describe('outputViewRange', () => {
  it('clears hidden areas when the full source should remain visible', () => {
    const setHiddenAreas = vi.fn();
    const source = {};

    applyOutputViewRange(createEditor(10, setHiddenAreas), null, source);

    expect(setHiddenAreas).toHaveBeenCalledWith([], source);
  });

  it('hides lines before and after the selected source range', () => {
    const setHiddenAreas = vi.fn();
    const source = {};

    applyOutputViewRange(
      createEditor(10, setHiddenAreas),
      {
        startLineNumber: 4,
        startColumn: 1,
        endLineNumber: 6,
        endColumn: 2,
      },
      source,
    );

    expect(setHiddenAreas).toHaveBeenCalledWith(
      [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 3,
          endColumn: 1,
        },
        {
          startLineNumber: 7,
          startColumn: 1,
          endLineNumber: 10,
          endColumn: 1,
        },
      ] satisfies IRange[],
      source,
    );
  });
});
