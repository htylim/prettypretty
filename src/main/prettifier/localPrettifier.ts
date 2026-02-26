import JSON5 from 'json5';
import type { IndentSize } from '../../shared/preferences';
import type { LocalDetection } from '../../shared/prettifier';

type StructuredValue = Record<string, unknown> | unknown[];

type LocalPrettifyAppliedResult = {
  kind: 'applied';
  detection: LocalDetection;
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

const normalizePythonLiterals = (input: string): string => {
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

const isJsonSerializableValue = (value: unknown): boolean => {
  if (value === null) {
    return true;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonSerializableValue(entry));
  }

  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isJsonSerializableValue(entry));
  }

  return false;
};

type ParseStrategy = {
  detection: Extract<LocalDetection, 'json' | 'json5' | 'python-like'>;
  parse: (input: string) => unknown;
};

const PARSE_STRATEGIES: ParseStrategy[] = [
  {
    detection: 'json',
    parse: (input) => JSON.parse(input) as unknown,
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
        outputText: JSON.stringify(parsed, null, indentSize),
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
