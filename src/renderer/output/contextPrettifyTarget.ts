import * as ts from 'typescript';
import type { OutputLanguageId } from './detectOutputLanguage';

type SourcePosition = {
  lineNumber: number;
  column: number;
};

type SourceRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

type OffsetRange = {
  start: number;
  end: number;
};

type BaseNode = {
  range: OffsetRange;
};

type StringNode = BaseNode & {
  kind: 'string';
  rawText: string;
  decodedText: string;
};

type NumberNode = BaseNode & {
  kind: 'number';
};

type BooleanNode = BaseNode & {
  kind: 'boolean';
};

type NullNode = BaseNode & {
  kind: 'null';
};

type ObjectPropertyNode = {
  keyRange: OffsetRange;
  keyText: string;
  value: JsonNode;
};

type ObjectNode = BaseNode & {
  kind: 'object';
  properties: ObjectPropertyNode[];
};

type ArrayNode = BaseNode & {
  kind: 'array';
  items: JsonNode[];
};

type JsonNode = StringNode | NumberNode | BooleanNode | NullNode | ObjectNode | ArrayNode;

type StringTargetNode = BaseNode & {
  kind: 'string';
  decodedText: string;
};

export type ContextPrettifyTarget = {
  label: string | null;
  decodedText: string;
  sourceRange: SourceRange;
  paneDocumentLanguage: OutputLanguageId;
  sourceKind: 'string-scalar';
};

export type ContextPrettifyTargetResolver = (
  documentText: string,
  clickPosition: SourcePosition,
) => ContextPrettifyTarget | null;

type JsonDocumentMode = 'single' | 'sequence';

const isWhitespace = (character: string): boolean => /\s/u.test(character);

const createLineStarts = (text: string): number[] => {
  const lineStarts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      lineStarts.push(index + 1);
    }
  }

  return lineStarts;
};

const offsetToPosition = (offset: number, lineStarts: number[]): SourcePosition => {
  let low = 0;
  let high = lineStarts.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineStart = lineStarts[mid] ?? 0;
    if (lineStart <= offset) {
      best = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  const lineStart = lineStarts[best] ?? 0;
  return {
    lineNumber: best + 1,
    column: offset - lineStart + 1,
  };
};

const toSourceRange = (range: OffsetRange, lineStarts: number[]): SourceRange => {
  const start = offsetToPosition(range.start, lineStarts);
  const end = offsetToPosition(range.end, lineStarts);

  return {
    startLineNumber: start.lineNumber,
    startColumn: start.column,
    endLineNumber: end.lineNumber,
    endColumn: end.column,
  };
};

const positionToOffset = (position: SourcePosition, lineStarts: number[]): number => {
  const lineStart = lineStarts[position.lineNumber - 1];
  if (lineStart === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return lineStart + position.column - 1;
};

const containsOffset = (range: OffsetRange, offset: number): boolean => {
  return offset >= range.start && offset < range.end;
};

const parseJsonString = (rawText: string): string | null => {
  try {
    const parsed = JSON.parse(rawText) as unknown;
    return typeof parsed === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

const createParser = (text: string) => {
  const lineStarts = createLineStarts(text);
  let offset = 0;

  const peek = (): string | null => text[offset] ?? null;

  const advance = (): string | null => {
    const character = text[offset] ?? null;
    if (character === null) {
      return null;
    }

    offset += 1;
    return character;
  };

  const skipWhitespace = (): void => {
    while (offset < text.length && isWhitespace(text[offset] ?? '')) {
      offset += 1;
    }
  };

  const parseStringNode = (): StringNode | null => {
    const start = offset;
    if (peek() !== '"') {
      return null;
    }

    advance();
    let escaped = false;

    while (offset < text.length) {
      const character = advance();
      if (character === null) {
        return null;
      }

      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === '\\') {
        escaped = true;
        continue;
      }

      if (character === '"') {
        const rawText = text.slice(start, offset);
        const decodedText = parseJsonString(rawText);
        if (decodedText === null) {
          return null;
        }

        return {
          kind: 'string',
          range: { start, end: offset },
          rawText,
          decodedText,
        };
      }
    }

    return null;
  };

  const parseNumberNode = (): NumberNode | null => {
    const start = offset;
    const numberPattern = /^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u;
    const match = numberPattern.exec(text.slice(offset));
    if (!match?.[0]) {
      return null;
    }

    offset += match[0].length;
    return {
      kind: 'number',
      range: { start, end: offset },
    };
  };

  const parseLiteralNode = (): BooleanNode | NullNode | null => {
    const start = offset;
    if (text.startsWith('true', offset)) {
      offset += 4;
      return {
        kind: 'boolean',
        range: { start, end: offset },
      };
    }

    if (text.startsWith('false', offset)) {
      offset += 5;
      return {
        kind: 'boolean',
        range: { start, end: offset },
      };
    }

    if (text.startsWith('null', offset)) {
      offset += 4;
      return {
        kind: 'null',
        range: { start, end: offset },
      };
    }

    return null;
  };

  const parseValue = (): JsonNode | null => {
    skipWhitespace();
    const character = peek();

    if (character === '"') {
      return parseStringNode();
    }

    if (character === '{') {
      return parseObject();
    }

    if (character === '[') {
      return parseArray();
    }

    if (character === '-' || (character !== null && /\d/u.test(character))) {
      return parseNumberNode();
    }

    return parseLiteralNode();
  };

  const parseObject = (): ObjectNode | null => {
    const start = offset;
    if (advance() !== '{') {
      return null;
    }

    skipWhitespace();
    const properties: ObjectPropertyNode[] = [];
    if (peek() === '}') {
      advance();
      return {
        kind: 'object',
        range: { start, end: offset },
        properties,
      };
    }

    while (offset < text.length) {
      skipWhitespace();
      const keyNode = parseStringNode();
      if (!keyNode) {
        return null;
      }

      skipWhitespace();
      if (advance() !== ':') {
        return null;
      }

      const value = parseValue();
      if (!value) {
        return null;
      }

      properties.push({
        keyRange: keyNode.range,
        keyText: keyNode.decodedText,
        value,
      });

      skipWhitespace();
      const nextCharacter = peek();
      if (nextCharacter === ',') {
        advance();
        continue;
      }

      if (nextCharacter === '}') {
        advance();
        return {
          kind: 'object',
          range: { start, end: offset },
          properties,
        };
      }

      return null;
    }

    return null;
  };

  const parseArray = (): ArrayNode | null => {
    const start = offset;
    if (advance() !== '[') {
      return null;
    }

    skipWhitespace();
    const items: JsonNode[] = [];
    if (peek() === ']') {
      advance();
      return {
        kind: 'array',
        range: { start, end: offset },
        items,
      };
    }

    while (offset < text.length) {
      const value = parseValue();
      if (!value) {
        return null;
      }

      items.push(value);
      skipWhitespace();
      const nextCharacter = peek();
      if (nextCharacter === ',') {
        advance();
        continue;
      }

      if (nextCharacter === ']') {
        advance();
        return {
          kind: 'array',
          range: { start, end: offset },
          items,
        };
      }

      return null;
    }

    return null;
  };

  const parseDocument = (
    mode: JsonDocumentMode,
  ): { nodes: JsonNode[]; lineStarts: number[] } | null => {
    const nodes: JsonNode[] = [];
    skipWhitespace();

    while (offset < text.length) {
      const value = parseValue();
      if (!value) {
        return null;
      }

      nodes.push(value);
      skipWhitespace();

      if (mode === 'single') {
        break;
      }
    }

    if (mode === 'single') {
      skipWhitespace();
      if (offset !== text.length || nodes.length !== 1) {
        return null;
      }
    }

    return { nodes, lineStarts };
  };

  return {
    parseDocument,
    positionToOffset: (position: SourcePosition) => positionToOffset(position, lineStarts),
    toSourceRange: (range: OffsetRange) => toSourceRange(range, lineStarts),
  };
};

const createStringTarget = (
  node: StringTargetNode,
  label: string | null,
  language: OutputLanguageId,
  toRange: (range: OffsetRange) => SourceRange,
): ContextPrettifyTarget | null => {
  if (node.decodedText.length === 0) {
    return null;
  }

  return {
    label,
    decodedText: node.decodedText,
    sourceRange: toRange(node.range),
    paneDocumentLanguage: language,
    sourceKind: 'string-scalar',
  };
};

const findTargetInNode = (
  node: JsonNode,
  clickedOffset: number,
  language: OutputLanguageId,
  toRange: (range: OffsetRange) => SourceRange,
  inheritedLabel: string | null = null,
): ContextPrettifyTarget | null => {
  if (!containsOffset(node.range, clickedOffset)) {
    return null;
  }

  if (node.kind === 'string') {
    return createStringTarget(node, inheritedLabel, language, toRange);
  }

  if (node.kind === 'object') {
    for (const property of node.properties) {
      if (containsOffset(property.keyRange, clickedOffset)) {
        return property.value.kind === 'string'
          ? createStringTarget(property.value, property.keyText, language, toRange)
          : null;
      }

      const target =
        property.value.kind === 'string'
          ? findTargetInNode(property.value, clickedOffset, language, toRange, property.keyText)
          : findTargetInNode(property.value, clickedOffset, language, toRange);
      if (target) {
        return target;
      }
    }

    return null;
  }

  if (node.kind === 'array') {
    for (const item of node.items) {
      const target = findTargetInNode(item, clickedOffset, language, toRange);
      if (target) {
        return target;
      }
    }
  }

  return null;
};

const resolveJsonTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: OutputLanguageId,
  mode: JsonDocumentMode,
): ContextPrettifyTarget | null => {
  const parser = createParser(documentText);
  const document = parser.parseDocument(mode);
  if (!document) {
    return null;
  }

  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  for (const node of document.nodes) {
    const target = findTargetInNode(node, clickedOffset, language, parser.toSourceRange);
    if (target) {
      return target;
    }
  }

  return null;
};

const resolveNdjsonTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: OutputLanguageId,
): ContextPrettifyTarget | null => {
  const parser = createParser(documentText);
  const document = parser.parseDocument('sequence');
  if (!document || document.nodes.length < 2) {
    return null;
  }

  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  for (const node of document.nodes) {
    const target = findTargetInNode(node, clickedOffset, language, parser.toSourceRange);
    if (target) {
      return target;
    }
  }

  return null;
};

type YamlLine = {
  text: string;
  start: number;
  end: number;
  indent: number;
  trimmedText: string;
};

type YamlStringNode = {
  kind: 'string';
  range: OffsetRange;
  decodedText: string;
};

type YamlNumberNode = {
  kind: 'number';
  range: OffsetRange;
};

type YamlBooleanNode = {
  kind: 'boolean';
  range: OffsetRange;
};

type YamlNullNode = {
  kind: 'null';
  range: OffsetRange;
};

type YamlMappingPropertyNode = {
  keyRange: OffsetRange;
  keyText: string;
  value: YamlNode;
};

type YamlMappingNode = {
  kind: 'mapping';
  range: OffsetRange;
  properties: YamlMappingPropertyNode[];
};

type YamlSequenceNode = {
  kind: 'sequence';
  range: OffsetRange;
  items: YamlNode[];
};

type YamlNode =
  | YamlStringNode
  | YamlNumberNode
  | YamlBooleanNode
  | YamlNullNode
  | YamlMappingNode
  | YamlSequenceNode;

const YAML_SPECIAL_BOOLEAN_LITERALS = new Set([
  'true',
  'false',
  'yes',
  'no',
  'on',
  'off',
  'True',
  'False',
  'Yes',
  'No',
  'On',
  'Off',
  'TRUE',
  'FALSE',
  'YES',
  'NO',
  'ON',
  'OFF',
]);

const YAML_SPECIAL_NULL_LITERALS = new Set(['null', 'Null', 'NULL', '~']);

const YAML_PLAIN_SCALAR_DISALLOWED_START_CHARACTERS = '[]{}&*!|>\'"%@`?,:-';

const createYamlLines = (text: string): YamlLine[] => {
  const lines: YamlLine[] = [];
  let start = 0;

  while (start <= text.length) {
    const rawEnd = text.indexOf('\n', start);
    const end = rawEnd === -1 ? text.length : rawEnd;
    const rawLine = text.slice(start, end).replace(/\r$/u, '');
    const indent = rawLine.match(/^\s*/u)?.[0].length ?? 0;
    lines.push({
      text: rawLine,
      start,
      end,
      indent,
      trimmedText: rawLine.trim(),
    });

    if (rawEnd === -1) {
      break;
    }

    start = rawEnd + 1;
  }

  return lines;
};

const isYamlIgnorableLine = (line: YamlLine): boolean => {
  return line.trimmedText.length === 0 || line.trimmedText.startsWith('#');
};

const findNextYamlContentLineIndex = (lines: YamlLine[], fromIndex: number): number | null => {
  for (let index = fromIndex; index < lines.length; index += 1) {
    if (!isYamlIgnorableLine(lines[index]!)) {
      return index;
    }
  }

  return null;
};

const findYamlMappingSeparatorIndex = (lineText: string): number => {
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let escaped = false;

  for (let index = 0; index < lineText.length; index += 1) {
    const character = lineText[index];
    if (character === undefined) {
      break;
    }

    if (inSingleQuotes) {
      if (character === "'") {
        if (lineText[index + 1] === "'") {
          index += 1;
        } else {
          inSingleQuotes = false;
        }
      }
      continue;
    }

    if (inDoubleQuotes) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === '\\') {
        escaped = true;
        continue;
      }

      if (character === '"') {
        inDoubleQuotes = false;
      }

      continue;
    }

    if (character === "'") {
      inSingleQuotes = true;
      continue;
    }

    if (character === '"') {
      inDoubleQuotes = true;
      continue;
    }

    if (character !== ':') {
      continue;
    }

    const nextCharacter = lineText[index + 1];
    if (nextCharacter === undefined || /\s/u.test(nextCharacter) || nextCharacter === '#') {
      return index;
    }
  }

  return -1;
};

