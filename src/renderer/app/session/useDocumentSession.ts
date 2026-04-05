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
  setIngestNotice: (notice: string | null) => void;
  setIngestRejectionMessage: (message: string | null) => void;
  setFallbackAgentId: (fallbackAgentId: string | null) => void;
  setFallbackAgentOptions: (
    fallbackAgentOptions: DocumentSessionState['fallbackAgentOptions'],
  ) => void;
  setFallbackWarningLineThreshold: (fallbackWarningLineThreshold: number) => void;
  setOutputPaneChainState: (outputPaneChainState: OutputPaneChainState) => void;
  setOutputText: (outputText: string) => void;
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
  setIngestNotice: (notice) => set({ ingestNotice: notice }),
  setIngestRejectionMessage: (message) => set({ ingestRejectionMessage: message }),
  setFallbackAgentId: (fallbackAgentId) => set({ fallbackAgentId }),
  setFallbackAgentOptions: (fallbackAgentOptions) => set({ fallbackAgentOptions }),
  setFallbackWarningLineThreshold: (fallbackWarningLineThreshold) =>
    set({ fallbackWarningLineThreshold }),
  setOutputPaneChainState: (outputPaneChainState) => set({ outputPaneChainState }),
  setOutputText: (outputText) => set({ outputText }),
  setOutputFormattingState: (outputFormattingState) => set({ outputFormattingState }),
  setFallbackWaitState: (fallbackWaitState) => set({ fallbackWaitState }),
  setFallbackModalState: (fallbackModalState) => set({ fallbackModalState }),
  setLastPrettifiedInput: (lastPrettifiedInput) => set({ lastPrettifiedInput }),
  reset: () => {
    set((state) => resetDocumentSessionEditorState(state));
  },
}));
