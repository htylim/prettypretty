import type { IndentSize } from '../../shared/preferences';
import { runLocalPrettifier, type LocalPrettifyResult } from '../../shared/localPrettifier';
import { summarizeLocalPrettifyResult, type LocalPrettifySummary } from '../../shared/prettifier';

export type PrettifyDetailedResult = {
  outputText: string;
  localResult: LocalPrettifySummary;
};

export type PrettifierService = {
  prettify: (rawText: string) => Promise<string>;
  prettifyDetailed: (rawText: string) => Promise<PrettifyDetailedResult>;
};

/**
 * Renderer-local prettifier used for immediate feedback before IPC fallback
 * orchestration kicks in. It intentionally mirrors the shared parser contract
 * but keeps a renderer-friendly result shape.
 */
export const createPrettifierService = (indentSize: IndentSize): PrettifierService => {
  const prettifyDetailed = async (rawText: string): Promise<PrettifyDetailedResult> => {
    const localResult: LocalPrettifyResult = await runLocalPrettifier(rawText, indentSize);
    if (localResult.kind === 'applied') {
      return {
        outputText: localResult.outputText,
        localResult: summarizeLocalPrettifyResult(localResult),
      };
    }

    return {
      outputText: rawText,
      localResult,
    };
  };

  return {
    prettifyDetailed,
    prettify: async (rawText: string): Promise<string> => {
      return (await prettifyDetailed(rawText)).outputText;
    },
  };
};