const stripYamlTrailingComment = (text: string): string => {
  const commentIndex = text.search(/\s#/u);
  return commentIndex === -1 ? text.trimEnd() : text.slice(0, commentIndex).trimEnd();
};

const decodeYamlSingleQuotedScalar = (rawText: string): string | null => {
  if (rawText.length < 2 || !rawText.startsWith("'") || !rawText.endsWith("'")) {
    return null;
  }

  let decodedText = '';
  for (let index = 1; index < rawText.length - 1; index += 1) {
    const character = rawText[index];
    if (character === undefined) {
      return null;
    }

    if (character === "'" && rawText[index + 1] === "'") {
      decodedText += "'";
      index += 1;
      continue;
    }

    decodedText += character;
  }

  return decodedText;
};

const decodeYamlDoubleQuotedScalar = (rawText: string): string | null => {
  if (rawText.length < 2 || !rawText.startsWith('"') || !rawText.endsWith('"')) {
    return null;
  }

  let decodedText = '';

  for (let index = 1; index < rawText.length - 1; index += 1) {
    const character = rawText[index];
    if (character === undefined) {
      return null;
    }

    if (character !== '\\') {
      decodedText += character;
      continue;
    }

    const escapeCharacter = rawText[index + 1];
    if (escapeCharacter === undefined) {
      return null;
    }

    index += 1;
    if (escapeCharacter === 'n') {
      decodedText += '\n';
      continue;
    }

    if (escapeCharacter === 'r') {
      decodedText += '\r';
      continue;
    }

    if (escapeCharacter === 't') {
      decodedText += '\t';
      continue;
    }

    if (escapeCharacter === 'b') {
      decodedText += '\b';
      continue;
    }

    if (escapeCharacter === 'f') {
      decodedText += '\f';
      continue;
    }

    if (escapeCharacter === '"') {
      decodedText += '"';
      continue;
    }

    if (escapeCharacter === '\\') {
      decodedText += '\\';
      continue;
    }

    if (escapeCharacter === '/') {
      decodedText += '/';
      continue;
    }

    if (escapeCharacter === 'u') {
      const codePointText = rawText.slice(index + 1, index + 5);
      if (!/^[0-9A-Fa-f]{4}$/u.test(codePointText)) {
        return null;
      }

      decodedText += String.fromCharCode(Number.parseInt(codePointText, 16));
      index += 4;
      continue;
    }

    if (escapeCharacter === 'x') {
      const byteText = rawText.slice(index + 1, index + 3);
      if (!/^[0-9A-Fa-f]{2}$/u.test(byteText)) {
        return null;
      }

      decodedText += String.fromCharCode(Number.parseInt(byteText, 16));
      index += 2;
      continue;
    }

    decodedText += escapeCharacter;
  }

  return decodedText;
};

const decodeYamlTargetLabel = (rawText: string): string | null => {
  if (rawText.startsWith('"')) {
    return decodeYamlDoubleQuotedScalar(rawText);
  }

  if (rawText.startsWith("'")) {
    return decodeYamlSingleQuotedScalar(rawText);
  }

  return rawText.length > 0 ? rawText : null;
};

const YAML_SAFE_PLAIN_STRING_PATTERN = /^[A-Za-z_][A-Za-z0-9 _./-]*$/u;

const isSafeYamlPlainStringText = (text: string): boolean => {
  return YAML_SAFE_PLAIN_STRING_PATTERN.test(text);
};

const getYamlScalarNodeFromPlainText = (
  text: string,
  range: OffsetRange,
): YamlStringNode | YamlNumberNode | YamlBooleanNode | YamlNullNode | null => {
  const strippedText = stripYamlTrailingComment(text).trimEnd();
  if (strippedText.length === 0) {
    return null;
  }

  if (YAML_SPECIAL_NULL_LITERALS.has(strippedText)) {
    return {
      kind: 'null',
      range,
    };
  }

  if (YAML_SPECIAL_BOOLEAN_LITERALS.has(strippedText)) {
    return {
      kind: 'boolean',
      range,
    };
  }

  if (
    /^[-+]?(?:\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\.inf|\.Inf|\.INF|\.nan|\.NaN|\.NAN)$/u.test(
      strippedText,
    )
  ) {
    return {
      kind: 'number',
      range,
    };
  }

  if (
    YAML_PLAIN_SCALAR_DISALLOWED_START_CHARACTERS.includes(strippedText[0] ?? '') ||
    /:(?:\s|$)/u.test(strippedText) ||
    !isSafeYamlPlainStringText(strippedText)
  ) {
    return null;
  }

  return {
    kind: 'string',
    range,
    decodedText: strippedText,
  };
};

const foldYamlBlockScalarText = (segments: string[], style: 'literal' | 'folded'): string => {
  if (style === 'literal') {
    return segments.join('\n');
  }

  let decodedText = '';
  let previousWasLineBreak = true;

  for (const segment of segments) {
    if (segment.length === 0) {
      if (!decodedText.endsWith('\n')) {
        decodedText += '\n';
      }
      previousWasLineBreak = true;
      continue;
    }

    if (decodedText.length > 0 && !previousWasLineBreak) {
      decodedText += ' ';
    }

    decodedText += segment;
    previousWasLineBreak = false;
  }

  return decodedText;
};

const parseYamlBlockScalar = (
  lines: YamlLine[],
  startLineIndex: number,
  parentIndent: number,
  style: 'literal' | 'folded',
): { node: YamlStringNode; nextLineIndex: number } | null => {
  const blockStartLine = lines[startLineIndex];
  if (!blockStartLine) {
    return null;
  }

  let contentIndent: number | null = null;
  const contentSegments: string[] = [];
  let lastConsumedLineIndex = startLineIndex;

  for (let index = startLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      break;
    }

    if (line.trimmedText.length === 0) {
      contentSegments.push('');
      lastConsumedLineIndex = index;
      continue;
    }

    if (line.indent <= parentIndent) {
      break;
    }

    if (contentIndent === null) {
      contentIndent = line.indent;
    }

    if (line.indent < contentIndent) {
      break;
    }

    contentSegments.push(line.text.slice(contentIndent));
    lastConsumedLineIndex = index;
  }

  const blockRange: OffsetRange = {
    start: blockStartLine.start,
    end: (lines[lastConsumedLineIndex] ?? blockStartLine).end,
  };

  return {
    node: {
      kind: 'string',
      range: blockRange,
      decodedText: contentIndent === null ? '' : foldYamlBlockScalarText(contentSegments, style),
    },
    nextLineIndex: lastConsumedLineIndex + 1,
  };
};

