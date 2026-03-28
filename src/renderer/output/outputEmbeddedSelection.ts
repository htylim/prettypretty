import type { OutputPaneSourceRange } from '../app/outputPaneDomain';

export type OutputEmbeddedCandidate = {
  sourceRange: OutputPaneSourceRange;
  payload: string;
};

export type OutputEmbeddedSelectionContext =
  | {
      type: 'position';
      lineNumber: number;
      column: number;
    }
  | {
      type: 'range';
      sourceRange: OutputPaneSourceRange;
    };

type OutputEmbeddedCandidateOffsets = {
  startOffset: number;
  endOffset: number;
  payload: string;
};

type SourceSegment = {
  sourceStartOffset: number;
  sourceEndOffset: number;
};

type ParsedQuotedLiteral = {
  decodedValue: string;
  decodedSegments: SourceSegment[];
  endOffset: number;
};

type StructuredBlockStart = {
  character: '{' | '[';
  startOffset: number;
};

type ScanContext = {
  text: string;
  projectRangeToRootOffsets: (
    startOffset: number,
    endOffset: number,
  ) => {
    startOffset: number;
    endOffset: number;
  } | null;
};
const GRAPHQL_OPERATION_PREFIXES = ['query', 'mutation', 'subscription', 'fragment'] as const;

const hasBalancedPairs = (
  value: string,
  openCharacter: '{' | '[',
  closeCharacter: '}' | ']',
): boolean => {
  let depth = 0;
  for (const character of value) {
    if (character === openCharacter) {
      depth += 1;
      continue;
    }

    if (character !== closeCharacter) {
      continue;
    }

    depth -= 1;
    if (depth < 0) {
      return false;
    }
  }

  return depth === 0;
};

