import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import { resolveStructuralSplitSelection } from '../../../../src/renderer/output/structuralSplitSelection';

const resolveSmallestEnclosingFoldRangeMock = vi.fn();

vi.mock('../../../../src/renderer/editor/monacoFolding', () => ({
  resolveSmallestEnclosingFoldRange: (...args: unknown[]) =>
    resolveSmallestEnclosingFoldRangeMock(...args),
}));

const createModel = (lines: string[]): MonacoEditor.ITextModel => {
  return {
    getLineMaxColumn: (lineNumber: number) => (lines[lineNumber - 1]?.length ?? 0) + 1,
  } as MonacoEditor.ITextModel;
};

const createEditor = (lines: string[]): MonacoEditor.IStandaloneCodeEditor => {
  return {
    getModel: () => createModel(lines),
  } as MonacoEditor.IStandaloneCodeEditor;
};

describe('structuralSplitSelection', () => {
  beforeEach(() => {
    resolveSmallestEnclosingFoldRangeMock.mockReset();
  });

  it('extracts the full Monaco model range for the smallest enclosing fold', async () => {
    resolveSmallestEnclosingFoldRangeMock.mockResolvedValue({
      startLineNumber: 2,
      endLineNumber: 5,
      isCollapsed: false,
    });

    const selection = await resolveStructuralSplitSelection(
      createEditor(['{', '  "root": {', '    "nested": {', '      "leaf": 1', '    }', '  }', '}']),
      4,
    );

    expect(selection).toEqual({
      sourceRange: {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 5,
        endColumn: 6,
      },
    });
  });

  it('keeps nested child selections inside a derived pane view range', async () => {
    resolveSmallestEnclosingFoldRangeMock.mockResolvedValue({
      startLineNumber: 3,
      endLineNumber: 5,
      isCollapsed: false,
    });

    const selection = await resolveStructuralSplitSelection(
      createEditor(['{', '  "root": {', '    "nested": {', '      "leaf": 1', '    }', '  }', '}']),
      4,
      {
        startLineNumber: 2,
        startColumn: 1,
        endLineNumber: 6,
        endColumn: 4,
      },
    );

    expect(selection).toEqual({
      sourceRange: {
        startLineNumber: 3,
        startColumn: 1,
        endLineNumber: 5,
        endColumn: 6,
      },
    });
  });

  it('returns the folded block itself when the clicked line is a folded start', async () => {
    resolveSmallestEnclosingFoldRangeMock.mockResolvedValue({
      startLineNumber: 1,
      endLineNumber: 3,
      isCollapsed: true,
    });

    const selection = await resolveStructuralSplitSelection(
      createEditor(['{', '  "folded": true', '}']),
      1,
    );

    expect(selection?.sourceRange.startLineNumber).toBe(1);
    expect(selection?.sourceRange.endLineNumber).toBe(3);
  });

  it('returns null when the resolved range equals the derived pane view range', async () => {
    resolveSmallestEnclosingFoldRangeMock.mockResolvedValue({
      startLineNumber: 2,
      endLineNumber: 5,
      isCollapsed: false,
    });

    await expect(
      resolveStructuralSplitSelection(
        createEditor(['{', '  "root": {', '    "nested": true', '    "other": true', '  }', '}']),
        2,
        {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 5,
          endColumn: 4,
        },
      ),
    ).resolves.toBeNull();
  });

  it('returns null when Monaco resolves a range outside the pane view range', async () => {
    resolveSmallestEnclosingFoldRangeMock.mockResolvedValue({
      startLineNumber: 1,
      endLineNumber: 5,
      isCollapsed: false,
    });

    await expect(
      resolveStructuralSplitSelection(
        createEditor(['{', '  "nested": {', '    "leaf": 1', '  }', '}']),
        2,
        {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 4,
        },
      ),
    ).resolves.toBeNull();
  });

  it('returns null when Monaco resolves no enclosing foldable block', async () => {
    resolveSmallestEnclosingFoldRangeMock.mockResolvedValue(null);

    await expect(
      resolveStructuralSplitSelection(createEditor(['const x = 1;']), 1),
    ).resolves.toBeNull();
  });
});