const parseYamlScalarFromLine = (
  lines: YamlLine[],
  lineIndex: number,
  valueStartIndex: number,
  parentIndent: number,
): { node: YamlNode; nextLineIndex: number } | null => {
  const line = lines[lineIndex];
  if (!line) {
    return null;
  }

  const rawValueText = line.text.slice(valueStartIndex);
  const trimmedValueText = rawValueText.trimStart();
  const trimmedOffset = rawValueText.length - trimmedValueText.length;
  const valueStartOffset = line.start + valueStartIndex + trimmedOffset;

  if (trimmedValueText.length === 0) {
    return {
      node: {
        kind: 'null',
        range: {
          start: valueStartOffset,
          end: line.end,
        },
      },
      nextLineIndex: lineIndex + 1,
    };
  }

  if (trimmedValueText[0] === '|' || trimmedValueText[0] === '>') {
    const block = parseYamlBlockScalar(
      lines,
      lineIndex,
      parentIndent,
      trimmedValueText[0] === '|' ? 'literal' : 'folded',
    );
    if (!block) {
      return null;
    }

    return {
      node: block.node,
      nextLineIndex: block.nextLineIndex,
    };
  }

  if (trimmedValueText[0] === '"') {
    const closingQuoteIndex = (() => {
      let escaped = false;
      for (let index = 1; index < trimmedValueText.length; index += 1) {
        const character = trimmedValueText[index];
        if (character === undefined) {
          break;
        }

        if (escaped) {
          escaped = false;
          continue;
        }

        if (character === '\\') {
          escaped = true;
          continue;
        }

        if (character === '"') {
          return index;
        }
      }

      return -1;
    })();

    if (closingQuoteIndex === -1) {
      return null;
    }

    const rawText = trimmedValueText.slice(0, closingQuoteIndex + 1);
    const decodedText = decodeYamlDoubleQuotedScalar(rawText);
    if (decodedText === null) {
      return null;
    }

    return {
      node: {
        kind: 'string',
        range: {
          start: valueStartOffset,
          end: valueStartOffset + rawText.length,
        },
        decodedText,
      },
      nextLineIndex: lineIndex + 1,
    };
  }

  if (trimmedValueText[0] === "'") {
    const closingQuoteIndex = (() => {
      for (let index = 1; index < trimmedValueText.length; index += 1) {
        const character = trimmedValueText[index];
        if (character === undefined) {
          break;
        }

        if (character === "'" && trimmedValueText[index + 1] === "'") {
          index += 1;
          continue;
        }

        if (character === "'") {
          return index;
        }
      }

      return -1;
    })();

    if (closingQuoteIndex === -1) {
      return null;
    }

    const rawText = trimmedValueText.slice(0, closingQuoteIndex + 1);
    const decodedText = decodeYamlSingleQuotedScalar(rawText);
    if (decodedText === null) {
      return null;
    }

    return {
      node: {
        kind: 'string',
        range: {
          start: valueStartOffset,
          end: valueStartOffset + rawText.length,
        },
        decodedText,
      },
      nextLineIndex: lineIndex + 1,
    };
  }

  const plainScalar = getYamlScalarNodeFromPlainText(trimmedValueText, {
    start: valueStartOffset,
    end: valueStartOffset + stripYamlTrailingComment(trimmedValueText).trimEnd().length,
  });
  if (plainScalar) {
    return {
      node: plainScalar,
      nextLineIndex: lineIndex + 1,
    };
  }

  return null;
};