const looksLikeStructuredLiteralPayload = (value: string): boolean => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return false;
  }

  if (
    (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) ||
    (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))
  ) {
    return hasBalancedPairs(trimmedValue, '{', '}') || hasBalancedPairs(trimmedValue, '[', ']');
  }

  if (
    GRAPHQL_OPERATION_PREFIXES.some((prefix) => trimmedValue.startsWith(`${prefix} `)) ||
    trimmedValue.startsWith('{')
  ) {
    return hasBalancedPairs(trimmedValue, '{', '}');
  }

  if (trimmedValue.includes('\n')) {
    const nonEmptyLines = trimmedValue
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return nonEmptyLines.length > 1 && nonEmptyLines.every((line) => /^[{[]/u.test(line));
  }

  return false;
};

const decodeSimpleEscape = (escapedCharacter: string): string => {
  switch (escapedCharacter) {
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case 'v':
      return '\v';
    case '\\':
      return '\\';
    case '"':
      return '"';
    case "'":
      return "'";
    case '/':
      return '/';
    case '0':
      return '\0';
    default:
      return escapedCharacter;
  }
};

const parseEscapedCodePoint = (
  text: string,
  startOffset: number,
  prefixLength: number,
  codePointLength: number,
): { decodedCharacter: string; endOffset: number } | null => {
  const codePointStart = startOffset + prefixLength;
  const codePointEnd = codePointStart + codePointLength;
  const codePointText = text.slice(codePointStart, codePointEnd);
  if (!new RegExp(`^[0-9A-Fa-f]{${codePointLength}}$`, 'u').test(codePointText)) {
    return null;
  }

  return {
    decodedCharacter: String.fromCodePoint(Number.parseInt(codePointText, 16)),
    endOffset: codePointEnd,
  };
};

const parseQuotedLiteral = (
  text: string,
  startOffset: number,
  quoteCharacter: '"' | "'",
): ParsedQuotedLiteral | null => {
  let cursor = startOffset + 1;
  let decodedValue = '';
  const decodedSegments: SourceSegment[] = [];

  while (cursor < text.length) {
    const currentCharacter = text[cursor];
    if (currentCharacter === undefined) {
      return null;
    }

    if (currentCharacter === quoteCharacter) {
      return {
        decodedValue,
        decodedSegments,
        endOffset: cursor + 1,
      };
    }

    if (currentCharacter !== '\\') {
      decodedValue += currentCharacter;
      decodedSegments.push({
        sourceStartOffset: cursor,
        sourceEndOffset: cursor + 1,
      });
      cursor += 1;
      continue;
    }

    const escapedCharacter = text[cursor + 1];
    if (escapedCharacter === undefined) {
      return null;
    }

    if (escapedCharacter === 'u') {
      const unicodeEscape = parseEscapedCodePoint(text, cursor, 2, 4);
      if (!unicodeEscape) {
        return null;
      }

      decodedValue += unicodeEscape.decodedCharacter;
      decodedSegments.push({
        sourceStartOffset: cursor,
        sourceEndOffset: unicodeEscape.endOffset,
      });
      cursor = unicodeEscape.endOffset;
      continue;
    }

    if (escapedCharacter === 'x') {
      const hexEscape = parseEscapedCodePoint(text, cursor, 2, 2);
      if (!hexEscape) {
        return null;
      }

      decodedValue += hexEscape.decodedCharacter;
      decodedSegments.push({
        sourceStartOffset: cursor,
        sourceEndOffset: hexEscape.endOffset,
      });
      cursor = hexEscape.endOffset;
      continue;
    }

    decodedValue += decodeSimpleEscape(escapedCharacter);
    decodedSegments.push({
      sourceStartOffset: cursor,
      sourceEndOffset: cursor + 2,
    });
    cursor += 2;
  }

  return null;
};

const decodeEscapedText = (text: string): string | null => {
  let cursor = 0;
  let decodedValue = '';

  while (cursor < text.length) {
    const currentCharacter = text[cursor];
    if (currentCharacter === undefined) {
      return null;
    }

    if (currentCharacter !== '\\') {
      decodedValue += currentCharacter;
      cursor += 1;
      continue;
    }

    const escapedCharacter = text[cursor + 1];
    if (escapedCharacter === undefined) {
      return null;
    }

    if (escapedCharacter === 'u') {
      const unicodeEscape = parseEscapedCodePoint(text, cursor, 2, 4);
      if (!unicodeEscape) {
        return null;
      }

      decodedValue += unicodeEscape.decodedCharacter;
      cursor = unicodeEscape.endOffset;
      continue;
    }

    if (escapedCharacter === 'x') {
      const hexEscape = parseEscapedCodePoint(text, cursor, 2, 2);
      if (!hexEscape) {
        return null;
      }

      decodedValue += hexEscape.decodedCharacter;
      cursor = hexEscape.endOffset;
      continue;
    }

    decodedValue += decodeSimpleEscape(escapedCharacter);
    cursor += 2;
  }

  return decodedValue;
};

const collectStructuredStringCandidates = (
  context: ScanContext,
): OutputEmbeddedCandidateOffsets[] => {
  const candidates: OutputEmbeddedCandidateOffsets[] = [];
  let cursor = 0;

  while (cursor < context.text.length) {
    const currentCharacter = context.text[cursor];
    if (currentCharacter !== '"' && currentCharacter !== "'") {
      cursor += 1;
      continue;
    }

    const parsedLiteral = parseQuotedLiteral(context.text, cursor, currentCharacter);
    if (!parsedLiteral) {
      cursor += 1;
      continue;
    }

    const projectedLiteralRange = context.projectRangeToRootOffsets(
      cursor,
      parsedLiteral.endOffset,
    );
    if (projectedLiteralRange && looksLikeStructuredLiteralPayload(parsedLiteral.decodedValue)) {
      candidates.push({
        startOffset: projectedLiteralRange.startOffset,
        endOffset: projectedLiteralRange.endOffset,
        payload: parsedLiteral.decodedValue,
      });
    }

    if (parsedLiteral.decodedSegments.length > 0) {
      const nestedCandidates = collectStructuredStringCandidates({
        text: parsedLiteral.decodedValue,
        // Nested candidates are discovered in the decoded payload, then projected
        // back to the original source span through the escape-aware segment map.
        projectRangeToRootOffsets: (startOffset, endOffset) => {
          const startSegment = parsedLiteral.decodedSegments[startOffset];
          const endSegment = parsedLiteral.decodedSegments[endOffset - 1];
          if (!startSegment || !endSegment) {
            return null;
          }

          const projectedStartOffset = context.projectRangeToRootOffsets(
            startSegment.sourceStartOffset,
            startSegment.sourceEndOffset,
          );
          const projectedEndOffset = context.projectRangeToRootOffsets(
            endSegment.sourceStartOffset,
            endSegment.sourceEndOffset,
          );
          if (!projectedStartOffset || !projectedEndOffset) {
            return null;
          }

          return {
            startOffset: projectedStartOffset.startOffset,
            endOffset: projectedEndOffset.endOffset,
          };
        },
      });

      candidates.push(...nestedCandidates);
    }

    cursor = parsedLiteral.endOffset;
  }

  return candidates;
};

const getTrimmedDocumentOffsets = (
  text: string,
): {
  startOffset: number;
  endOffset: number;
} | null => {
  const startMatch = text.match(/\S/u);
  if (!startMatch || startMatch.index === undefined) {
    return null;
  }

  const trimmedEndIndex = text.search(/\s*$/u);
  return {
    startOffset: startMatch.index,
    endOffset: trimmedEndIndex === -1 ? text.length : trimmedEndIndex,
  };
};

const isMatchingStructuredBlockEnd = (startCharacter: '{' | '[', endCharacter: string): boolean => {
  return (
    (startCharacter === '{' && endCharacter === '}') ||
    (startCharacter === '[' && endCharacter === ']')
  );
};

const collectStructuredBlockCandidates = (
  context: ScanContext,
): OutputEmbeddedCandidateOffsets[] => {
  const trimmedDocumentOffsets = getTrimmedDocumentOffsets(context.text);
  if (!trimmedDocumentOffsets) {
    return [];
  }

  const candidates: OutputEmbeddedCandidateOffsets[] = [];
  const blockStack: StructuredBlockStart[] = [];
  let inSingleQuotedString = false;
  let inDoubleQuotedString = false;
  let escapeNextCharacter = false;

  for (let cursor = 0; cursor < context.text.length; cursor += 1) {
    const currentCharacter = context.text[cursor];
    if (currentCharacter === undefined) {
      break;
    }

    if (inSingleQuotedString || inDoubleQuotedString) {
      if (escapeNextCharacter) {
        escapeNextCharacter = false;
        continue;
      }

      if (currentCharacter === '\\') {
        escapeNextCharacter = true;
        continue;
      }

      if (inSingleQuotedString && currentCharacter === "'") {
        inSingleQuotedString = false;
        continue;
      }

      if (inDoubleQuotedString && currentCharacter === '"') {
        inDoubleQuotedString = false;
      }
      continue;
    }

    if (currentCharacter === "'") {
      inSingleQuotedString = true;
      continue;
    }

    if (currentCharacter === '"') {
      inDoubleQuotedString = true;
      continue;
    }

    if (currentCharacter === '{' || currentCharacter === '[') {
      blockStack.push({
        character: currentCharacter,
        startOffset: cursor,
      });
      continue;
    }

    if (currentCharacter !== '}' && currentCharacter !== ']') {
      continue;
    }

    const blockStart = blockStack.pop();
    if (!blockStart || !isMatchingStructuredBlockEnd(blockStart.character, currentCharacter)) {
      blockStack.length = 0;
      continue;
    }

    const blockEndOffset = cursor + 1;
    if (
      blockStart.startOffset === trimmedDocumentOffsets.startOffset &&
      blockEndOffset === trimmedDocumentOffsets.endOffset
    ) {
      continue;
    }

    const payload = context.text.slice(blockStart.startOffset, blockEndOffset);
    if (!looksLikeStructuredLiteralPayload(payload)) {
      continue;
    }

    const projectedRange = context.projectRangeToRootOffsets(
      blockStart.startOffset,
      blockEndOffset,
    );
    if (!projectedRange) {
      continue;
    }

    candidates.push({
      startOffset: projectedRange.startOffset,
      endOffset: projectedRange.endOffset,
      payload,
    });
  }

  return candidates;
};

const compareCandidatesBySourceOrder = (
  left: OutputEmbeddedCandidateOffsets,
  right: OutputEmbeddedCandidateOffsets,
): number => {
  if (left.startOffset !== right.startOffset) {
    return left.startOffset - right.startOffset;
  }

  return right.endOffset - left.endOffset;
};

const isOffsetWithinRange = (
  offset: number,
  candidate: Pick<OutputEmbeddedCandidateOffsets, 'startOffset' | 'endOffset'>,
): boolean => {
  return offset >= candidate.startOffset && offset < candidate.endOffset;
};

const doesRangeIntersectCandidate = (
  sourceRange: Pick<OutputEmbeddedCandidateOffsets, 'startOffset' | 'endOffset'>,
  candidate: Pick<OutputEmbeddedCandidateOffsets, 'startOffset' | 'endOffset'>,
): boolean => {
  return (
    sourceRange.startOffset < candidate.endOffset && candidate.startOffset < sourceRange.endOffset
  );
};

const createLineStartOffsets = (text: string): number[] => {
  const lineStartOffsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineStartOffsets.push(index + 1);
    }
  }

  return lineStartOffsets;
};

