import type { IRange, editor as MonacoEditor } from 'monaco-editor';

const FOLDING_CONTRIBUTION_ID = 'editor.contrib.folding';

type FoldingRegion = {
  readonly regionIndex: number;
  readonly startLineNumber: number;
  readonly endLineNumber: number;
  readonly isCollapsed: boolean;
  readonly parentIndex: number;
};

type FoldingRegions = {
  readonly length: number;
  getStartLineNumber: (index: number) => number;
  getEndLineNumber: (index: number) => number;
  isCollapsed: (index: number) => boolean;
  toRegion: (index: number) => FoldingRegion;
};

type FoldingModel = {
  readonly regions: FoldingRegions;
  getRegionAtLine: (lineNumber: number) => FoldingRegion | null;
  toggleCollapseState: (regions: FoldingRegion[]) => void;
};

type FoldingContribution = {
  readonly foldingModel?: FoldingModel | null;
  getFoldingModel?: () => Promise<FoldingModel | null> | null;
};

export type FoldToggleAction = 'collapse' | 'expand';

export type FoldStart = {
  lineNumber: number;
  endLineNumber: number;
  isCollapsed: boolean;
  childToggleAction: FoldToggleAction | null;
};

export type FoldRange = {
  startLineNumber: number;
  endLineNumber: number;
  isCollapsed: boolean;
};

const getFoldingContribution = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): FoldingContribution | null =>
  (editor.getContribution(FOLDING_CONTRIBUTION_ID) as FoldingContribution | null) ?? null;

const getCurrentFoldingModel = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): FoldingModel | null => {
  const contribution = getFoldingContribution(editor);
  return contribution?.foldingModel ?? null;
};

const getFoldingModel = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
): Promise<FoldingModel | null> => {
  const currentModel = getCurrentFoldingModel(editor);
  if (currentModel) {
    return currentModel;
  }

  const contribution = getFoldingContribution(editor);
  return (await contribution?.getFoldingModel?.()) ?? null;
};

const buildDirectChildRegionsByParentIndex = (
  foldingModel: FoldingModel,
): ReadonlyMap<number, readonly FoldingRegion[]> => {
  const childRegionsByParentIndex = new Map<number, FoldingRegion[]>();
  const regions = foldingModel.regions;

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions.toRegion(index);
    if (!region || region.parentIndex < 0) {
      continue;
    }

    const existingChildren = childRegionsByParentIndex.get(region.parentIndex);
    if (existingChildren) {
      existingChildren.push(region);
      continue;
    }

    childRegionsByParentIndex.set(region.parentIndex, [region]);
  }

  return childRegionsByParentIndex;
};

const getVisibleLineWindow = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  overscanLines: number,
): { startLineNumber: number; endLineNumber: number } | null => {
  const model = editor.getModel();
  if (!model) {
    return null;
  }

  const visibleRanges = editor.getVisibleRanges();
  if (visibleRanges.length === 0) {
    return null;
  }

  let startLineNumber = Number.POSITIVE_INFINITY;
  let endLineNumber = 0;

  for (const range of visibleRanges) {
    startLineNumber = Math.min(startLineNumber, range.startLineNumber);
    endLineNumber = Math.max(endLineNumber, range.endLineNumber);
  }

  return {
    startLineNumber: Math.max(1, startLineNumber - overscanLines),
    endLineNumber: Math.min(model.getLineCount(), endLineNumber + overscanLines),
  };
};

const getFoldRegionAtStartLine = (
  foldingModel: FoldingModel,
  foldStartLineNumber: number,
): FoldingRegion | null => {
  const directRegion = foldingModel.getRegionAtLine(foldStartLineNumber);
  if (directRegion?.startLineNumber === foldStartLineNumber) {
    return directRegion;
  }

  const regions = foldingModel.regions;
  for (let index = 0; index < regions.length; index += 1) {
    if (regions.getStartLineNumber(index) === foldStartLineNumber) {
      return regions.toRegion(index);
    }
  }

  return null;
};

const getDirectChildRegions = (
  foldingModel: FoldingModel,
  parentRegion: FoldingRegion,
): FoldingRegion[] => {
  return [
    ...(buildDirectChildRegionsByParentIndex(foldingModel).get(parentRegion.regionIndex) ?? []),
  ];
};

const getChildToggleAction = (childRegions: readonly FoldingRegion[]): FoldToggleAction | null => {
  if (childRegions.length === 0) {
    return null;
  }

  return childRegions.some((region) => !region.isCollapsed) ? 'collapse' : 'expand';
};

const getFoldStartsFromModel = (foldingModel: FoldingModel): FoldStart[] => {
  const foldStarts: FoldStart[] = [];
  const childRegionsByParentIndex = buildDirectChildRegionsByParentIndex(foldingModel);
  const regions = foldingModel.regions;

  for (let index = 0; index < regions.length; index += 1) {
    foldStarts.push({
      lineNumber: regions.getStartLineNumber(index),
      endLineNumber: regions.getEndLineNumber(index),
      isCollapsed: regions.isCollapsed(index),
      childToggleAction: getChildToggleAction(childRegionsByParentIndex.get(index) ?? []),
    });
  }

  return foldStarts;
};

