import type { IndentSize } from '../../shared/preferences';
import type { LocalAppliedDetection, LocalFailedDetection } from '../../shared/prettifier';
import { runLocalPrettifier } from '../../shared/localPrettifier';

export type PrettifyDetailedResult =
  | {
      kind: 'applied';
      localDetection: LocalAppliedDetection;
      outputText: string;
    }
  | {
      kind: 'failed';
      localDetection: LocalFailedDetection;
      outputText: string;
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
    const localResult = await runLocalPrettifier(rawText, indentSize);
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
    prettify: async (rawText: string): Promise<string> => {
      return (await prettifyDetailed(rawText)).outputText;
    },
  };
};
