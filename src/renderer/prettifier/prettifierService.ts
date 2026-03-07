import type { IndentSize } from '../../shared/preferences';
import type { LocalDetection } from '../../shared/prettifier';
import { runLocalPrettifier } from '../../shared/localPrettifier';

export type PrettifyDetailedResult =
  | {
      kind: 'applied';
      localDetection: Extract<LocalDetection, 'json' | 'ndjson' | 'json5' | 'python-like'>;
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
  const prettifyDetailed = (rawText: string): PrettifyDetailedResult => {
    const localResult = runLocalPrettifier(rawText, indentSize);
    if (localResult.kind === 'applied') {
      return {
        kind: 'applied',
        localDetection: localResult.detection,
        outputText: localResult.outputText,
      };
    }

    return {
      kind: 'failed',
      localDetection: localResult.detection,
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