const parseYamlNode = (lines: YamlLine[]): { node: YamlNode; nextLineIndex: number } | null => {
  const startLineIndex = findNextYamlContentLineIndex(lines, 0);
  if (startLineIndex === null) {
    return null;
  }

  let lineIndex = startLineIndex;
  const rootIndent = lines[lineIndex]?.indent ?? 0;

  const parseNodeAtCurrentIndent = (): { node: YamlNode; nextLineIndex: number } | null => {
    const currentLine = lines[lineIndex];
    if (!currentLine || currentLine.indent < rootIndent) {
      return null;
    }

    if (currentLine.trimmedText.startsWith('-')) {
      return parseSequenceNode(currentLine.indent);
    }

    if (findYamlMappingSeparatorIndex(currentLine.text.slice(currentLine.indent)) !== -1) {
      return parseMappingNode(currentLine.indent);
    }

    return parseYamlScalarFromLine(lines, lineIndex, currentLine.indent, currentLine.indent);
  };

  const parseSequenceNode = (
    expectedIndent: number,
  ): { node: YamlSequenceNode; nextLineIndex: number } | null => {
    const items: YamlNode[] = [];
    const sequenceStart = lines[lineIndex]?.start ?? 0;
    let sequenceEnd = lines[lineIndex]?.end ?? sequenceStart;

    while (lineIndex < lines.length) {
      const currentLine = lines[lineIndex];
      if (!currentLine || isYamlIgnorableLine(currentLine)) {
        lineIndex += 1;
        continue;
      }

      if (currentLine.indent < expectedIndent) {
        break;
      }

      if (
        currentLine.indent > expectedIndent ||
        !currentLine.text.slice(expectedIndent).startsWith('-')
      ) {
        break;
      }

      const itemStartIndex = expectedIndent + 1;
      const itemContentText = currentLine.text.slice(itemStartIndex).trimStart();
      const itemContentOffset =
        currentLine.start +
        itemStartIndex +
        (currentLine.text.slice(itemStartIndex).length - itemContentText.length);

      lineIndex += 1;

      if (itemContentText.length === 0) {
        const nextContentIndex = findNextYamlContentLineIndex(lines, lineIndex);
        if (nextContentIndex !== null && (lines[nextContentIndex]?.indent ?? 0) > expectedIndent) {
          lineIndex = nextContentIndex;
          const nested = parseNodeAtCurrentIndent();
          if (!nested) {
            return null;
          }

          items.push(nested.node);
          sequenceEnd = Math.max(sequenceEnd, lines[nested.nextLineIndex - 1]?.end ?? sequenceEnd);
          lineIndex = nested.nextLineIndex;
          continue;
        }

        items.push({
          kind: 'null',
          range: {
            start: itemContentOffset,
            end: currentLine.end,
          },
        });
        sequenceEnd = Math.max(sequenceEnd, currentLine.end);
        continue;
      }

      const scalar = parseYamlScalarFromLine(
        lines,
        lineIndex - 1,
        itemContentOffset - currentLine.start,
        expectedIndent,
      );
      if (!scalar) {
        return null;
      }

      items.push(scalar.node);
      sequenceEnd = Math.max(sequenceEnd, lines[scalar.nextLineIndex - 1]?.end ?? sequenceEnd);
      lineIndex = scalar.nextLineIndex;
    }

    if (items.length === 0) {
      return null;
    }

    return {
      node: {
        kind: 'sequence',
        range: {
          start: sequenceStart,
          end: sequenceEnd,
        },
        items,
      },
      nextLineIndex: lineIndex,
    };
  };

  const parseMappingNode = (
    expectedIndent: number,
  ): { node: YamlMappingNode; nextLineIndex: number } | null => {
    const properties: YamlMappingPropertyNode[] = [];
    const mappingStart = lines[lineIndex]?.start ?? 0;
    let mappingEnd = lines[lineIndex]?.end ?? mappingStart;

    while (lineIndex < lines.length) {
      const currentLine = lines[lineIndex];
      if (!currentLine || isYamlIgnorableLine(currentLine)) {
        lineIndex += 1;
        continue;
      }

      if (currentLine.indent < expectedIndent) {
        break;
      }

      if (currentLine.indent > expectedIndent) {
        break;
      }

      const lineText = currentLine.text.slice(expectedIndent);
      const separatorIndex = findYamlMappingSeparatorIndex(lineText);
      if (separatorIndex === -1) {
        break;
      }

      const keyText = lineText.slice(0, separatorIndex).trimEnd();
      if (keyText.length === 0) {
        return null;
      }

      const keyStartOffset =
        currentLine.start + expectedIndent + lineText.slice(0, separatorIndex).search(/\S/u);
      const keyEndOffset =
        currentLine.start +
        expectedIndent +
        lineText.slice(0, separatorIndex).replace(/\s+$/u, '').length;
      const valueStartIndex = expectedIndent + separatorIndex + 1;
      const value = parseYamlScalarFromLine(lines, lineIndex, valueStartIndex, expectedIndent);

      let resolvedValue: YamlNode;
      let nextLineIndex = lineIndex + 1;

      if (value) {
        resolvedValue = value.node;
        nextLineIndex = value.nextLineIndex;
      } else {
        const nextContentIndex = findNextYamlContentLineIndex(lines, lineIndex + 1);
        if (nextContentIndex !== null && (lines[nextContentIndex]?.indent ?? 0) > expectedIndent) {
          lineIndex = nextContentIndex;
          const nested = parseNodeAtCurrentIndent();
          if (!nested) {
            return null;
          }

          resolvedValue = nested.node;
          nextLineIndex = nested.nextLineIndex;
        } else {
          resolvedValue = {
            kind: 'null',
            range: {
              start: currentLine.start + valueStartIndex,
              end: currentLine.end,
            },
          };
        }
      }

      properties.push({
        keyRange: {
          start: keyStartOffset,
          end: keyEndOffset,
        },
        keyText,
        value: resolvedValue,
      });

      mappingEnd = Math.max(mappingEnd, lines[nextLineIndex - 1]?.end ?? mappingEnd);
      lineIndex = nextLineIndex;
    }

    if (properties.length === 0) {
      return null;
    }

    return {
      node: {
        kind: 'mapping',
        range: {
          start: mappingStart,
          end: mappingEnd,
        },
        properties,
      },
      nextLineIndex: lineIndex,
    };
  };

  const parsedRoot = parseNodeAtCurrentIndent();
  if (!parsedRoot) {
    return null;
  }

  lineIndex = parsedRoot.nextLineIndex;
  while (lineIndex < lines.length && isYamlIgnorableLine(lines[lineIndex]!)) {
    lineIndex += 1;
  }

  if (lineIndex < lines.length) {
    return null;
  }

  return parsedRoot;
};

const findYamlTargetInNode = (
  node: YamlNode,
  clickedOffset: number,
  language: OutputLanguageId,
  toRange: (range: OffsetRange) => SourceRange,
  inheritedLabel: string | null = null,
): ContextPrettifyTarget | null => {
  if (!containsOffset(node.range, clickedOffset)) {
    return null;
  }

  if (node.kind === 'string') {
    return createStringTarget(node, inheritedLabel, language, toRange);
  }

  if (node.kind === 'mapping') {
    for (const property of node.properties) {
      if (containsOffset(property.keyRange, clickedOffset)) {
        return property.value.kind === 'string'
          ? createStringTarget(
              property.value,
              decodeYamlTargetLabel(property.keyText),
              language,
              toRange,
            )
          : null;
      }

      const target =
        property.value.kind === 'string'
          ? findYamlTargetInNode(
              property.value,
              clickedOffset,
              language,
              toRange,
              decodeYamlTargetLabel(property.keyText),
            )
          : findYamlTargetInNode(property.value, clickedOffset, language, toRange);
      if (target) {
        return target;
      }
    }

    return null;
  }

  if (node.kind === 'sequence') {
    for (const item of node.items) {
      const target = findYamlTargetInNode(item, clickedOffset, language, toRange);
      if (target) {
        return target;
      }
    }
  }

  return null;
};

const resolveYamlTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: OutputLanguageId,
): ContextPrettifyTarget | null => {
  const lines = createYamlLines(documentText);
  const parser = createParser(documentText);
  const parsedRoot = parseYamlNode(lines);
  if (!parsedRoot) {
    return null;
  }

  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  const target = findYamlTargetInNode(
    parsedRoot.node,
    clickedOffset,
    language,
    parser.toSourceRange,
  );
  return target;
};

const toTsOffsetRange = (node: ts.Node, sourceFile: ts.SourceFile): OffsetRange => {
  return {
    start: node.getStart(sourceFile),
    end: node.getEnd(),
  };
};

