import JSON5 from 'json5';
import { prettifyGraphql } from './graphqlPrettifier';
import { tryFormatJsonLikeTokenPreserving } from './jsonLikeTokenPreservingFormatter';
import type { IndentSize } from './preferences';
import type {
  LocalPrettifyAppliedResult,
  LocalPrettifyResult,
  StructuredDataLocalVariant,
} from './prettifier';

export type { LocalPrettifyResult } from './prettifier';

type StructuredValue = Record<string, unknown> | unknown[];

const GRAPHQL_OPERATION_SIGNAL =
  /^(query|mutation|subscription)\b(?:\s+[A-Za-z_][A-Za-z0-9_]*)?(?:\s*\([^)]*\))?\s*\{/u;
const GRAPHQL_FRAGMENT_SIGNAL =
  /^fragment\b\s+[A-Za-z_][A-Za-z0-9_]*\s+on\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/u;
const GRAPHQL_SCHEMA_SIGNAL =
  /^(schema|type|input|enum|union|directive|extend|interface)\b[\s\S]*\{/u;

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

type StructuredDataStrategy = {
  variant: StructuredDataLocalVariant;
  parse: (input: string) => unknown;
};

// Some families stay synchronous while others delegate to async formatter
// backends. The registry does not care which one it gets back.
type LocalFormatAttempt = LocalPrettifyResult | null | Promise<LocalPrettifyResult | null>;

type SupportedLocalFormatFamily = {
  hasMalformedSignal: (signalInput: string) => boolean;
  tryApply: (inputText: string, trimmedInput: string, indentSize: IndentSize) => LocalFormatAttempt;
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

// Malformed classification should ignore leading comments so commented-out
// supported syntax still stays on the malformed path rather than degrading to
// plain text after the real parser rejects it.
const stripLeadingCommentsAndWhitespace = (input: string): string => {
  let remaining = input.trimStart();

  while (remaining.length > 0) {
    if (remaining.startsWith('//') || remaining.startsWith('#')) {
      const newlineIndex = remaining.indexOf('\n');
      if (newlineIndex === -1) {
        return '';
      }

      remaining = remaining.slice(newlineIndex + 1).trimStart();
      continue;
    }

    if (remaining.startsWith('/*')) {
      const blockCommentEndIndex = remaining.indexOf('*/', 2);
      if (blockCommentEndIndex === -1) {
        return '';
      }

      remaining = remaining.slice(blockCommentEndIndex + 2).trimStart();
      continue;
    }

    break;
  }

  return remaining;
};

const hasStructuredDataMalformedSignal = (signalInput: string): boolean => {
  return signalInput.startsWith('{') || signalInput.startsWith('[');
};

const hasGraphqlMalformedSignal = (signalInput: string): boolean => {
  if (GRAPHQL_OPERATION_SIGNAL.test(signalInput)) {
    return true;
  }

  if (GRAPHQL_FRAGMENT_SIGNAL.test(signalInput)) {
    return true;
  }

  return GRAPHQL_SCHEMA_SIGNAL.test(signalInput);
};

const STRUCTURED_DATA_STRATEGIES: StructuredDataStrategy[] = [
  {
    variant: 'json',
    parse: (input) => JSON.parse(input) as unknown,
  },
  {
    variant: 'ndjson',
    parse: parseNdjson,
  },
  {
    variant: 'json5',
    parse: (input) => JSON5.parse(input) as unknown,
  },
  {
    variant: 'python-like',
    parse: (input) => JSON5.parse(normalizePythonLiterals(input)) as unknown,
  },
];

// JSON-like inputs share the same canonical contract: parse to data, reject
// runtime-only values, then emit normalized JSON text. If canonical parsing
// cannot finish the job, fall through to token-preserving formatting.
const tryApplyStructuredDataPrettifier = (
  inputText: string,
  trimmedInput: string,
  indentSize: IndentSize,
): LocalPrettifyResult | null => {
  let sawUnsupportedJsonLikeValue = false;

  for (const strategy of STRUCTURED_DATA_STRATEGIES) {
    try {
      const parsed = strategy.parse(trimmedInput);

      if (!isStructuredValue(parsed)) {
        return {
          kind: 'applied',
          family: 'json-like',
          mode: 'canonical',
          variant: strategy.variant,
          outputText: inputText,
        };
      }

      if (!isJsonSerializableValue(parsed)) {
        sawUnsupportedJsonLikeValue = true;
        continue;
      }

      return {
        kind: 'applied',
        family: 'json-like',
        mode: 'canonical',
        variant: strategy.variant,
        outputText:
          strategy.variant === 'ndjson'
            ? (parsed as unknown[])
                .map((record) => JSON.stringify(record, null, indentSize))
                .join('\n')
            : JSON.stringify(parsed, null, indentSize),
      };
    } catch {
      continue;
    }
  }

  const tokenPreservingOutput = tryFormatJsonLikeTokenPreserving(trimmedInput, indentSize);
  if (tokenPreservingOutput !== null) {
    return {
      kind: 'applied',
      family: 'json-like',
      mode: 'token-preserving',
      variant: 'json-like-token-preserving',
      outputText: tokenPreservingOutput,
    };
  }

  return sawUnsupportedJsonLikeValue
    ? {
        kind: 'failed',
        family: 'json-like',
        reason: 'unsupported',
      }
    : null;
};

// GraphQL formatting is kept in a dedicated shared helper so the adapter seams
// in renderer/main only consume shared local-result metadata.
const tryApplyGraphqlPrettifier = (
  trimmedInput: string,
  indentSize: IndentSize,
): Promise<LocalPrettifyAppliedResult | null> => {
  return prettifyGraphql(trimmedInput, indentSize)
    .then((outputText) => ({
      kind: 'applied' as const,
      family: 'graphql' as const,
      mode: 'canonical' as const,
      variant: 'graphql' as const,
      outputText,
    }))
    .catch(() => null);
};

const tryApplyGraphqlFamily = async (
  _inputText: string,
  trimmedInput: string,
  indentSize: IndentSize,
): Promise<LocalPrettifyResult | null> => {
  return tryApplyGraphqlPrettifier(trimmedInput, indentSize);
};

// Keep supported local families in one registry so format application and
// malformed-signal ownership evolve together instead of drifting across helpers.
const SUPPORTED_LOCAL_FORMAT_FAMILIES: readonly SupportedLocalFormatFamily[] = [
  {
    hasMalformedSignal: hasStructuredDataMalformedSignal,
    tryApply: tryApplyStructuredDataPrettifier,
  },
  {
    hasMalformedSignal: hasGraphqlMalformedSignal,
    tryApply: tryApplyGraphqlFamily,
  },
];

const getSupportedMalformedFamily = (
  trimmedInput: string,
): Extract<LocalPrettifyResult, { kind: 'failed' }>['family'] | null => {
  const signalInput = stripLeadingCommentsAndWhitespace(trimmedInput);
  if (!signalInput) {
    return null;
  }

  if (hasStructuredDataMalformedSignal(signalInput)) {
    return 'json-like';
  }

  if (hasGraphqlMalformedSignal(signalInput)) {
    return 'graphql';
  }

  return null;
};

export const runLocalPrettifier = async (
  inputText: string,
  indentSize: IndentSize,
): Promise<LocalPrettifyResult> => {
  const trimmedInput = inputText.trim();

  if (!trimmedInput) {
    return {
      kind: 'applied',
      family: 'json-like',
      mode: 'canonical',
      variant: 'json',
      outputText: '',
    };
  }

  for (const family of SUPPORTED_LOCAL_FORMAT_FAMILIES) {
    const localResult = await family.tryApply(inputText, trimmedInput, indentSize);
    if (localResult) {
      return localResult;
    }
  }

  // Boundary rule: unsupported plain text is still a successful local no-op.
  // We only return malformed when there's a conservative signal that input
  // belongs to a supported local family but failed parse/format.
  const malformedFamily = getSupportedMalformedFamily(trimmedInput);
  if (malformedFamily) {
    return {
      kind: 'failed',
      family: malformedFamily,
      reason: 'malformed',
    };
  }

  return {
    kind: 'applied',
    family: 'text',
    mode: 'passthrough',
    variant: 'text',
    outputText: inputText,
  };
};
