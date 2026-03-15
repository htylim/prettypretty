import { fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import { registerInlineFoldControls } from '../../../../src/renderer/output/inlineFoldControls';

const { getVisibleFoldStartLinesMock, applyFoldStartChildrenActionMock, toggleFoldStartMock } =
  vi.hoisted(() => ({
    getVisibleFoldStartLinesMock: vi.fn(),
    applyFoldStartChildrenActionMock: vi.fn(),
    toggleFoldStartMock: vi.fn(),
  }));

vi.mock('../../../../src/renderer/editor/monacoFolding', () => ({
  applyFoldStartChildrenAction: applyFoldStartChildrenActionMock,
  getVisibleFoldStartLines: getVisibleFoldStartLinesMock,
  toggleFoldStart: toggleFoldStartMock,
}));

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createEditor = (): {
  editor: MonacoEditor.IStandaloneCodeEditor;
  widgets: Map<string, MonacoEditor.IContentWidget>;
  listeners: Record<string, (() => void) | null>;
  disposeSpies: Record<string, ReturnType<typeof vi.fn>>;
  addContentWidgetMock: ReturnType<typeof vi.fn>;
  removeContentWidgetMock: ReturnType<typeof vi.fn>;
  layoutContentWidgetMock: ReturnType<typeof vi.fn>;
} => {
  const widgets = new Map<string, MonacoEditor.IContentWidget>();
  const listeners: Record<string, (() => void) | null> = {
    scroll: null,
    layout: null,
    hiddenAreas: null,
    model: null,
    modelContent: null,
    modelDecorations: null,
    modelLanguage: null,
  };
  const disposeSpies = {
    scroll: vi.fn(),
    layout: vi.fn(),
    hiddenAreas: vi.fn(),
    model: vi.fn(),
    modelContent: vi.fn(),
    modelDecorations: vi.fn(),
    modelLanguage: vi.fn(),
  };
  const addContentWidgetMock = vi.fn((widget: MonacoEditor.IContentWidget) => {
    widgets.set(widget.getId(), widget);
  });
  const removeContentWidgetMock = vi.fn((widget: MonacoEditor.IContentWidget) => {
    widgets.delete(widget.getId());
  });
  const layoutContentWidgetMock = vi.fn();

  const editor = {
    getModel: () =>
      ({
        getLineMaxColumn: (lineNumber: number) => lineNumber + 10,
      }) as MonacoEditor.ITextModel,
    addContentWidget: addContentWidgetMock,
    removeContentWidget: removeContentWidgetMock,
    layoutContentWidget: layoutContentWidgetMock,
    onDidScrollChange: (listener: () => void) => {
      listeners.scroll = listener;
      return { dispose: disposeSpies.scroll };
    },
    onDidLayoutChange: (listener: () => void) => {
      listeners.layout = listener;
      return { dispose: disposeSpies.layout };
    },
    onDidChangeHiddenAreas: (listener: () => void) => {
      listeners.hiddenAreas = listener;
      return { dispose: disposeSpies.hiddenAreas };
    },
    onDidChangeModel: (listener: () => void) => {
      listeners.model = listener;
      return { dispose: disposeSpies.model };
    },
    onDidChangeModelContent: (listener: () => void) => {
      listeners.modelContent = listener;
      return { dispose: disposeSpies.modelContent };
    },
    onDidChangeModelDecorations: (listener: () => void) => {
      listeners.modelDecorations = listener;
      return { dispose: disposeSpies.modelDecorations };
    },
    onDidChangeModelLanguage: (listener: () => void) => {
      listeners.modelLanguage = listener;
      return { dispose: disposeSpies.modelLanguage };
    },
  } as unknown as MonacoEditor.IStandaloneCodeEditor;

  return {
    editor,
    widgets,
    listeners,
    disposeSpies,
    addContentWidgetMock,
    removeContentWidgetMock,
    layoutContentWidgetMock,
  };
};

describe('inlineFoldControls', () => {
  beforeEach(() => {
    getVisibleFoldStartLinesMock.mockReset();
    applyFoldStartChildrenActionMock.mockReset().mockResolvedValue(true);
    toggleFoldStartMock.mockReset().mockReturnValue(true);
  });

  it('creates widgets for visible fold-start lines only', async () => {
    const { editor, widgets, addContentWidgetMock } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([
      { lineNumber: 2, endLineNumber: 6, isCollapsed: false, childToggleAction: null },
      { lineNumber: 9, endLineNumber: 14, isCollapsed: true, childToggleAction: null },
    ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    expect(addContentWidgetMock).toHaveBeenCalledTimes(2);
    expect([...widgets.keys()]).toEqual([
      'output-inline-fold-control:2',
      'output-inline-fold-control:9',
    ]);

    registration.dispose();
  });

  it('keeps widgets inside the editor content layer so horizontal scroll moves with code', async () => {
    const { editor, widgets } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([
      { lineNumber: 2, endLineNumber: 6, isCollapsed: false, childToggleAction: null },
    ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    const widget = widgets.get('output-inline-fold-control:2');
    if (!widget) {
      throw new Error('Expected inline fold widget');
    }

    expect(widget.allowEditorOverflow).toBe(false);

    registration.dispose();
  });

  it('does not create widgets when there are no visible fold starts', async () => {
    const { editor, widgets, addContentWidgetMock } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    expect(addContentWidgetMock).not.toHaveBeenCalled();
    expect(widgets.size).toBe(0);

    registration.dispose();
  });

  it('clicking a widget toggles fold through the shared folding path', async () => {
    const { editor, widgets } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([
      { lineNumber: 4, endLineNumber: 8, isCollapsed: false, childToggleAction: null },
    ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    const widget = widgets.get('output-inline-fold-control:4');
    if (!widget) {
      throw new Error('Expected inline fold widget');
    }

    const button = widget.getDomNode().querySelector('[data-testid="output-inline-fold-control"]');
    if (!button) {
      throw new Error('Expected inline fold button');
    }

    fireEvent.click(button);

    expect(toggleFoldStartMock).toHaveBeenCalledWith(editor, 4);

    registration.dispose();
  });

  it('clicking the dedicated child widget updates only direct child fold state', async () => {
    const { editor, widgets } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([
      { lineNumber: 4, endLineNumber: 8, isCollapsed: false, childToggleAction: 'expand' },
    ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    const widget = widgets.get('output-inline-fold-control:4');
    if (!widget) {
      throw new Error('Expected inline fold widget');
    }

    const button = widget
      .getDomNode()
      .querySelector('[data-testid="output-inline-fold-children-control"]');
    if (!button) {
      throw new Error('Expected inline child fold button');
    }

    fireEvent.click(button);
    await flushAsync();

    expect(applyFoldStartChildrenActionMock).toHaveBeenCalledWith(editor, 4, 'expand');
    expect(toggleFoldStartMock).not.toHaveBeenCalled();

    registration.dispose();
  });

  it('renders the child button disabled when there is no direct child fold action', async () => {
    const { editor, widgets } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([
      { lineNumber: 2, endLineNumber: 6, isCollapsed: false, childToggleAction: null },
    ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    const widget = widgets.get('output-inline-fold-control:2');
    if (!widget) {
      throw new Error('Expected inline fold widget');
    }

    const childButton = widget
      .getDomNode()
      .querySelector('[data-testid="output-inline-fold-children-control"]');
    if (!childButton) {
      throw new Error('Expected inline child fold button');
    }

    expect(childButton).toBeDisabled();
    expect(childButton).toHaveAttribute('data-line-number', '2');
    expect(childButton).toHaveAttribute('data-fold-action', 'none');
    expect(childButton).toHaveAttribute('aria-label', 'No direct child blocks at line 2');
    expect(childButton).toHaveTextContent('-');

    fireEvent.click(childButton);

    expect(applyFoldStartChildrenActionMock).not.toHaveBeenCalled();

    registration.dispose();
  });

  it('renders separate child-button state and refreshes it from direct child fold state', async () => {
    const { editor, widgets, listeners } = createEditor();
    getVisibleFoldStartLinesMock
      .mockResolvedValueOnce([
        { lineNumber: 2, endLineNumber: 6, isCollapsed: false, childToggleAction: 'collapse' },
      ])
      .mockResolvedValueOnce([
        { lineNumber: 2, endLineNumber: 6, isCollapsed: false, childToggleAction: 'expand' },
      ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    const widget = widgets.get('output-inline-fold-control:2');
    if (!widget) {
      throw new Error('Expected inline fold widget');
    }

    const selfButton = widget
      .getDomNode()
      .querySelector('[data-testid="output-inline-fold-control"]');
    const childButton = widget
      .getDomNode()
      .querySelector('[data-testid="output-inline-fold-children-control"]');
    if (!selfButton || !childButton) {
      throw new Error('Expected inline fold buttons');
    }

    expect(selfButton).toHaveAttribute('data-fold-action', 'collapse');
    expect(selfButton).toHaveAttribute('data-fold-action-scope', 'self');
    expect(selfButton).toHaveAttribute('aria-expanded', 'true');
    expect(selfButton).toHaveTextContent('-');
    expect(childButton).toBeEnabled();
    expect(childButton).toHaveAttribute('data-fold-action', 'collapse');
    expect(childButton).toHaveAttribute('data-fold-action-scope', 'children');
    expect(childButton).toHaveAttribute('aria-label', 'Collapse direct child blocks at line 2');
    expect(childButton).toHaveTextContent('-');

    listeners.hiddenAreas?.();
    await flushAsync();

    expect(childButton).toHaveAttribute('data-fold-action', 'expand');
    expect(childButton).toHaveAttribute('aria-label', 'Expand direct child blocks at line 2');
    expect(childButton).toHaveTextContent('+');

    registration.dispose();
  });

  it('refreshes widget state after hidden-area changes', async () => {
    const { editor, widgets, listeners, layoutContentWidgetMock } = createEditor();
    getVisibleFoldStartLinesMock
      .mockResolvedValueOnce([
        { lineNumber: 2, endLineNumber: 6, isCollapsed: false, childToggleAction: null },
      ])
      .mockResolvedValueOnce([
        { lineNumber: 2, endLineNumber: 6, isCollapsed: true, childToggleAction: null },
      ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();

    const widget = widgets.get('output-inline-fold-control:2');
    if (!widget) {
      throw new Error('Expected inline fold widget');
    }

    const button = widget.getDomNode().querySelector('[data-testid="output-inline-fold-control"]');
    if (!button) {
      throw new Error('Expected inline fold button');
    }

    expect(button).toHaveTextContent('-');
    expect(button).toHaveAttribute('aria-expanded', 'true');

    listeners.hiddenAreas?.();
    await flushAsync();

    expect(button).toHaveTextContent('+');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(layoutContentWidgetMock).toHaveBeenCalled();

    registration.dispose();
  });

  it('disposes listeners and widgets cleanly', async () => {
    const { editor, widgets, disposeSpies, removeContentWidgetMock } = createEditor();
    getVisibleFoldStartLinesMock.mockResolvedValue([
      { lineNumber: 3, endLineNumber: 7, isCollapsed: false, childToggleAction: null },
    ]);

    const registration = registerInlineFoldControls(editor);
    await flushAsync();
    expect(widgets.size).toBe(1);

    registration.dispose();

    expect(removeContentWidgetMock).toHaveBeenCalledTimes(1);
    expect(widgets.size).toBe(0);
    expect(disposeSpies.scroll).toHaveBeenCalledTimes(1);
    expect(disposeSpies.layout).toHaveBeenCalledTimes(1);
    expect(disposeSpies.hiddenAreas).toHaveBeenCalledTimes(1);
    expect(disposeSpies.model).toHaveBeenCalledTimes(1);
    expect(disposeSpies.modelContent).toHaveBeenCalledTimes(1);
    expect(disposeSpies.modelDecorations).toHaveBeenCalledTimes(1);
    expect(disposeSpies.modelLanguage).toHaveBeenCalledTimes(1);
  });
});
