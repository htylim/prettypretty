import type { DocumentSessionState } from './documentSessionDomain';

export const selectPaneMode = (state: DocumentSessionState): DocumentSessionState['paneMode'] => {
  return state.paneMode;
};

export const selectThemeMode = (state: DocumentSessionState): DocumentSessionState['themeMode'] => {
  return state.themeMode;
};

export const selectIndentSize = (
  state: DocumentSessionState,
): DocumentSessionState['indentSize'] => {
  return state.indentSize;
};

export const selectInputText = (state: DocumentSessionState): DocumentSessionState['inputText'] => {
  return state.inputText;
};

export const selectIngestNotice = (
  state: DocumentSessionState,
): DocumentSessionState['ingestNotice'] => {
  return state.ingestNotice;
};

export const selectIngestRejectionMessage = (
  state: DocumentSessionState,
): DocumentSessionState['ingestRejectionMessage'] => {
  return state.ingestRejectionMessage;
};

export const selectOutputText = (
  state: DocumentSessionState,
): DocumentSessionState['outputText'] => {
  return state.outputText;
};

export const selectOutputFormattingState = (
  state: DocumentSessionState,
): DocumentSessionState['outputFormattingState'] => {
  return state.outputFormattingState;
};

export const selectFallbackWaitState = (
  state: DocumentSessionState,
): DocumentSessionState['fallbackWaitState'] => {
  return state.fallbackWaitState;
};

export const selectFallbackModalState = (
  state: DocumentSessionState,
): DocumentSessionState['fallbackModalState'] => {
  return state.fallbackModalState;
};

export const selectLastPrettifiedInput = (
  state: DocumentSessionState,
): DocumentSessionState['lastPrettifiedInput'] => {
  return state.lastPrettifiedInput;
};

export const selectFallbackAgentId = (
  state: DocumentSessionState,
): DocumentSessionState['fallbackAgentId'] => {
  return state.fallbackAgentId;
};

export const selectFallbackAgentOptions = (
  state: DocumentSessionState,
): DocumentSessionState['fallbackAgentOptions'] => {
  return state.fallbackAgentOptions;
};

export const selectFallbackWarningLineThreshold = (
  state: DocumentSessionState,
): DocumentSessionState['fallbackWarningLineThreshold'] => {
  return state.fallbackWarningLineThreshold;
};

export const selectOutputPaneChainState = (
  state: DocumentSessionState,
): DocumentSessionState['outputPaneChainState'] => {
  return state.outputPaneChainState;
};
