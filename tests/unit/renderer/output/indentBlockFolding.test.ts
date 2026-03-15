import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import { registerPrimaryModifierFoldToggle } from '../../../../src/renderer/output/indentBlockFolding';

const { findOwningFoldStartLineMock, toggleFoldStartMock, hasPrimaryModifierMock } = vi.hoisted(
  () => ({
    findOwningFoldStartLineMock: vi.fn(),
    toggleFoldStartMock: vi.fn(),
    hasPrimaryModifierMock: vi.fn(),
  }),
);

vi.mock('../../../../src/renderer/editor/monacoFolding', () => ({
  findOwningFoldStartLine: findOwningFoldStartLineMock,
  toggleFoldStart: toggleFoldStartMock,
}));

vi.mock('../../../../src/renderer/app/primaryModifier', () => ({
  hasPrimaryModifier: hasPrimaryModifierMock,
}));

describe('indentBlockFolding', () => {
  beforeEach(() => {
    findOwningFoldStartLineMock.mockReset();
    toggleFoldStartMock.mockReset();
    hasPrimaryModifierMock.mockReset();
  });

  it('toggles fold on primary-modifier click only when a Monaco fold owner exists', () => {
    const onMouseDownMock = vi.fn();
    const editor = {
      onMouseDown: (handler: (event: MonacoEditor.IEditorMouseEvent) => void) => {
        onMouseDownMock(handler);
        return { dispose: vi.fn() };
      },
    } as unknown as MonacoEditor.IStandaloneCodeEditor;

    findOwningFoldStartLineMock.mockReturnValue(2);
    hasPrimaryModifierMock.mockReturnValue(false);

    registerPrimaryModifierFoldToggle(editor);

    const handleMouseDown = onMouseDownMock.mock.calls[0]?.[0] as
      | ((event: MonacoEditor.IEditorMouseEvent) => void)
      | undefined;
    if (!handleMouseDown) {
      throw new Error('Expected mouse down handler registration');
    }

    const regularPreventDefault = vi.fn();
    const regularStopPropagation = vi.fn();
    handleMouseDown({
      target: { position: { lineNumber: 3, column: 6 } },
      event: {
        metaKey: false,
        browserEvent: { detail: 1 },
        preventDefault: regularPreventDefault,
        stopPropagation: regularStopPropagation,
      },
    } as unknown as MonacoEditor.IEditorMouseEvent);

    expect(toggleFoldStartMock).not.toHaveBeenCalled();
    expect(regularPreventDefault).not.toHaveBeenCalled();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    hasPrimaryModifierMock.mockReturnValue(true);
    handleMouseDown({
      target: { position: { lineNumber: 3, column: 6 } },
      event: {
        metaKey: true,
        browserEvent: { detail: 1 },
        preventDefault,
        stopPropagation,
      },
    } as unknown as MonacoEditor.IEditorMouseEvent);

    expect(findOwningFoldStartLineMock).toHaveBeenCalledWith(editor, 3);
    expect(toggleFoldStartMock).toHaveBeenCalledWith(editor, 2);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('keeps plain Monaco behavior when the clicked line has no fold owner', () => {
    const onMouseDownMock = vi.fn();
    const editor = {
      onMouseDown: (handler: (event: MonacoEditor.IEditorMouseEvent) => void) => {
        onMouseDownMock(handler);
        return { dispose: vi.fn() };
      },
    } as unknown as MonacoEditor.IStandaloneCodeEditor;

    findOwningFoldStartLineMock.mockReturnValue(null);
    hasPrimaryModifierMock.mockReturnValue(true);

    registerPrimaryModifierFoldToggle(editor);

    const handleMouseDown = onMouseDownMock.mock.calls[0]?.[0] as
      | ((event: MonacoEditor.IEditorMouseEvent) => void)
      | undefined;
    if (!handleMouseDown) {
      throw new Error('Expected mouse down handler registration');
    }

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handleMouseDown({
      target: { position: { lineNumber: 8, column: 2 } },
      event: {
        metaKey: true,
        browserEvent: { detail: 1 },
        preventDefault,
        stopPropagation,
      },
    } as unknown as MonacoEditor.IEditorMouseEvent);

    expect(toggleFoldStartMock).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
