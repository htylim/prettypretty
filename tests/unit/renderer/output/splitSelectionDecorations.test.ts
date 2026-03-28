import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  createOutputEmbeddedHighlightDecorations,
  OUTPUT_EMBEDDED_HIGHLIGHT_ANCHOR_CLASS,
  OUTPUT_EMBEDDED_HIGHLIGHT_RANGE_CLASS,
} from '../../../../src/renderer/output/splitSelectionDecorations';

const setMock = vi.fn();
const clearMock = vi.fn();

const createEditor = (): MonacoEditor.IStandaloneCodeEditor => {
  return {
    createDecorationsCollection: () => ({
      set: setMock,
      clear: clearMock,
    }),
  } as unknown as MonacoEditor.IStandaloneCodeEditor;
};

describe('splitSelectionDecorations', () => {
  beforeEach(() => {
    setMock.mockReset();
    clearMock.mockReset();
  });

  it('applies non-selection Monaco decorations for an embedded highlight span', () => {
    const controller = createOutputEmbeddedHighlightDecorations(createEditor());

    controller.update({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 2,
    });

    expect(setMock).toHaveBeenCalledWith([
      expect.objectContaining({
        options: expect.objectContaining({
          className: OUTPUT_EMBEDDED_HIGHLIGHT_RANGE_CLASS,
          isWholeLine: true,
        }),
      }),
      expect.objectContaining({
        options: expect.objectContaining({
          className: OUTPUT_EMBEDDED_HIGHLIGHT_ANCHOR_CLASS,
          isWholeLine: true,
        }),
      }),
    ]);
  });

  it('clears decorations when the highlighted candidate clears or the controller is disposed', () => {
    const controller = createOutputEmbeddedHighlightDecorations(createEditor());

    controller.update(null);
    expect(setMock).toHaveBeenCalledWith([]);

    controller.dispose();
    expect(clearMock).toHaveBeenCalledTimes(1);
  });
});
