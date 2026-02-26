import JSON5 from 'json5';
import type { IndentSize } from '../../shared/preferences';
import type { LocalDetection } from '../../shared/prettifier';
import { isJsonSerializableValue } from './jsonSerializableGuard';
import { normalizePythonLiterals } from './pythonLiteralNormalize';

type StructuredValue = Record<string, unknown> | unknown[];

const isStructuredValue = (value: unknown): value is StructuredValue => {
  return typeof value === 'object' && value !== null;
};

const parseStrictJson = (input: string): unknown => {
  return JSON.parse(input) as unknown;
};

const parseJson5 = (input: string): unknown => {
  return JSON5.parse(input) as unknown;
};

const parsePythonLike = (input: string): unknown => {
  return JSON5.parse(normalizePythonLiterals(input)) as unknown;
};

export type PrettifyDetailedResult =
  | {
      kind: 'applied';
      localDetection: Extract<LocalDetection, 'json' | 'json5' | 'python-like'>;
      outputText: string;
    }
  | {
      kind: 'failed';
      localDetection: Extract<LocalDetection, 'unsupported' | 'malformed'>;
      outputText: string;
    };

export type PrettifierService = {
  prettify: (rawText: string) => string;
  prettifyDetailed: (rawText: string) => PrettifyDetailedResult;
};

export const createPrettifierService = (indentSize: IndentSize): PrettifierService => {
  const parseStrategies: Array<{
    localDetection: Extract<LocalDetection, 'json' | 'json5' | 'python-like'>;
    parse: (input: string) => unknown;
  }> = [
    { localDetection: 'json', parse: parseStrictJson },
    { localDetection: 'json5', parse: parseJson5 },
    { localDetection: 'python-like', parse: parsePythonLike },
  ];

  const prettifyDetailed = (rawText: string): PrettifyDetailedResult => {
    const trimmedText = rawText.trim();

    if (!trimmedText) {
      return {
        kind: 'applied',
        localDetection: 'json',
        outputText: '',
      };
    }

    for (const strategy of parseStrategies) {
      try {
        const parsed = strategy.parse(trimmedText);
        if (!isStructuredValue(parsed)) {
          return {
            kind: 'applied',
            localDetection: strategy.localDetection,
            outputText: rawText,
          };
        }

        if (!isJsonSerializableValue(parsed)) {
          return {
            kind: 'failed',
            localDetection: 'unsupported',
            outputText: rawText,
          };
        }

        return {
          kind: 'applied',
          localDetection: strategy.localDetection,
          outputText: JSON.stringify(parsed, null, indentSize),
        };
      } catch {
        continue;
      }
    }

    return {
      kind: 'failed',
      localDetection: 'malformed',
      outputText: rawText,
    };
  };

  return {
    prettifyDetailed,
    prettify: (rawText: string): string => {
      return prettifyDetailed(rawText).outputText;
    },
  };
};