const isSupportedJsTsStringNode = (
  node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral => {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
};

const isNamedJsTsValueDeclaration = (
  node: ts.Node,
): node is ts.PropertyAssignment | ts.VariableDeclaration | ts.PropertyDeclaration => {
  return (
    ts.isPropertyAssignment(node) ||
    ts.isVariableDeclaration(node) ||
    ts.isPropertyDeclaration(node)
  );
};

const getJsTsStringTargetNode = (
  node: ts.Node,
  sourceFile: ts.SourceFile,
): StringTargetNode | null => {
  if (!isSupportedJsTsStringNode(node)) {
    return null;
  }

  return {
    kind: 'string',
    range: toTsOffsetRange(node, sourceFile),
    decodedText: node.text,
  };
};

const getJsTsNameInfo = (
  name: ts.DeclarationName | ts.PropertyName,
  sourceFile: ts.SourceFile,
): {
  label: string;
  range: OffsetRange;
} | null => {
  if (ts.isIdentifier(name)) {
    return {
      label: name.text,
      range: toTsOffsetRange(name, sourceFile),
    };
  }

  if (
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return {
      label: name.text,
      range: toTsOffsetRange(name, sourceFile),
    };
  }

  if (ts.isPrivateIdentifier(name)) {
    return {
      label: name.text.slice(1),
      range: toTsOffsetRange(name, sourceFile),
    };
  }

  return null;
};

const findJsTsTargetInNode = (
  node: ts.Node,
  clickedOffset: number,
  language: Extract<OutputLanguageId, 'javascript' | 'typescript'>,
  toRange: (range: OffsetRange) => SourceRange,
  sourceFile: ts.SourceFile,
  inheritedLabel: string | null = null,
): ContextPrettifyTarget | null => {
  const nodeRange = toTsOffsetRange(node, sourceFile);
  if (!containsOffset(nodeRange, clickedOffset)) {
    return null;
  }

  if (ts.isTemplateExpression(node)) {
    return null;
  }

  const stringTargetNode = getJsTsStringTargetNode(node, sourceFile);
  if (stringTargetNode) {
    return createStringTarget(stringTargetNode, inheritedLabel, language, toRange);
  }

  if (isNamedJsTsValueDeclaration(node) && node.initializer) {
    const nameInfo = getJsTsNameInfo(node.name, sourceFile);
    if (nameInfo && containsOffset(nameInfo.range, clickedOffset)) {
      const namedTargetNode = getJsTsStringTargetNode(node.initializer, sourceFile);
      return namedTargetNode
        ? createStringTarget(namedTargetNode, nameInfo.label, language, toRange)
        : null;
    }

    const nestedTarget = findJsTsTargetInNode(
      node.initializer,
      clickedOffset,
      language,
      toRange,
      sourceFile,
      nameInfo?.label ?? inheritedLabel,
    );
    if (nestedTarget) {
      return nestedTarget;
    }
  }

  if (
    ts.isShorthandPropertyAssignment(node) &&
    containsOffset(toTsOffsetRange(node.name, sourceFile), clickedOffset)
  ) {
    return null;
  }

  for (const child of node.getChildren(sourceFile)) {
    const target = findJsTsTargetInNode(
      child,
      clickedOffset,
      language,
      toRange,
      sourceFile,
      inheritedLabel,
    );
    if (target) {
      return target;
    }
  }

  return null;
};

const resolveJavaScriptLikeTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: Extract<OutputLanguageId, 'javascript' | 'typescript'>,
  scriptKind: ts.ScriptKind,
): ContextPrettifyTarget | null => {
  const parser = createParser(documentText);
  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  const sourceFile = ts.createSourceFile(
    language === 'javascript' ? 'context-target.js' : 'context-target.ts',
    documentText,
    ts.ScriptTarget.Latest,
    false,
    scriptKind,
  );
  const diagnostics =
    (
      sourceFile as ts.SourceFile & {
        parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
      }
    ).parseDiagnostics ?? [];
  if (diagnostics.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)) {
    return null;
  }

  return findJsTsTargetInNode(
    sourceFile,
    clickedOffset,
    language,
    parser.toSourceRange,
    sourceFile,
  );
};

type GraphqlToken =
  | {
      kind: 'name' | 'number' | 'punct';
      text: string;
      range: OffsetRange;
    }
  | {
      kind: 'string';
      decodedText: string;
      range: OffsetRange;
    };

type GraphqlStringCandidate = {
  node: StringTargetNode;
  label: string | null;
  keyRange: OffsetRange | null;
};

const decodeGraphqlQuotedString = (rawText: string): string | null => {
  if (rawText.length < 2 || !rawText.startsWith('"') || !rawText.endsWith('"')) {
    return null;
  }

  let decodedText = '';

  for (let index = 1; index < rawText.length - 1; index += 1) {
    const character = rawText[index];
    if (character === undefined) {
      return null;
    }

    if (character !== '\\') {
      decodedText += character;
      continue;
    }

    const escapeCharacter = rawText[index + 1];
    if (escapeCharacter === undefined) {
      return null;
    }

    index += 1;
    if (escapeCharacter === '"') {
      decodedText += '"';
      continue;
    }

    if (escapeCharacter === '\\') {
      decodedText += '\\';
      continue;
    }

    if (escapeCharacter === '/') {
      decodedText += '/';
      continue;
    }

    if (escapeCharacter === 'b') {
      decodedText += '\b';
      continue;
    }

    if (escapeCharacter === 'f') {
      decodedText += '\f';
      continue;
    }

    if (escapeCharacter === 'n') {
      decodedText += '\n';
      continue;
    }

    if (escapeCharacter === 'r') {
      decodedText += '\r';
      continue;
    }

    if (escapeCharacter === 't') {
      decodedText += '\t';
      continue;
    }

    if (escapeCharacter === 'u') {
      const codePointText = rawText.slice(index + 1, index + 5);
      if (!/^[0-9A-Fa-f]{4}$/u.test(codePointText)) {
        return null;
      }

      decodedText += String.fromCharCode(Number.parseInt(codePointText, 16));
      index += 4;
      continue;
    }

    return null;
  }

  return decodedText;
};

const dedentGraphqlBlockString = (rawValueText: string): string => {
  const normalizedText = rawValueText.replace(/\r\n?/gu, '\n').replace(/\\"""/gu, '"""');
  const lines = normalizedText.split('\n');
  let commonIndent = Number.POSITIVE_INFINITY;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || line.trim().length === 0) {
      continue;
    }

    const indent = line.match(/^[ \t]*/u)?.[0].length ?? 0;
    commonIndent = Math.min(commonIndent, indent);
  }

  if (commonIndent !== Number.POSITIVE_INFINITY && commonIndent > 0) {
    for (let index = 1; index < lines.length; index += 1) {
      lines[index] = lines[index]?.slice(commonIndent) ?? '';
    }
  }

  while (lines[0]?.trim().length === 0) {
    lines.shift();
  }

  while (lines.at(-1)?.trim().length === 0) {
    lines.pop();
  }

  return lines.join('\n');
};

const decodeGraphqlBlockString = (rawText: string): string | null => {
  if (!rawText.startsWith('"""') || !rawText.endsWith('"""') || rawText.length < 6) {
    return null;
  }

  return dedentGraphqlBlockString(rawText.slice(3, -3));
};

const tokenizeGraphqlDocument = (text: string): GraphqlToken[] | null => {
  const tokens: GraphqlToken[] = [];
  let offset = 0;

  while (offset < text.length) {
    const character = text[offset];
    if (character === undefined) {
      break;
    }

    if (/\s|,/u.test(character)) {
      offset += 1;
      continue;
    }

    if (character === '#') {
      while (offset < text.length && text[offset] !== '\n') {
        offset += 1;
      }
      continue;
    }

    if (text.startsWith('...', offset)) {
      tokens.push({
        kind: 'punct',
        text: '...',
        range: {
          start: offset,
          end: offset + 3,
        },
      });
      offset += 3;
      continue;
    }

    if (text.startsWith('"""', offset)) {
      let endOffset = offset + 3;
      while (endOffset < text.length) {
        if (text.startsWith('"""', endOffset) && text[endOffset - 1] !== '\\') {
          const rawText = text.slice(offset, endOffset + 3);
          const decodedText = decodeGraphqlBlockString(rawText);
          if (decodedText === null) {
            return null;
          }

          tokens.push({
            kind: 'string',
            decodedText,
            range: {
              start: offset,
              end: endOffset + 3,
            },
          });
          offset = endOffset + 3;
          break;
        }

        endOffset += 1;
      }

      if (offset !== endOffset + 3) {
        return null;
      }

      continue;
    }

    if (character === '"') {
      let endOffset = offset + 1;
      let escaped = false;

      while (endOffset < text.length) {
        const currentCharacter = text[endOffset];
        if (currentCharacter === undefined) {
          break;
        }

        if (escaped) {
          escaped = false;
          endOffset += 1;
          continue;
        }

        if (currentCharacter === '\\') {
          escaped = true;
          endOffset += 1;
          continue;
        }

        if (currentCharacter === '"') {
          const rawText = text.slice(offset, endOffset + 1);
          const decodedText = decodeGraphqlQuotedString(rawText);
          if (decodedText === null) {
            return null;
          }

          tokens.push({
            kind: 'string',
            decodedText,
            range: {
              start: offset,
              end: endOffset + 1,
            },
          });
          offset = endOffset + 1;
          break;
        }

        endOffset += 1;
      }

      if (offset !== endOffset + 1) {
        return null;
      }

      continue;
    }

    if ('!$&():=@[]{}|'.includes(character)) {
      tokens.push({
        kind: 'punct',
        text: character,
        range: {
          start: offset,
          end: offset + 1,
        },
      });
      offset += 1;
      continue;
    }

    if (/[A-Za-z_]/u.test(character)) {
      let endOffset = offset + 1;
      while (endOffset < text.length && /[A-Za-z0-9_]/u.test(text[endOffset] ?? '')) {
        endOffset += 1;
      }

      tokens.push({
        kind: 'name',
        text: text.slice(offset, endOffset),
        range: {
          start: offset,
          end: endOffset,
        },
      });
      offset = endOffset;
      continue;
    }

    if (character === '-' || /\d/u.test(character)) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(offset));
      if (match?.[0]) {
        tokens.push({
          kind: 'number',
          text: match[0],
          range: {
            start: offset,
            end: offset + match[0].length,
          },
        });
        offset += match[0].length;
        continue;
      }
    }

    offset += 1;
  }

  return tokens;
};

