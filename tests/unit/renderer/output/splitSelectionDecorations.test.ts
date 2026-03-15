import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  createSplitSelectionDecorations,
  OUTPUT_SPLIT_SELECTION_ANCHOR_CLASS,
  OUTPUT_SPLIT_SELECTION_RANGE_CLASS,
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

  it('applies non-selection Monaco decorations when a child pane exists', () => {
    const controller = createSplitSelectionDecorations(createEditor());

    controller.update({
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 4,
      endColumn: 2,
    });

    expect(setMock).toHaveBeenCalledWith([
      expect.objectContaining({
        options: expect.objectContaining({
          className: OUTPUT_SPLIT_SELECTION_RANGE_CLASS,
          isWholeLine: true,
        }),
      }),
      expect.objectContaining({
        options: expect.objectContaining({
          className: OUTPUT_SPLIT_SELECTION_ANCHOR_CLASS,
          isWholeLine: true,
        }),
      }),
    ]);
  });

  it('clears decorations when the child pane closes or the controller is disposed', () => {
    const controller = createSplitSelectionDecorations(createEditor());

    controller.update(null);
    expect(setMock).toHaveBeenCalledWith([]);

    controller.dispose();
    expect(clearMock).toHaveBeenCalledTimes(1);
  });
});
