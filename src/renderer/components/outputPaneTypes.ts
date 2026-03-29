import type { OutputPaneSourceRange } from '../app/outputPaneDomain';

export type OutputPaneViewModel = {
  paneId: string;
  documentId: string;
  viewStateKey: string;
  value: string;
  viewRange: OutputPaneSourceRange | null;
  testId: string;
};

export type OutputPaneFocusRequest = {
  paneId: string;
  sequence: number;
};
