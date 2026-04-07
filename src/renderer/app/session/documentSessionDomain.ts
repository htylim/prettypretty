import type { IndentSize } from '../../../shared/preferences';
import type { PaneMode, ThemeMode } from '../../../shared/types';
import type { FallbackAgentOption, IngestRejectionPrompt } from '../appDomain';
import type { OutputPaneChainState } from '../outputPaneDomain';
import { createOutputPaneChainState } from '../outputPaneDomain';
import type { PrettifierSessionState } from './prettifierSessionDomain';
import {
  createInitialPrettifierSessionState,
  resetPrettifierSessionState,
} from './prettifierSessionDomain';

export type DocumentSessionState = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  inputText: string;
  ingestNotice: string | null;
  ingestRejectionPrompt: IngestRejectionPrompt | null;
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  fallbackWarningLineThreshold: number;
  outputPaneChainState: OutputPaneChainState;
} & PrettifierSessionState;

export const createInitialDocumentSessionState = (): DocumentSessionState => ({
  paneMode: 'input',
  themeMode: 'light',
  indentSize: 2,
  inputText: '',
  ingestNotice: null,
  ingestRejectionPrompt: null,
  fallbackAgentId: null,
  fallbackAgentOptions: [],
  fallbackWarningLineThreshold: 300,
  outputPaneChainState: createOutputPaneChainState(),
  ...createInitialPrettifierSessionState(),
});

/**
 * Resetting a document keeps user preferences while clearing transient editor
 * session content.
 */
export const resetDocumentSessionEditorState = (
  state: DocumentSessionState,
): DocumentSessionState => ({
  ...resetPrettifierSessionState(state),
  paneMode: 'input',
  inputText: '',
  ingestNotice: null,
  ingestRejectionPrompt: null,
  outputPaneChainState: createOutputPaneChainState(),
});