const toFoldRange = (region: FoldingRegion | null): FoldRange | null => {
  if (!region) {
    return null;
  }

  return {
    startLineNumber: region.startLineNumber,
    endLineNumber: region.endLineNumber,
    isCollapsed: region.isCollapsed,
  };
};

const findSmallestContainingRegion = (
  foldingModel: FoldingModel,
  lineNumber: number,
): FoldingRegion | null => {
  let bestRegion: FoldingRegion | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;
  const regions = foldingModel.regions;

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions.toRegion(index);
    if (!region || lineNumber < region.startLineNumber || lineNumber > region.endLineNumber) {
      continue;
    }

    const span = region.endLineNumber - region.startLineNumber;
    if (
      span < bestSpan ||
      (span === bestSpan &&
        bestRegion !== null &&
        region.startLineNumber >= bestRegion.startLineNumber &&
        region.endLineNumber <= bestRegion.endLineNumber)
    ) {
      bestRegion = region;
      bestSpan = span;
    }
  }

  return bestRegion;
};

export const getVisibleFoldStartLines = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  overscanLines = 0,
): Promise<FoldStart[]> => {
  const foldingModel = await getFoldingModel(editor);
  const visibleWindow = getVisibleLineWindow(editor, overscanLines);
  if (!foldingModel || !visibleWindow) {
    return [];
  }

  return getFoldStartsFromModel(foldingModel).filter(
    ({ lineNumber }) =>
      lineNumber >= visibleWindow.startLineNumber && lineNumber <= visibleWindow.endLineNumber,
  );
};

export const findOwningFoldStartLine = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumber: number,
): number | null => {
  return findSmallestEnclosingFoldRange(editor, lineNumber)?.startLineNumber ?? null;
};

export const findSmallestEnclosingFoldRange = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumber: number,
): FoldRange | null => {
  const foldingModel = getCurrentFoldingModel(editor);
  return toFoldRange(foldingModel ? findSmallestContainingRegion(foldingModel, lineNumber) : null);
};

export const resolveSmallestEnclosingFoldRange = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineNumber: number,
): Promise<FoldRange | null> => {
  const foldingModel = await getFoldingModel(editor);
  return toFoldRange(foldingModel ? findSmallestContainingRegion(foldingModel, lineNumber) : null);
};

export const isFoldStartCollapsed = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  foldStartLineNumber: number,
): boolean | null => {
  const foldingModel = getCurrentFoldingModel(editor);
  if (!foldingModel) {
    return null;
  }

  const region = getFoldRegionAtStartLine(foldingModel, foldStartLineNumber);
  return region?.isCollapsed ?? null;
};

export const toggleFoldStart = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  foldStartLineNumber: number,
): boolean => {
  const foldingModel = getCurrentFoldingModel(editor);
  if (!foldingModel) {
    return false;
  }

  const region = getFoldRegionAtStartLine(foldingModel, foldStartLineNumber);
  if (!region) {
    return false;
  }

  foldingModel.toggleCollapseState([region]);
  return true;
};

export const setCollapseStateInLineRange = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  lineRange: Pick<IRange, 'startLineNumber' | 'endLineNumber'>,
  isCollapsed: boolean,
): Promise<boolean> => {
  const foldingModel = await getFoldingModel(editor);
  if (!foldingModel) {
    return false;
  }

  const targetRegions: FoldingRegion[] = [];
  const regions = foldingModel.regions;
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions.toRegion(index);
    if (
      region.startLineNumber < lineRange.startLineNumber ||
      region.endLineNumber > lineRange.endLineNumber ||
      region.isCollapsed === isCollapsed
    ) {
      continue;
    }

    targetRegions.push(region);
  }

  if (targetRegions.length === 0) {
    return false;
  }

  foldingModel.toggleCollapseState(targetRegions);
  return true;
};

export const setCollapseStateForFoldStart = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  foldStartLineNumber: number,
  isCollapsed: boolean,
): Promise<boolean> => {
  const foldingModel = await getFoldingModel(editor);
  if (!foldingModel) {
    return false;
  }

  const region = getFoldRegionAtStartLine(foldingModel, foldStartLineNumber);
  if (!region || region.isCollapsed === isCollapsed) {
    return false;
  }

  foldingModel.toggleCollapseState([region]);
  return true;
};

export const applyFoldStartChildrenAction = async (
  editor: MonacoEditor.IStandaloneCodeEditor,
  foldStartLineNumber: number,
  action: FoldToggleAction,
): Promise<boolean> => {
  const foldingModel = await getFoldingModel(editor);
  if (!foldingModel) {
    return false;
  }

  const parentRegion = getFoldRegionAtStartLine(foldingModel, foldStartLineNumber);
  if (!parentRegion) {
    return false;
  }

  const shouldCollapse = action === 'collapse';
  const targetRegions = getDirectChildRegions(foldingModel, parentRegion).filter(
    (region) => region.isCollapsed !== shouldCollapse,
  );
  if (targetRegions.length === 0) {
    return false;
  }

  foldingModel.toggleCollapseState(targetRegions);
  return true;
};
