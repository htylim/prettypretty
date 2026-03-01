import type { editor as MonacoEditor } from 'monaco-editor';

type LineRange = {
  startLine: number;
  endLine: number;
};

const isBlankLine = (lineContent: string): boolean => lineContent.trim().length === 0;

const getLeadingIndentWidth = (lineContent: string, tabSize: number): number | null => {
  if (isBlankLine(lineContent)) {
    return null;
  }

  let width = 0;
  for (const char of lineContent) {
    if (char === ' ') {
      width += 1;
      continue;
    }
    if (char === '\t') {
      width += tabSize - (width % tabSize);
      continue;
    }
    break;
  }

  return width;
};

const getModelTabSize = (model: MonacoEditor.ITextModel): number => {
  const maybeTabSize = model.getOptions().tabSize;
  return typeof maybeTabSize === 'number' && maybeTabSize > 0 ? maybeTabSize : 2;
};

const findBlockEndLine = (
  model: MonacoEditor.ITextModel,
  startLine: number,
  startIndentWidth: number,
): number => {
  const tabSize = getModelTabSize(model);
  let endLine = startLine;
  const lineCount = model.getLineCount();

  for (let lineNumber = startLine + 1; lineNumber <= lineCount; lineNumber += 1) {
    const lineContent = model.getLineContent(lineNumber);
    if (isBlankLine(lineContent)) {
      endLine = lineNumber;
      continue;
    }

    const indentWidth = getLeadingIndentWidth(lineContent, tabSize);
    if (indentWidth === null || indentWidth <= startIndentWidth) {
      break;
    }
    endLine = lineNumber;
  }

  return endLine;
};

export const findIndentBlockRange = (
  model: MonacoEditor.ITextModel,
  hoveredLine: number,
): LineRange | null => {
  const lineCount = model.getLineCount();
  if (hoveredLine < 1 || hoveredLine > lineCount) {
    return null;
  }

  const tabSize = getModelTabSize(model);
  const hoveredLineContent = model.getLineContent(hoveredLine);
  const hoveredIndentWidth = getLeadingIndentWidth(hoveredLineContent, tabSize);
  if (hoveredIndentWidth === null) {
    return null;
  }

  const hasChildBlock = (lineNumber: number, lineIndentWidth: number): boolean => {
    for (let nextLine = lineNumber + 1; nextLine <= lineCount; nextLine += 1) {
      const nextLineContent = model.getLineContent(nextLine);
      if (isBlankLine(nextLineContent)) {
        continue;
      }
      const nextIndentWidth = getLeadingIndentWidth(nextLineContent, tabSize);
      return nextIndentWidth !== null && nextIndentWidth > lineIndentWidth;
    }
    return false;
  };

  if (hasChildBlock(hoveredLine, hoveredIndentWidth)) {
    const endLine = findBlockEndLine(model, hoveredLine, hoveredIndentWidth);
    if (endLine > hoveredLine) {
      return { startLine: hoveredLine, endLine };
    }
  }

  for (let lineNumber = hoveredLine - 1; lineNumber >= 1; lineNumber -= 1) {
    const lineContent = model.getLineContent(lineNumber);
    const indentWidth = getLeadingIndentWidth(lineContent, tabSize);
    if (indentWidth === null || indentWidth >= hoveredIndentWidth) {
      continue;
    }
    if (!hasChildBlock(lineNumber, indentWidth)) {
      continue;
    }

    const endLine = findBlockEndLine(model, lineNumber, indentWidth);
    if (endLine >= hoveredLine && endLine > lineNumber) {
      return { startLine: lineNumber, endLine };
    }
  }

  return null;
};

export const registerCmdClickFoldToggle = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): { dispose: () => void } => {
  return editor.onMouseDown((mouseEvent) => {
    const lineNumber = mouseEvent.target.position?.lineNumber;
    const isCmdClick = mouseEvent.event.metaKey && mouseEvent.event.browserEvent.detail === 1;
    if (!lineNumber || !isCmdClick) {
      return;
    }

    const model = editor.getModel();
    if (!model) {
      return;
    }

    const range = findIndentBlockRange(model, lineNumber);
    if (!range) {
      return;
    }

    mouseEvent.event.preventDefault();
    mouseEvent.event.stopPropagation();
    editor.setPosition({ lineNumber: range.startLine, column: 1 });
    void editor.getAction('editor.toggleFold')?.run();
  });
};