const clampLineNumber = (lineStartOffsets: number[], lineNumber: number): number => {
  return Math.min(Math.max(lineNumber, 1), lineStartOffsets.length);
};

const getLineText = (text: string, lineStartOffsets: number[], lineNumber: number): string => {
  const lineStartOffset = lineStartOffsets[lineNumber - 1] ?? 0;
  const nextLineStartOffset = lineStartOffsets[lineNumber] ?? text.length;
  const lineText = text.slice(lineStartOffset, nextLineStartOffset);
  return lineText.endsWith('\n') ? lineText.slice(0, -1) : lineText;
};

const getOffsetForPosition = (
  text: string,
  lineStartOffsets: number[],
  lineNumber: number,
  column: number,
): number => {
  const safeLineNumber = clampLineNumber(lineStartOffsets, lineNumber);
  const lineStartOffset = lineStartOffsets[safeLineNumber - 1] ?? 0;
  const lineText = getLineText(text, lineStartOffsets, safeLineNumber);
  const clampedColumn = Math.min(Math.max(column, 1), lineText.length + 1);
  return lineStartOffset + clampedColumn - 1;
};

const getPositionForOffset = (
  text: string,
  lineStartOffsets: number[],
  offset: number,
): { lineNumber: number; column: number } => {
  const clampedOffset = Math.min(Math.max(offset, 0), text.length);
  let low = 0;
  let high = lineStartOffsets.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStartOffset = lineStartOffsets[middle] ?? 0;
    const nextLineStartOffset = lineStartOffsets[middle + 1] ?? text.length + 1;

    if (clampedOffset < lineStartOffset) {
      high = middle - 1;
      continue;
    }

    if (clampedOffset >= nextLineStartOffset) {
      low = middle + 1;
      continue;
    }

    return {
      lineNumber: middle + 1,
      column: clampedOffset - lineStartOffset + 1,
    };
  }

  const lastLineNumber = lineStartOffsets.length;
  const lastLineStartOffset = lineStartOffsets.at(-1) ?? 0;
  return {
    lineNumber: lastLineNumber,
    column: clampedOffset - lastLineStartOffset + 1,
  };
};