const createGraphqlStringCandidate = (
  token: Extract<GraphqlToken, { kind: 'string' }>,
  label: string | null,
  keyRange: OffsetRange | null,
): GraphqlStringCandidate => {
  return {
    node: {
      kind: 'string',
      range: token.range,
      decodedText: token.decodedText,
    },
    label,
    keyRange,
  };
};

const getMatchingGraphqlPunctuation = (punctuation: string): string | null => {
  if (punctuation === '(') {
    return ')';
  }

  if (punctuation === '[') {
    return ']';
  }

  if (punctuation === '{') {
    return '}';
  }

  return null;
};

const scanGraphqlValue = (
  tokens: GraphqlToken[],
  startIndex: number,
  label: string | null,
  keyRange: OffsetRange | null,
): {
  candidates: GraphqlStringCandidate[];
  nextIndex: number;
  isClosed: boolean;
} => {
  const token = tokens[startIndex];
  if (!token) {
    return {
      candidates: [],
      nextIndex: startIndex,
      isClosed: false,
    };
  }

  if (token.kind === 'string') {
    return {
      candidates: [createGraphqlStringCandidate(token, label, keyRange)],
      nextIndex: startIndex + 1,
      isClosed: true,
    };
  }

  if (token.kind === 'punct') {
    const matchingPunctuation = getMatchingGraphqlPunctuation(token.text);
    if (matchingPunctuation) {
      const nestedResult = scanGraphqlTokens(tokens, startIndex + 1, matchingPunctuation);
      return {
        candidates: nestedResult.isClosed ? nestedResult.candidates : [],
        nextIndex: nestedResult.nextIndex,
        isClosed: nestedResult.isClosed,
      };
    }
  }

  return {
    candidates: [],
    nextIndex: startIndex + 1,
    isClosed: true,
  };
};

const scanGraphqlTokens = (
  tokens: GraphqlToken[],
  startIndex = 0,
  endPunctuation?: string,
): {
  candidates: GraphqlStringCandidate[];
  nextIndex: number;
  isClosed: boolean;
} => {
  const candidates: GraphqlStringCandidate[] = [];
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) {
      break;
    }

    if (token.kind === 'punct' && token.text === endPunctuation) {
      return {
        candidates,
        nextIndex: index + 1,
        isClosed: true,
      };
    }

    if (token.kind === 'name') {
      const nextToken = tokens[index + 1];
      if (nextToken?.kind === 'punct' && (nextToken.text === ':' || nextToken.text === '=')) {
        const valueResult = scanGraphqlValue(tokens, index + 2, token.text, token.range);
        if (!valueResult.isClosed) {
          return {
            candidates: [],
            nextIndex: valueResult.nextIndex,
            isClosed: false,
          };
        }
        candidates.push(...valueResult.candidates);
        index = valueResult.nextIndex;
        continue;
      }
    }

    if (token.kind === 'string') {
      candidates.push(createGraphqlStringCandidate(token, null, null));
      index += 1;
      continue;
    }

    if (token.kind === 'punct') {
      const matchingPunctuation = getMatchingGraphqlPunctuation(token.text);
      if (matchingPunctuation) {
        const nestedResult = scanGraphqlTokens(tokens, index + 1, matchingPunctuation);
        if (!nestedResult.isClosed) {
          return {
            candidates: [],
            nextIndex: nestedResult.nextIndex,
            isClosed: false,
          };
        }
        candidates.push(...nestedResult.candidates);
        index = nestedResult.nextIndex;
        continue;
      }
    }

    index += 1;
  }

  return {
    candidates,
    nextIndex: index,
    isClosed: endPunctuation === undefined,
  };
};

const selectGraphqlCandidate = (
  candidates: GraphqlStringCandidate[],
  clickedOffset: number,
): GraphqlStringCandidate | null => {
  let selectedCandidate: GraphqlStringCandidate | null = null;
  let selectedSpan = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const isKeyMatch = candidate.keyRange
      ? containsOffset(candidate.keyRange, clickedOffset)
      : false;
    const isValueMatch = containsOffset(candidate.node.range, clickedOffset);
    if (!isKeyMatch && !isValueMatch) {
      continue;
    }

    const span =
      (candidate.keyRange?.end ?? candidate.node.range.end) -
      (candidate.keyRange?.start ?? candidate.node.range.start);
    if (span >= selectedSpan) {
      continue;
    }

    selectedCandidate = candidate;
    selectedSpan = span;
  }

  return selectedCandidate;
};

const resolveGraphqlTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: OutputLanguageId,
): ContextPrettifyTarget | null => {
  const parser = createParser(documentText);
  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  const tokens = tokenizeGraphqlDocument(documentText);
  if (!tokens) {
    return null;
  }

  const scanResult = scanGraphqlTokens(tokens);
  if (!scanResult.isClosed) {
    return null;
  }

  const candidates = scanResult.candidates;
  const candidate = selectGraphqlCandidate(candidates, clickedOffset);
  if (!candidate) {
    return null;
  }

  return createStringTarget(candidate.node, candidate.label, language, parser.toSourceRange);
};

type XmlStringCandidate = {
  node: StringTargetNode;
  label: string | null;
  keyRange: OffsetRange | null;
};

type XmlElementFrame = {
  name: string;
  nameRange: OffsetRange;
  hasElementChild: boolean;
  textCandidates: StringTargetNode[];
};

type SqlToken =
  | {
      kind: 'identifier';
      text: string;
      range: OffsetRange;
    }
  | {
      kind: 'string';
      decodedText: string;
      range: OffsetRange;
    }
  | {
      kind: 'operator' | 'punct';
      text: string;
      range: OffsetRange;
    };

type SqlStringCandidate = {
  node: StringTargetNode;
  label: string | null;
  keyRange: OffsetRange | null;
};

