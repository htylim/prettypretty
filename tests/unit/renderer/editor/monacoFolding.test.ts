import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  findOwningFoldStartLine,
  findSmallestEnclosingFoldRange,
  getVisibleFoldStartLines,
  isFoldStartCollapsed,
  resolveSmallestEnclosingFoldRange,
  toggleFoldStart,
} from '../../../../src/renderer/editor/monacoFolding';

type RegionSeed = {
  startLineNumber: number;
  endLineNumber: number;
  isCollapsed?: boolean;
  parentIndex?: number;
};

type TestRegion = {
  regionIndex: number;
  startLineNumber: number;
  endLineNumber: number;
  isCollapsed: boolean;
  parentIndex: number;
};

const createFoldingModel = (regionsSeed: RegionSeed[]) => {
  const toggleCollapseStateMock = vi.fn();
  const regions: TestRegion[] = regionsSeed.map((region, index) => ({
    regionIndex: index,
    startLineNumber: region.startLineNumber,
    endLineNumber: region.endLineNumber,
    isCollapsed: region.isCollapsed ?? false,
    parentIndex: region.parentIndex ?? -1,
  }));

  const foldingModel = {
    regions: {
      length: regions.length,
      getStartLineNumber: (index: number) => regions[index]?.startLineNumber ?? 0,
      getEndLineNumber: (index: number) => regions[index]?.endLineNumber ?? 0,
      isCollapsed: (index: number) => regions[index]?.isCollapsed ?? false,
      toRegion: (index: number) => regions[index] ?? null,
    },
    getRegionAtLine: (lineNumber: number) => {
      for (let index = regions.length - 1; index >= 0; index -= 1) {
        const region = regions[index];
        if (!region) {
          continue;
        }

        if (lineNumber >= region.startLineNumber && lineNumber <= region.endLineNumber) {
          return region;
        }
      }

      return null;
    },
    toggleCollapseState: toggleCollapseStateMock,
  };

  return { foldingModel, toggleCollapseStateMock };
};

const createEditor = ({
  regions,
  visibleRanges = [{ startLineNumber: 1, endLineNumber: 20 }],
  lineCount = 20,
  contributionMode = 'sync',
}: {
  regions: RegionSeed[];
  visibleRanges?: Array<{ startLineNumber: number; endLineNumber: number }>;
  lineCount?: number;
  contributionMode?: 'sync' | 'async';
}): {
  editor: MonacoEditor.IStandaloneCodeEditor;
  toggleCollapseStateMock: ReturnType<typeof vi.fn>;
  getFoldingModelMock: ReturnType<typeof vi.fn>;
} => {
  const { foldingModel, toggleCollapseStateMock } = createFoldingModel(regions);
  const getFoldingModelMock = vi.fn(async () => foldingModel);
  const contribution =
    contributionMode === 'sync'
      ? {
          foldingModel,
          getFoldingModel: getFoldingModelMock,
        }
      : {
          getFoldingModel: getFoldingModelMock,
        };

  const editor = {
    getContribution: vi.fn(() => contribution),
    getVisibleRanges: () => visibleRanges,
    getModel: () =>
      ({
        getLineCount: () => lineCount,
      }) as MonacoEditor.ITextModel,
  } as unknown as MonacoEditor.IStandaloneCodeEditor;

  return { editor, toggleCollapseStateMock, getFoldingModelMock };
};

describe('monacoFolding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers visible fold starts from Monaco fold regions', async () => {
    const { editor, getFoldingModelMock } = createEditor({
      regions: [
        { startLineNumber: 2, endLineNumber: 6 },
        { startLineNumber: 8, endLineNumber: 12, isCollapsed: true },
      ],
      visibleRanges: [{ startLineNumber: 1, endLineNumber: 9 }],
      contributionMode: 'async',
    });

    await expect(getVisibleFoldStartLines(editor)).resolves.toEqual([
      { lineNumber: 2, endLineNumber: 6, isCollapsed: false },
      { lineNumber: 8, endLineNumber: 12, isCollapsed: true },
    ]);
    expect(getFoldingModelMock).toHaveBeenCalledTimes(1);
  });

  it('filters fold starts to the visible editor window with overscan', async () => {
    const { editor } = createEditor({
      regions: [
        { startLineNumber: 2, endLineNumber: 4 },
        { startLineNumber: 6, endLineNumber: 10 },
        { startLineNumber: 14, endLineNumber: 18 },
      ],
      visibleRanges: [{ startLineNumber: 7, endLineNumber: 11 }],
    });

    await expect(getVisibleFoldStartLines(editor, 1)).resolves.toEqual([
      { lineNumber: 6, endLineNumber: 10, isCollapsed: false },
    ]);
  });

  it('resolves the owning fold start for nested lines', () => {
    const { editor } = createEditor({
      regions: [
        { startLineNumber: 1, endLineNumber: 8 },
        { startLineNumber: 2, endLineNumber: 5, parentIndex: 0 },
        { startLineNumber: 3, endLineNumber: 4, parentIndex: 1 },
      ],
    });

    expect(findOwningFoldStartLine(editor, 4)).toBe(3);
    expect(findOwningFoldStartLine(editor, 2)).toBe(2);
  });

  it('returns the smallest enclosing fold range for nested regions', async () => {
    const { editor } = createEditor({
      regions: [
        { startLineNumber: 1, endLineNumber: 10 },
        { startLineNumber: 3, endLineNumber: 8, parentIndex: 0 },
        { startLineNumber: 4, endLineNumber: 6, parentIndex: 1, isCollapsed: true },
      ],
    });

    expect(findSmallestEnclosingFoldRange(editor, 5)).toEqual({
      startLineNumber: 4,
      endLineNumber: 6,
      isCollapsed: true,
    });

    await expect(resolveSmallestEnclosingFoldRange(editor, 5)).resolves.toEqual({
      startLineNumber: 4,
      endLineNumber: 6,
      isCollapsed: true,
    });
  });

  it('reports collapsed state for fold-start lines and null outside fold regions', () => {
    const { editor } = createEditor({
      regions: [
        { startLineNumber: 2, endLineNumber: 6, isCollapsed: true },
        { startLineNumber: 8, endLineNumber: 12, isCollapsed: false },
      ],
    });

    expect(isFoldStartCollapsed(editor, 2)).toBe(true);
    expect(isFoldStartCollapsed(editor, 8)).toBe(false);
    expect(isFoldStartCollapsed(editor, 5)).toBeNull();
    expect(findOwningFoldStartLine(editor, 20)).toBeNull();
  });

  it('toggles the Monaco region for a specific fold-start line', () => {
    const { editor, toggleCollapseStateMock } = createEditor({
      regions: [{ startLineNumber: 4, endLineNumber: 9 }],
    });

    expect(toggleFoldStart(editor, 4)).toBe(true);
    expect(toggleCollapseStateMock).toHaveBeenCalledWith([
      expect.objectContaining({
        startLineNumber: 4,
        endLineNumber: 9,
      }),
    ]);
    expect(toggleFoldStart(editor, 7)).toBe(false);
  });
});