const toSourceRange = (
  text: string,
  lineStartOffsets: number[],
  range: Pick<OutputEmbeddedCandidateOffsets, 'startOffset' | 'endOffset'>,
): OutputPaneSourceRange => {
  const startPosition = getPositionForOffset(text, lineStartOffsets, range.startOffset);
  const endPosition = getPositionForOffset(text, lineStartOffsets, range.endOffset);
  return {
    startLineNumber: startPosition.lineNumber,
    startColumn: startPosition.column,
    endLineNumber: endPosition.lineNumber,
    endColumn: endPosition.column,
  };
};

const isRangeWithinViewRange = (
  candidateRange: OutputPaneSourceRange,
  paneViewRange: OutputPaneSourceRange,
): boolean => {
  const startsInside =
    candidateRange.startLineNumber > paneViewRange.startLineNumber ||
    (candidateRange.startLineNumber === paneViewRange.startLineNumber &&
      candidateRange.startColumn >= paneViewRange.startColumn);
  const endsInside =
    candidateRange.endLineNumber < paneViewRange.endLineNumber ||
    (candidateRange.endLineNumber === paneViewRange.endLineNumber &&
      candidateRange.endColumn <= paneViewRange.endColumn);

  return startsInside && endsInside;
};

const filterCandidatesToPaneView = (
  text: string,
  lineStartOffsets: number[],
  candidates: OutputEmbeddedCandidateOffsets[],
  paneViewRange: OutputPaneSourceRange | null,
): OutputEmbeddedCandidateOffsets[] => {
  if (!paneViewRange) {
    return candidates;
  }

  return candidates.filter((candidate) =>
    isRangeWithinViewRange(toSourceRange(text, lineStartOffsets, candidate), paneViewRange),
  );
};