const decodeXmlEntity = (entityText: string): string | null => {
  switch (entityText) {
    case 'amp':
      return '&';
    case 'lt':
      return '<';
    case 'gt':
      return '>';
    case 'quot':
      return '"';
    case 'apos':
      return "'";
    default:
      break;
  }

  if (entityText.startsWith('#x') || entityText.startsWith('#X')) {
    const codePointText = entityText.slice(2);
    if (!/^[0-9A-Fa-f]+$/u.test(codePointText)) {
      return null;
    }

    const codePoint = Number.parseInt(codePointText, 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : null;
  }

  if (entityText.startsWith('#')) {
    const codePointText = entityText.slice(1);
    if (!/^\d+$/u.test(codePointText)) {
      return null;
    }

    const codePoint = Number.parseInt(codePointText, 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : null;
  }

  return null;
};

const decodeXmlEntities = (rawText: string): string | null => {
  let decodedText = '';
  let offset = 0;

  while (offset < rawText.length) {
    const entityStart = rawText.indexOf('&', offset);
    if (entityStart === -1) {
      decodedText += rawText.slice(offset);
      break;
    }

    decodedText += rawText.slice(offset, entityStart);
    const entityEnd = rawText.indexOf(';', entityStart + 1);
    if (entityEnd === -1) {
      return null;
    }

    const entity = decodeXmlEntity(rawText.slice(entityStart + 1, entityEnd));
    if (entity === null) {
      return null;
    }

    decodedText += entity;
    offset = entityEnd + 1;
  }

  return decodedText;
};

const isXmlNameStartCharacter = (character: string): boolean => {
  return /[A-Za-z_:]/u.test(character);
};

const isXmlNamePartCharacter = (character: string): boolean => {
  return /[A-Za-z0-9_.:-]/u.test(character);
};

const skipXmlWhitespace = (text: string, offset: number): number => {
  let nextOffset = offset;
  while (nextOffset < text.length && /\s/u.test(text[nextOffset] ?? '')) {
    nextOffset += 1;
  }
  return nextOffset;
};

const scanXmlName = (
  text: string,
  startOffset: number,
): { name: string; range: OffsetRange; nextOffset: number } | null => {
  const startCharacter = text[startOffset];
  if (!startCharacter || !isXmlNameStartCharacter(startCharacter)) {
    return null;
  }

  let endOffset = startOffset + 1;
  while (endOffset < text.length && isXmlNamePartCharacter(text[endOffset] ?? '')) {
    endOffset += 1;
  }

  return {
    name: text.slice(startOffset, endOffset),
    range: {
      start: startOffset,
      end: endOffset,
    },
    nextOffset: endOffset,
  };
};

const selectXmlCandidate = (
  candidates: XmlStringCandidate[],
  clickedOffset: number,
): XmlStringCandidate | null => {
  let selectedCandidate: XmlStringCandidate | null = null;
  let selectedSpan = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const isKeyMatch = candidate.keyRange
      ? containsOffset(candidate.keyRange, clickedOffset)
      : false;
    const isValueMatch = containsOffset(candidate.node.range, clickedOffset);
    if (!isKeyMatch && !isValueMatch) {
      continue;
    }

    const span =
      (candidate.keyRange?.end ?? candidate.node.range.end) -
      (candidate.keyRange?.start ?? candidate.node.range.start);
    if (span >= selectedSpan) {
      continue;
    }

    selectedCandidate = candidate;
    selectedSpan = span;
  }

  return selectedCandidate;
};

const trimXmlPayloadText = (decodedText: string): string => {
  return decodedText.trim();
};

const decodeSqlStringLiteral = (rawText: string): string | null => {
  if (rawText.length < 2 || rawText[0] !== "'" || rawText.at(-1) !== "'") {
    return null;
  }

  let decodedText = '';
  for (let index = 1; index < rawText.length - 1; index += 1) {
    const character = rawText[index];
    if (character === undefined) {
      return null;
    }

    if (character === "'") {
      if (rawText[index + 1] !== "'") {
        return null;
      }

      decodedText += "'";
      index += 1;
      continue;
    }

    decodedText += character;
  }

  return decodedText;
};

const decodeSqlQuotedIdentifier = (rawText: string): string | null => {
  if (rawText.length < 2 || rawText[0] !== '"' || rawText.at(-1) !== '"') {
    return null;
  }

  let decodedText = '';
  for (let index = 1; index < rawText.length - 1; index += 1) {
    const character = rawText[index];
    if (character === undefined) {
      return null;
    }

    if (character === '"') {
      if (rawText[index + 1] !== '"') {
        return null;
      }

      decodedText += '"';
      index += 1;
      continue;
    }

    decodedText += character;
  }

  return decodedText;
};

const tokenizeSqlDocument = (documentText: string): SqlToken[] | null => {
  const tokens: SqlToken[] = [];
  let offset = 0;

  while (offset < documentText.length) {
    const character = documentText[offset];
    if (character === undefined) {
      break;
    }

    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }

    if (documentText.startsWith('--', offset)) {
      const lineEnd = documentText.indexOf('\n', offset + 2);
      offset = lineEnd === -1 ? documentText.length : lineEnd + 1;
      continue;
    }

    if (documentText.startsWith('/*', offset)) {
      const commentEnd = documentText.indexOf('*/', offset + 2);
      if (commentEnd === -1) {
        return null;
      }

      offset = commentEnd + 2;
      continue;
    }

    if (character === "'") {
      let endOffset = offset + 1;
      while (endOffset < documentText.length) {
        const currentCharacter = documentText[endOffset];
        if (currentCharacter === undefined) {
          break;
        }

        if (currentCharacter === "'") {
          if (documentText[endOffset + 1] === "'") {
            endOffset += 2;
            continue;
          }

          const rawText = documentText.slice(offset, endOffset + 1);
          const decodedText = decodeSqlStringLiteral(rawText);
          if (decodedText === null) {
            return null;
          }

          tokens.push({
            kind: 'string',
            decodedText,
            range: {
              start: offset,
              end: endOffset + 1,
            },
          });
          offset = endOffset + 1;
          break;
        }

        endOffset += 1;
      }

      if (offset !== endOffset + 1) {
        return null;
      }

      continue;
    }

    if (character === '"') {
      let endOffset = offset + 1;
      while (endOffset < documentText.length) {
        const currentCharacter = documentText[endOffset];
        if (currentCharacter === undefined) {
          break;
        }

        if (currentCharacter === '"') {
          if (documentText[endOffset + 1] === '"') {
            endOffset += 2;
            continue;
          }

          const rawText = documentText.slice(offset, endOffset + 1);
          const decodedText = decodeSqlQuotedIdentifier(rawText);
          if (decodedText === null) {
            return null;
          }

          tokens.push({
            kind: 'identifier',
            text: decodedText,
            range: {
              start: offset,
              end: endOffset + 1,
            },
          });
          offset = endOffset + 1;
          break;
        }

        endOffset += 1;
      }

      if (offset !== endOffset + 1) {
        return null;
      }

      continue;
    }

    if (/[A-Za-z_]/u.test(character)) {
      let endOffset = offset + 1;
      while (
        endOffset < documentText.length &&
        /[A-Za-z0-9_$]/u.test(documentText[endOffset] ?? '')
      ) {
        endOffset += 1;
      }

      tokens.push({
        kind: 'identifier',
        text: documentText.slice(offset, endOffset),
        range: {
          start: offset,
          end: endOffset,
        },
      });
      offset = endOffset;
      continue;
    }

    if (character === '=') {
      tokens.push({
        kind: 'operator',
        text: '=',
        range: {
          start: offset,
          end: offset + 1,
        },
      });
      offset += 1;
      continue;
    }

    if ('.(),;'.includes(character)) {
      tokens.push({
        kind: 'punct',
        text: character,
        range: {
          start: offset,
          end: offset + 1,
        },
      });
      offset += 1;
      continue;
    }

    offset += 1;
  }

  return tokens;
};

const getSqlNameInfo = (
  tokens: SqlToken[],
  endIndex: number,
): { label: string; range: OffsetRange } | null => {
  const lastToken = tokens[endIndex];
  if (!lastToken || lastToken.kind !== 'identifier') {
    return null;
  }

  const segments = [lastToken.text];
  let start = lastToken.range.start;
  let index = endIndex;

  while (index >= 2) {
    const dotToken = tokens[index - 1];
    const previousIdentifier = tokens[index - 2];
    if (
      dotToken?.kind !== 'punct' ||
      dotToken.text !== '.' ||
      previousIdentifier?.kind !== 'identifier'
    ) {
      break;
    }

    segments.unshift(previousIdentifier.text);
    start = previousIdentifier.range.start;
    index -= 2;
  }

  return {
    label: segments.join('.'),
    range: {
      start,
      end: lastToken.range.end,
    },
  };
};

const createSqlStringCandidate = (
  token: Extract<SqlToken, { kind: 'string' }>,
  label: string | null,
  keyRange: OffsetRange | null,
): SqlStringCandidate => {
  return {
    node: {
      kind: 'string',
      range: token.range,
      decodedText: token.decodedText,
    },
    label,
    keyRange,
  };
};

const buildSqlCandidates = (tokens: SqlToken[]): SqlStringCandidate[] => {
  const candidates: SqlStringCandidate[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token || token.kind !== 'string') {
      continue;
    }

    let label: string | null = null;
    let keyRange: OffsetRange | null = null;
    const previousToken = tokens[index - 1];

    if (previousToken?.kind === 'operator' && previousToken.text === '=') {
      const nameInfo = getSqlNameInfo(tokens, index - 2);
      if (nameInfo) {
        label = nameInfo.label;
        keyRange = nameInfo.range;
      }
    } else if (
      previousToken?.kind === 'identifier' &&
      /^(like|ilike)$/iu.test(previousToken.text)
    ) {
      const nameInfo = getSqlNameInfo(tokens, index - 2);
      if (nameInfo) {
        label = nameInfo.label;
        keyRange = nameInfo.range;
      }
    }

    candidates.push(createSqlStringCandidate(token, label, keyRange));
  }

  return candidates;
};

