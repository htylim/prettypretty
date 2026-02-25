import JSON5 from 'json5';
import type { IndentSize } from '../../shared/preferences';
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

export type PrettifierService = {
  prettify: (rawText: string) => string;
};

export const createPrettifierService = (indentSize: IndentSize): PrettifierService => {
  const parseStrategies = [parseStrictJson, parseJson5, parsePythonLike];

  return {
    prettify: (rawText: string): string => {
      const trimmedText = rawText.trim();

      if (!trimmedText) {
        return '';
      }

      for (const parse of parseStrategies) {
        try {
          const parsed = parse(trimmedText);
          if (!isStructuredValue(parsed)) {
            return rawText;
          }

          if (!isJsonSerializableValue(parsed)) {
            return rawText;
          }

          return JSON.stringify(parsed, null, indentSize);
        } catch {
          continue;
        }
      }

      return rawText;
    },
  };
};