const resolveCandidateForPosition = (
  candidates: OutputEmbeddedCandidateOffsets[],
  targetOffset: number,
): OutputEmbeddedCandidateOffsets | null => {
  const containingCandidates = candidates.filter((candidate) =>
    isOffsetWithinRange(targetOffset, candidate),
  );
  if (containingCandidates.length === 0) {
    return null;
  }

  return containingCandidates.reduce<OutputEmbeddedCandidateOffsets | null>(
    (selected, candidate) => {
      if (!selected) {
        return candidate;
      }

      const selectedLength = selected.endOffset - selected.startOffset;
      const candidateLength = candidate.endOffset - candidate.startOffset;
      if (candidateLength !== selectedLength) {
        return candidateLength > selectedLength ? candidate : selected;
      }

      return candidate.startOffset < selected.startOffset ? candidate : selected;
    },
    null,
  );
};

const resolveCandidateForRange = (
  candidates: OutputEmbeddedCandidateOffsets[],
  targetRange: Pick<OutputEmbeddedCandidateOffsets, 'startOffset' | 'endOffset'>,
): OutputEmbeddedCandidateOffsets | null => {
  return (
    candidates
      .filter((candidate) => doesRangeIntersectCandidate(targetRange, candidate))
      .sort(compareCandidatesBySourceOrder)[0] ?? null
  );
};

/**
 * Resolves one structured embedded payload from plain editor text and maps its
 * source span back to Monaco coordinates without relying on rendered DOM text.
 */
export const resolveOutputEmbeddedSelection = (
  outputText: string,
  selectionContext: OutputEmbeddedSelectionContext,
  paneViewRange: OutputPaneSourceRange | null = null,
): OutputEmbeddedCandidate | null => {
  const lineStartOffsets = createLineStartOffsets(outputText);
  const candidates = filterCandidatesToPaneView(
    outputText,
    lineStartOffsets,
    [
      ...collectStructuredStringCandidates({
        text: outputText,
        projectRangeToRootOffsets: (startOffset, endOffset) => ({
          startOffset,
          endOffset,
        }),
      }),
      ...collectStructuredBlockCandidates({
        text: outputText,
        projectRangeToRootOffsets: (startOffset, endOffset) => ({
          startOffset,
          endOffset,
        }),
      }),
    ].sort(compareCandidatesBySourceOrder),
    paneViewRange,
  );

  const resolvedCandidate =
    selectionContext.type === 'position'
      ? resolveCandidateForPosition(
          candidates,
          getOffsetForPosition(
            outputText,
            lineStartOffsets,
            selectionContext.lineNumber,
            selectionContext.column,
          ),
        )
      : resolveCandidateForRange(candidates, {
          startOffset: getOffsetForPosition(
            outputText,
            lineStartOffsets,
            selectionContext.sourceRange.startLineNumber,
            selectionContext.sourceRange.startColumn,
          ),
          endOffset: getOffsetForPosition(
            outputText,
            lineStartOffsets,
            selectionContext.sourceRange.endLineNumber,
            selectionContext.sourceRange.endColumn,
          ),
        });

  if (!resolvedCandidate) {
    return null;
  }

  return {
    sourceRange: toSourceRange(outputText, lineStartOffsets, resolvedCandidate),
    payload: resolvedCandidate.payload,
  };
};

/**
 * Selection-first prettify operates on the exact Monaco selection, then
 * normalizes common host-literal wrappers so escaped embedded payloads format
 * like standalone content.
 */
export const normalizeOutputEmbeddedSelectionText = (rawText: string): string => {
  const trimmedText = rawText.trim();
  if (!trimmedText) {
    return '';
  }

  const openingCharacter = trimmedText[0];
  const closingCharacter = trimmedText.at(-1);
  if (
    (openingCharacter === '"' || openingCharacter === "'") &&
    closingCharacter === openingCharacter
  ) {
    const parsedLiteral = parseQuotedLiteral(trimmedText, 0, openingCharacter);
    if (parsedLiteral && parsedLiteral.endOffset === trimmedText.length) {
      return parsedLiteral.decodedValue;
    }
  }

  if (trimmedText.includes('\\')) {
    const decodedText = decodeEscapedText(trimmedText);
    if (decodedText && looksLikeStructuredLiteralPayload(decodedText.trim())) {
      return decodedText.trim();
    }
  }

  return trimmedText;
};

export const __internal__ = {
  collectStructuredBlockCandidates,
  collectStructuredStringCandidates,
  createLineStartOffsets,
  decodeEscapedText,
  getOffsetForPosition,
  looksLikeStructuredLiteralPayload,
  normalizeOutputEmbeddedSelectionText,
  parseQuotedLiteral,
  toSourceRange,
};
