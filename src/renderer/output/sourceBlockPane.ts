import type { editor as MonacoEditor } from 'monaco-editor';
import type { OutputPaneSourceRange } from './outputRange';

type LineContentReader = Pick<MonacoEditor.ITextModel, 'getLineContent'>;

const getLeadingWhitespace = (line: string): string => {
  const match = /^\s*/u.exec(line);
  return match?.[0] ?? '';
};

const getCommonLeadingWhitespace = (lines: readonly string[]): string => {
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return '';
  }

  let prefix = getLeadingWhitespace(nonEmptyLines[0] ?? '');
  for (const line of nonEmptyLines.slice(1)) {
    const whitespace = getLeadingWhitespace(line);
    let nextPrefixLength = 0;
    while (
      nextPrefixLength < prefix.length &&
      nextPrefixLength < whitespace.length &&
      prefix[nextPrefixLength] === whitespace[nextPrefixLength]
    ) {
      nextPrefixLength += 1;
    }
    prefix = prefix.slice(0, nextPrefixLength);
    if (prefix.length === 0) {
      break;
    }
  }

  return prefix;
};

export const getDisplayedLineNumber = (
  localLineNumber: number,
  lineNumberStart: number | null,
): number => {
  return lineNumberStart === null ? localLineNumber : lineNumberStart + localLineNumber - 1;
};

export const extractRebasedSourceBlockText = (
  model: LineContentReader,
  sourceRange: Pick<OutputPaneSourceRange, 'startLineNumber' | 'endLineNumber'>,
): string => {
  const lines: string[] = [];
  for (
    let lineNumber = sourceRange.startLineNumber;
    lineNumber <= sourceRange.endLineNumber;
    lineNumber += 1
  ) {
    lines.push(model.getLineContent(lineNumber));
  }

  const commonLeadingWhitespace = getCommonLeadingWhitespace(lines);
  return lines
    .map((line) =>
      commonLeadingWhitespace.length > 0 && line.startsWith(commonLeadingWhitespace)
        ? line.slice(commonLeadingWhitespace.length)
        : line,
    )
    .join('\n');
};
