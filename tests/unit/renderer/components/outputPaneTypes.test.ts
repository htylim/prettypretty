import { describe, expect, it } from 'vitest';
import type {
  OutputPaneFocusRequest,
  OutputPaneViewModel,
} from '../../../../src/renderer/components/outputPaneTypes';

describe('outputPaneTypes', () => {
  it('keeps the shared pane type surface available for component seams', () => {
    const focusRequest: OutputPaneFocusRequest = {
      paneId: 'output-pane-1',
      sequence: 1,
    };
    const pane: OutputPaneViewModel = {
      paneId: 'output-pane-1',
      documentId: 'doc-1',
      viewStateKey: 'output-pane-1:content-1',
      value: '{\n  "leaf": true\n}',
      viewRange: null,
      testId: 'output-editor-pane-1',
      paneDocumentLanguage: 'json',
    };

    expect(focusRequest.paneId).toBe(pane.paneId);
  });
});