const selectSqlCandidate = (
  candidates: SqlStringCandidate[],
  clickedOffset: number,
): SqlStringCandidate | null => {
  let selectedCandidate: SqlStringCandidate | null = null;
  let selectedSpan = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const isKeyMatch = candidate.keyRange
      ? containsOffset(candidate.keyRange, clickedOffset)
      : false;
    const isValueMatch = containsOffset(candidate.node.range, clickedOffset);
    if (!isKeyMatch && !isValueMatch) {
      continue;
    }

    const span =
      (candidate.keyRange?.end ?? candidate.node.range.end) -
      (candidate.keyRange?.start ?? candidate.node.range.start);
    if (span >= selectedSpan) {
      continue;
    }

    selectedCandidate = candidate;
    selectedSpan = span;
  }

  return selectedCandidate;
};

const resolveSqlTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: OutputLanguageId,
): ContextPrettifyTarget | null => {
  const parser = createParser(documentText);
  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  const tokens = tokenizeSqlDocument(documentText);
  if (!tokens) {
    return null;
  }

  const candidate = selectSqlCandidate(buildSqlCandidates(tokens), clickedOffset);
  if (!candidate) {
    return null;
  }

  return createStringTarget(candidate.node, candidate.label, language, parser.toSourceRange);
};

const resolveXmlTarget = (
  documentText: string,
  clickPosition: SourcePosition,
  language: OutputLanguageId,
): ContextPrettifyTarget | null => {
  const parser = createParser(documentText);
  const clickedOffset = parser.positionToOffset(clickPosition);
  if (!Number.isFinite(clickedOffset)) {
    return null;
  }

  const candidates: XmlStringCandidate[] = [];
  const elementStack: XmlElementFrame[] = [];
  let offset = 0;
  let hasSeenRootElement = false;

  while (offset < documentText.length) {
    if (documentText.startsWith('<!--', offset)) {
      const commentEnd = documentText.indexOf('-->', offset + 4);
      if (commentEnd === -1) {
        return null;
      }
      offset = commentEnd + 3;
      continue;
    }

    if (documentText.startsWith('<?', offset)) {
      const processingInstructionEnd = documentText.indexOf('?>', offset + 2);
      if (processingInstructionEnd === -1) {
        return null;
      }
      offset = processingInstructionEnd + 2;
      continue;
    }

    if (documentText.startsWith('<![CDATA[', offset)) {
      const cdataEnd = documentText.indexOf(']]>', offset + 9);
      if (cdataEnd === -1 || elementStack.length === 0) {
        return null;
      }

      const decodedText = trimXmlPayloadText(documentText.slice(offset + 9, cdataEnd));
      if (decodedText.length > 0) {
        elementStack.at(-1)?.textCandidates.push({
          kind: 'string',
          range: {
            start: offset + 9,
            end: cdataEnd,
          },
          decodedText,
        });
      }

      offset = cdataEnd + 3;
      continue;
    }

    const character = documentText[offset];
    if (character === '<') {
      if (documentText.startsWith('</', offset)) {
        let nextOffset = skipXmlWhitespace(documentText, offset + 2);
        const closingName = scanXmlName(documentText, nextOffset);
        if (!closingName) {
          return null;
        }

        nextOffset = skipXmlWhitespace(documentText, closingName.nextOffset);
        if (documentText[nextOffset] !== '>') {
          return null;
        }

        const currentElement = elementStack.pop();
        if (!currentElement || currentElement.name !== closingName.name) {
          return null;
        }

        if (!currentElement.hasElementChild && currentElement.textCandidates.length === 1) {
          candidates.push({
            node: currentElement.textCandidates[0]!,
            label: currentElement.name,
            keyRange: currentElement.nameRange,
          });
        }

        offset = nextOffset + 1;
        continue;
      }

      let nextOffset = offset + 1;
      const elementName = scanXmlName(documentText, nextOffset);
      if (!elementName) {
        return null;
      }

      if (elementStack.length === 0) {
        if (hasSeenRootElement) {
          return null;
        }
        hasSeenRootElement = true;
      } else {
        elementStack.at(-1)!.hasElementChild = true;
      }

      const frame: XmlElementFrame = {
        name: elementName.name,
        nameRange: elementName.range,
        hasElementChild: false,
        textCandidates: [],
      };
      nextOffset = elementName.nextOffset;
      let isSelfClosing = false;

      while (nextOffset < documentText.length) {
        nextOffset = skipXmlWhitespace(documentText, nextOffset);
        const nextCharacter = documentText[nextOffset];
        if (nextCharacter === '>') {
          nextOffset += 1;
          break;
        }

        if (nextCharacter === '/' && documentText[nextOffset + 1] === '>') {
          isSelfClosing = true;
          nextOffset += 2;
          break;
        }

        const attributeName = scanXmlName(documentText, nextOffset);
        if (!attributeName) {
          return null;
        }

        nextOffset = skipXmlWhitespace(documentText, attributeName.nextOffset);
        if (documentText[nextOffset] !== '=') {
          return null;
        }

        nextOffset = skipXmlWhitespace(documentText, nextOffset + 1);
        const quote = documentText[nextOffset];
        if (quote !== '"' && quote !== "'") {
          return null;
        }

        const valueStart = nextOffset + 1;
        const valueEnd = documentText.indexOf(quote, valueStart);
        if (valueEnd === -1) {
          return null;
        }

        const decodedValue = decodeXmlEntities(documentText.slice(valueStart, valueEnd));
        if (decodedValue === null) {
          return null;
        }

        if (decodedValue.length > 0) {
          candidates.push({
            node: {
              kind: 'string',
              range: {
                start: valueStart,
                end: valueEnd,
              },
              decodedText: decodedValue,
            },
            label: attributeName.name,
            keyRange: attributeName.range,
          });
        }

        nextOffset = valueEnd + 1;
      }

      if (!isSelfClosing) {
        elementStack.push(frame);
      }

      offset = nextOffset;
      continue;
    }

    const nextTagOffset = documentText.indexOf('<', offset);
    const textEnd = nextTagOffset === -1 ? documentText.length : nextTagOffset;
    const rawText = documentText.slice(offset, textEnd);
    if (rawText.trim().length > 0) {
      if (elementStack.length === 0) {
        return null;
      }

      const decodedText = decodeXmlEntities(rawText);
      if (decodedText === null) {
        return null;
      }

      const trimmedDecodedText = trimXmlPayloadText(decodedText);
      if (trimmedDecodedText.length > 0) {
        elementStack.at(-1)?.textCandidates.push({
          kind: 'string',
          range: {
            start: offset,
            end: textEnd,
          },
          decodedText: trimmedDecodedText,
        });
      }
    }

    offset = textEnd;
  }

  if (elementStack.length > 0 || !hasSeenRootElement) {
    return null;
  }

  const candidate = selectXmlCandidate(candidates, clickedOffset);
  if (!candidate) {
    return null;
  }

  return createStringTarget(candidate.node, candidate.label, language, parser.toSourceRange);
};

const createNoTargetResolver = (): ContextPrettifyTargetResolver => {
  return () => null;
};

const CONTEXT_PRETTIFY_TARGET_RESOLVERS: Record<OutputLanguageId, ContextPrettifyTargetResolver> = {
  json: (documentText, clickPosition) => {
    return (
      resolveNdjsonTarget(documentText, clickPosition, 'json') ??
      resolveJsonTarget(documentText, clickPosition, 'json', 'single')
    );
  },
  javascript: (documentText, clickPosition) => {
    return resolveJavaScriptLikeTarget(documentText, clickPosition, 'javascript', ts.ScriptKind.JS);
  },
  typescript: (documentText, clickPosition) => {
    return resolveJavaScriptLikeTarget(documentText, clickPosition, 'typescript', ts.ScriptKind.TS);
  },
  graphql: (documentText, clickPosition) => {
    return resolveGraphqlTarget(documentText, clickPosition, 'graphql');
  },
  yaml: (documentText, clickPosition) => {
    return resolveYamlTarget(documentText, clickPosition, 'yaml');
  },
  xml: (documentText, clickPosition) => {
    return resolveXmlTarget(documentText, clickPosition, 'xml');
  },
  sql: (documentText, clickPosition) => {
    return resolveSqlTarget(documentText, clickPosition, 'sql');
  },
  markdown: createNoTargetResolver(),
  plaintext: createNoTargetResolver(),
};

export const resolveContextPrettifyTarget = (
  paneDocumentLanguage: OutputLanguageId,
  documentText: string,
  clickPosition: SourcePosition,
): ContextPrettifyTarget | null => {
  const resolver = CONTEXT_PRETTIFY_TARGET_RESOLVERS[paneDocumentLanguage];
  return resolver?.(documentText, clickPosition) ?? null;
};

export const resolveContextPrettifyTargetByLanguage = resolveContextPrettifyTarget;
