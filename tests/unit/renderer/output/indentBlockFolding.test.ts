import { describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import {
  findIndentBlockRange,
  registerCmdClickFoldToggle,
} from '../../../../src/renderer/output/indentBlockFolding';

const createModel = (lines: string[]): MonacoEditor.ITextModel =>
  ({
    getLineCount: () => lines.length,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
    getOptions: () => ({ tabSize: 2 }),
  }) as unknown as MonacoEditor.ITextModel;

describe('indentBlockFolding', () => {
  it('finds parent indent block for nested lines', () => {
    const model = createModel(['{', '  "nested": {', '    "x": 1', '  }', '}']);

    expect(findIndentBlockRange(model, 3)).toEqual({ startLine: 2, endLine: 3 });
  });

  it('returns null for blank lines', () => {
    const model = createModel(['{', '', '}']);

    expect(findIndentBlockRange(model, 2)).toBeNull();
  });

  it('toggles fold on Cmd+click only', () => {
    const toggleFoldRunMock = vi.fn(async () => undefined);
    const setPositionMock = vi.fn();
    const onMouseDownMock = vi.fn();

    const editor = {
      getModel: () => createModel(['{', '  "nested": {', '    "x": 1', '  }', '}']),
      getAction: (id: string): { run: () => Promise<void> } | undefined =>
        id === 'editor.toggleFold' ? { run: toggleFoldRunMock } : undefined,
      setPosition: setPositionMock,
      onMouseDown: (handler: (event: MonacoEditor.IEditorMouseEvent) => void) => {
        onMouseDownMock(handler);
        return { dispose: vi.fn() };
      },
    } as unknown as MonacoEditor.IStandaloneCodeEditor;

    registerCmdClickFoldToggle(editor);

    const handleMouseDown = onMouseDownMock.mock.calls[0]?.[0] as
      | ((event: MonacoEditor.IEditorMouseEvent) => void)
      | undefined;
    if (!handleMouseDown) {
      throw new Error('Expected mouse down handler registration');
    }

    handleMouseDown({
      target: { position: { lineNumber: 3, column: 6 } },
      event: {
        metaKey: false,
        browserEvent: { detail: 1 },
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
    } as unknown as MonacoEditor.IEditorMouseEvent);

    expect(toggleFoldRunMock).not.toHaveBeenCalled();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handleMouseDown({
      target: { position: { lineNumber: 3, column: 6 } },
      event: {
        metaKey: true,
        browserEvent: { detail: 1 },
        preventDefault,
        stopPropagation,
      },
    } as unknown as MonacoEditor.IEditorMouseEvent);

    expect(toggleFoldRunMock).toHaveBeenCalledTimes(1);
    expect(setPositionMock).toHaveBeenCalledWith({ lineNumber: 2, column: 1 });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});
