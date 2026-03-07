import JSON5 from 'json5';
import type { IndentSize } from './preferences';
import type { LocalDetection } from './prettifier';

type StructuredValue = Record<string, unknown> | unknown[];

type LocalPrettifyAppliedResult = {
  kind: 'applied';
  detection: Extract<LocalDetection, 'json' | 'ndjson' | 'json5' | 'python-like'>;
  outputText: string;
};

type LocalPrettifyFailedResult = {
  kind: 'failed';
  detection: Extract<LocalDetection, 'unsupported' | 'malformed'>;
};

export type LocalPrettifyResult = LocalPrettifyAppliedResult | LocalPrettifyFailedResult;

const isIdentifierStart = (character: string): boolean => /[A-Za-z_]/.test(character);
const isIdentifierPart = (character: string): boolean => /[A-Za-z0-9_]/.test(character);

const normalizeIdentifier = (identifier: string): string => {
  if (identifier === 'True') {
    return 'true';
  }

  if (identifier === 'False') {
    return 'false';
  }

  if (identifier === 'None') {
    return 'null';
  }

  return identifier;
};

export const normalizePythonLiterals = (input: string): string => {
  let normalized = '';
  let index = 0;
  let inSingleQuotedString = false;
  let inDoubleQuotedString = false;
  let escapeNextCharacter = false;

  while (index < input.length) {
    const currentCharacter = input[index];
    if (currentCharacter === undefined) {
      break;
    }

    if (inSingleQuotedString || inDoubleQuotedString) {
      normalized += currentCharacter;

      if (escapeNextCharacter) {
        escapeNextCharacter = false;
        index += 1;
        continue;
      }

      if (currentCharacter === '\\') {
        escapeNextCharacter = true;
        index += 1;
        continue;
      }

      if (inSingleQuotedString && currentCharacter === "'") {
        inSingleQuotedString = false;
      } else if (inDoubleQuotedString && currentCharacter === '"') {
        inDoubleQuotedString = false;
      }

      index += 1;
      continue;
    }

    if (currentCharacter === "'") {
      inSingleQuotedString = true;
      normalized += currentCharacter;
      index += 1;
      continue;
    }

    if (currentCharacter === '"') {
      inDoubleQuotedString = true;
      normalized += currentCharacter;
      index += 1;
      continue;
    }

    if (!isIdentifierStart(currentCharacter)) {
      normalized += currentCharacter;
      index += 1;
      continue;
    }

    let identifierEnd = index + 1;
    while (identifierEnd < input.length) {
      const identifierCharacter = input[identifierEnd];
      if (!identifierCharacter || !isIdentifierPart(identifierCharacter)) {
        break;
      }
      identifierEnd += 1;
    }

    const identifier = input.slice(index, identifierEnd);
    normalized += normalizeIdentifier(identifier);
    index = identifierEnd;
  }

  return normalized;
};

const isStructuredValue = (value: unknown): value is StructuredValue => {
  return typeof value === 'object' && value !== null;
};

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isSerializableNode = (value: unknown, seen: Set<object>): boolean => {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'object') {
    return false;
  }

  const objectValue: object = value;

  if (seen.has(objectValue)) {
    return false;
  }

  seen.add(objectValue);

  if (Array.isArray(objectValue)) {
    for (const item of objectValue) {
      if (!isSerializableNode(item, seen)) {
        seen.delete(objectValue);
        return false;
      }
    }

    seen.delete(objectValue);
    return true;
  }

  if (!isPlainObject(objectValue)) {
    seen.delete(objectValue);
    return false;
  }

  for (const nodeValue of Object.values(objectValue as Record<string, unknown>)) {
    if (!isSerializableNode(nodeValue, seen)) {
      seen.delete(objectValue);
      return false;
    }
  }

  seen.delete(objectValue);
  return true;
};

export const isJsonSerializableValue = (value: unknown): boolean => {
  return isSerializableNode(value, new Set<object>());
};

type ParseStrategy = {
  detection: Extract<LocalDetection, 'json' | 'ndjson' | 'json5' | 'python-like'>;
  parse: (input: string) => unknown;
};

const parseNdjson = (input: string): unknown[] => {
  const lines = input.split(/\r?\n/u);
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length < 2) {
    throw new Error('ndjson-requires-multiple-records');
  }

  return lines.flatMap((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return [];
    }

    return [JSON.parse(trimmedLine) as unknown];
  });
};

const PARSE_STRATEGIES: ParseStrategy[] = [
  {
    detection: 'json',
    parse: (input) => JSON.parse(input) as unknown,
  },
  {
    detection: 'ndjson',
    parse: parseNdjson,
  },
  {
    detection: 'json5',
    parse: (input) => JSON5.parse(input) as unknown,
  },
  {
    detection: 'python-like',
    parse: (input) => JSON5.parse(normalizePythonLiterals(input)) as unknown,
  },
];

export const runLocalPrettifier = (
  inputText: string,
  indentSize: IndentSize,
): LocalPrettifyResult => {
  const trimmedInput = inputText.trim();

  if (!trimmedInput) {
    return {
      kind: 'applied',
      detection: 'json',
      outputText: '',
    };
  }

  for (const strategy of PARSE_STRATEGIES) {
    try {
      const parsed = strategy.parse(trimmedInput);

      if (!isStructuredValue(parsed)) {
        return {
          kind: 'applied',
          detection: strategy.detection,
          outputText: inputText,
        };
      }

      if (!isJsonSerializableValue(parsed)) {
        return {
          kind: 'failed',
          detection: 'unsupported',
        };
      }

      return {
        kind: 'applied',
        detection: strategy.detection,
        outputText:
          strategy.detection === 'ndjson'
            ? (parsed as unknown[])
                .map((record) => JSON.stringify(record, null, indentSize))
                .join('\n')
            : JSON.stringify(parsed, null, indentSize),
      };
    } catch {
      continue;
    }
  }

  return {
    kind: 'failed',
    detection: 'malformed',
  };
};
