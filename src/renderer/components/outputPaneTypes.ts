import type { OutputPaneSourceRange } from '../output/outputRange';
import type { OutputLanguageId } from '../output/detectOutputLanguage';

export type OutputPaneViewModel = {
  paneId: string;
  documentId: string;
  viewStateKey: string;
  value: string;
  paneDocumentLanguage: OutputLanguageId;
  languageOverride?: OutputLanguageId | null;
  activeExtractedSourceRange?: OutputPaneSourceRange | null;
  lineNumberStart?: number | null;
  viewRange: OutputPaneSourceRange | null;
  testId: string;
};

export type OutputPaneFocusRequest = {
  paneId: string;
  sequence: number;
};
