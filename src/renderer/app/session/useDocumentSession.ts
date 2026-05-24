import { create } from 'zustand';
import {
  createInitialDocumentSessionState,
  resetDocumentSessionEditorState,
  type DocumentSessionState,
} from './documentSessionDomain';
import type { OutputPaneChainState } from '../outputPaneDomain';

type DocumentSessionActions = {
  setPaneMode: (mode: DocumentSessionState['paneMode']) => void;
  setThemeMode: (mode: DocumentSessionState['themeMode']) => void;
  setIndentSize: (size: DocumentSessionState['indentSize']) => void;
  setInputText: (text: string) => void;
  setFileSource: (fileSource: DocumentSessionState['fileSource']) => void;
  setIngestNotice: (notice: string | null) => void;
  setIngestRejectionPrompt: (prompt: DocumentSessionState['ingestRejectionPrompt']) => void;
  setFallbackAgentId: (fallbackAgentId: string | null) => void;
  setFallbackAgentOptions: (
    fallbackAgentOptions: DocumentSessionState['fallbackAgentOptions'],
  ) => void;
  setFallbackWarningLineThreshold: (fallbackWarningLineThreshold: number) => void;
  setOutputPaneChainState: (outputPaneChainState: OutputPaneChainState) => void;
  setOutputText: (outputText: string) => void;
  setOutputLanguageOverride: (
    outputLanguageOverride: DocumentSessionState['outputLanguageOverride'],
  ) => void;
  setOutputFormattingState: (
    outputFormattingState: DocumentSessionState['outputFormattingState'],
  ) => void;
  setFallbackWaitState: (fallbackWaitState: DocumentSessionState['fallbackWaitState']) => void;
  setFallbackModalState: (fallbackModalState: DocumentSessionState['fallbackModalState']) => void;
  setLastPrettifiedInput: (lastPrettifiedInput: string | null) => void;
  reset: () => void;
};

export type DocumentSessionStore = DocumentSessionState & DocumentSessionActions;

export const useDocumentSession = create<DocumentSessionStore>((set) => ({
  ...createInitialDocumentSessionState(),
  setPaneMode: (mode) => set({ paneMode: mode }),
  setThemeMode: (mode) => set({ themeMode: mode }),
  setIndentSize: (size) => set({ indentSize: size }),
  setInputText: (text) => set({ inputText: text }),
  setFileSource: (fileSource) => set({ fileSource }),
  setIngestNotice: (notice) => set({ ingestNotice: notice }),
  setIngestRejectionPrompt: (prompt) => set({ ingestRejectionPrompt: prompt }),
  setFallbackAgentId: (fallbackAgentId) => set({ fallbackAgentId }),
  setFallbackAgentOptions: (fallbackAgentOptions) => set({ fallbackAgentOptions }),
  setFallbackWarningLineThreshold: (fallbackWarningLineThreshold) =>
    set({ fallbackWarningLineThreshold }),
  setOutputPaneChainState: (outputPaneChainState) => set({ outputPaneChainState }),
  setOutputText: (outputText) => set({ outputText }),
  setOutputLanguageOverride: (outputLanguageOverride) => set({ outputLanguageOverride }),
  setOutputFormattingState: (outputFormattingState) => set({ outputFormattingState }),
  setFallbackWaitState: (fallbackWaitState) => set({ fallbackWaitState }),
  setFallbackModalState: (fallbackModalState) => set({ fallbackModalState }),
  setLastPrettifiedInput: (lastPrettifiedInput) => set({ lastPrettifiedInput }),
  reset: () => {
    set((state) => resetDocumentSessionEditorState(state));
  },
}));
