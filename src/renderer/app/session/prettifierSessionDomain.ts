import type { IndentSize } from '../../../shared/preferences';
import type { PrettifyRunStatus } from '../../../shared/prettifier';
import type { PaneMode } from '../../../shared/types';
import { detectFallbackFormatLabel } from '../../prettifier/detectFallbackFormat';
import { reindentText } from '../../prettifier/reindentText';
import type { FallbackWaitState } from '../appDomain';

export type OutputFormattingState = {
  isPrettified: boolean;
  indentSize: IndentSize | null;
};

export type OutputReindentSnapshot = {
  outputText: string;
  formattingState: OutputFormattingState;
};

export type FallbackModalState =
  | {
      kind: 'large-content';
      lineCount: number;
    }
  | {
      kind: 'agent-selection';
    };

export type PrettifierSessionState = {
  outputText: string;
  outputFormattingState: OutputFormattingState;
  fallbackWaitState: FallbackWaitState | null;
  fallbackModalState: FallbackModalState | null;
  lastPrettifiedInput: string | null;
};

export type OutputReindentTransition = {
  snapshot: OutputReindentSnapshot;
  nextState: PrettifierSessionState;
};

export const createEmptyOutputFormattingState = (): OutputFormattingState => ({
  isPrettified: false,
  indentSize: null,
});

export const createInitialPrettifierSessionState = (): PrettifierSessionState => ({
  outputText: '',
  outputFormattingState: createEmptyOutputFormattingState(),
  fallbackWaitState: null,
  fallbackModalState: null,
  lastPrettifiedInput: null,
});

export const resetPrettifierSessionState = <T extends PrettifierSessionState>(state: T): T => ({
  ...state,
  outputText: '',
  outputFormattingState: createEmptyOutputFormattingState(),
  fallbackWaitState: null,
  fallbackModalState: null,
  lastPrettifiedInput: null,
});

export const createLargeContentFallbackModalState = (lineCount: number): FallbackModalState => ({
  kind: 'large-content',
  lineCount,
});

export const createAgentSelectionFallbackModalState = (): FallbackModalState => ({
  kind: 'agent-selection',
});

export const isAppliedPrettifyStatus = (status: PrettifyRunStatus): boolean => {
  return status === 'applied-local' || status === 'applied-fallback';
};

export const getLineCount = (value: string): number => {
  if (value.length === 0) {
    return 0;
  }

  return value.split(/\r\n|\r|\n/u).length;
};

export const createFallbackWaitState = (
  requestId: number,
  inputText: string,
  agentName: string,
): FallbackWaitState => ({
  requestId,
  formatLabel: detectFallbackFormatLabel(inputText),
  agentName,
  progressLines: [],
});

export const applyPassthroughOutput = (
  state: PrettifierSessionState,
  nextInputText: string,
): PrettifierSessionState => ({
  ...state,
  outputText: nextInputText,
  outputFormattingState: createEmptyOutputFormattingState(),
  fallbackWaitState: null,
  lastPrettifiedInput: nextInputText,
});

export const applyLocalPrettifyOutput = (
  state: PrettifierSessionState,
  inputText: string,
  prettifiedText: string,
  indentSize: IndentSize,
): PrettifierSessionState => ({
  ...state,
  outputText: prettifiedText,
  outputFormattingState: {
    isPrettified: true,
    indentSize,
  },
  fallbackWaitState: null,
  lastPrettifiedInput: inputText,
});

export const applyRemotePrettifyOutput = (
  state: PrettifierSessionState,
  inputText: string,
  outputText: string,
  indentSize: IndentSize,
  status: PrettifyRunStatus,
): PrettifierSessionState => ({
  ...state,
  outputText,
  outputFormattingState: {
    isPrettified: isAppliedPrettifyStatus(status),
    indentSize: isAppliedPrettifyStatus(status) ? indentSize : null,
  },
  fallbackWaitState: null,
  lastPrettifiedInput: inputText,
});

export const shouldPromptForFallbackConfirmation = (
  lineCount: number,
  fallbackWarningLineThreshold: number,
  shouldWaitForFallback: boolean,
): boolean => {
  return shouldWaitForFallback && lineCount > fallbackWarningLineThreshold;
};

export const shouldRequestFallbackAgentSelection = (
  shouldWaitForFallback: boolean,
  hasEnabledFallbackAgentOption: boolean,
): boolean => {
  return !shouldWaitForFallback && hasEnabledFallbackAgentOption;
};

export const createOutputReindentTransition = (
  state: PrettifierSessionState,
  options: {
    paneMode: PaneMode;
    inputText: string;
    nextIndentSize: IndentSize;
  },
): OutputReindentTransition | null => {
  const currentFormatting = state.outputFormattingState;
  const hasInputContent = options.inputText.trim().length > 0;
  const canReindent =
    options.paneMode === 'output' &&
    hasInputContent &&
    currentFormatting.isPrettified &&
    currentFormatting.indentSize !== null &&
    currentFormatting.indentSize !== options.nextIndentSize;

  if (!canReindent || currentFormatting.indentSize === null) {
    return null;
  }

  const currentIndentSize = currentFormatting.indentSize;

  return {
    snapshot: {
      outputText: state.outputText,
      formattingState: { ...currentFormatting },
    },
    nextState: {
      ...state,
      outputText: reindentText(state.outputText, currentIndentSize, options.nextIndentSize),
      outputFormattingState: {
        isPrettified: true,
        indentSize: options.nextIndentSize,
      },
    },
  };
};
