import type { LocalPrettifySummary } from '../../shared/prettifier';
import type { OutputLanguageId } from '../output/detectOutputLanguage';

const isStructuredJsonLikeOutput = (
  localResult: LocalPrettifySummary,
  outputText: string,
): boolean => {
  if (localResult.kind !== 'applied' || localResult.family !== 'json-like') {
    return false;
  }

  if (localResult.variant === 'ndjson') {
    return true;
  }

  const trimmedOutput = outputText.trim();
  return trimmedOutput.startsWith('{') || trimmedOutput.startsWith('[');
};

export const getLocalResultOutputLanguageOverride = (
  localResult: LocalPrettifySummary,
  outputText: string,
): OutputLanguageId | null => {
  if (localResult.kind !== 'applied') {
    return null;
  }

  if (localResult.family === 'graphql') {
    return 'graphql';
  }

  return isStructuredJsonLikeOutput(localResult, outputText) ? 'json' : null;
};
