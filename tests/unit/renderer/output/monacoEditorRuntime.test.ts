import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';

const { configureMonacoMock, registerMonacoThemesMock } = vi.hoisted(() => ({
  configureMonacoMock: vi.fn(),
  registerMonacoThemesMock: vi.fn(),
}));

vi.mock('../../../../src/renderer/output/configureMonaco', () => ({
  configureMonaco: configureMonacoMock,
}));

vi.mock('../../../../src/renderer/output/monacoThemes', () => ({
  registerMonacoThemes: registerMonacoThemesMock,
}));

describe('monacoEditorRuntime', () => {
  beforeEach(() => {
    vi.resetModules();
    configureMonacoMock.mockClear();
    registerMonacoThemesMock.mockClear();
  });

  it('prepares Monaco exactly through the shared runtime seam', async () => {
    const runtime = await import('../../../../src/renderer/output/monacoEditorRuntime');
    const monaco = {
      editor: {
        getModel: vi.fn(),
      },
      Uri: {
        parse: vi.fn(),
      },
    } as unknown as typeof import('monaco-editor');

    runtime.prepareMonacoEditorRuntime(monaco);

    expect(configureMonacoMock).toHaveBeenCalledTimes(1);
    expect(registerMonacoThemesMock).toHaveBeenCalledWith(monaco);
  });

  it('stores pane view state by key and resets scroll when no state exists', async () => {
    const runtime = await import('../../../../src/renderer/output/monacoEditorRuntime');
    const savedViewState = {
      token: 'view-state-1',
    } as unknown as MonacoEditor.ICodeEditorViewState;
    const saveEditor = {
      saveViewState: vi.fn(() => savedViewState),
    } as unknown as MonacoEditor.IStandaloneCodeEditor;
    const restoreEditor = {
      restoreViewState: vi.fn(),
      setHiddenAreas: vi.fn(),
      setScrollTop: vi.fn(),
      setScrollLeft: vi.fn(),
      setPosition: vi.fn(),
    } as unknown as MonacoEditor.IStandaloneCodeEditor & {
      setHiddenAreas: ReturnType<typeof vi.fn>;
    };

    runtime.saveEditorViewState('pane-1', saveEditor);
    runtime.restoreEditorViewState('pane-1', restoreEditor, {
      hiddenAreaResetSource: {},
    });

    expect(restoreEditor.restoreViewState).toHaveBeenCalledWith(savedViewState);

    runtime.restoreEditorViewState('pane-missing', restoreEditor, {
      hiddenAreaResetSource: {},
    });

    expect(restoreEditor.setHiddenAreas).toHaveBeenCalledWith([], expect.any(Object), true);
    expect(restoreEditor.setScrollTop).toHaveBeenCalledWith(0);
    expect(restoreEditor.setScrollLeft).toHaveBeenCalledWith(0);
    expect(restoreEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 1, column: 1 });
  });

  it('disposes shared editor models only after the last reference is released', async () => {
    const runtime = await import('../../../../src/renderer/output/monacoEditorRuntime');
    const disposeModel = vi.fn();
    const parsePath = vi.fn((value: string) => value);
    const monaco = {
      editor: {
        getModel: vi.fn(() => ({ dispose: disposeModel })),
      },
      Uri: {
        parse: parsePath,
      },
    } as unknown as typeof import('monaco-editor');

    runtime.prepareMonacoEditorRuntime(monaco);
    runtime.retainSharedEditorModel('output://source/doc-1');
    runtime.retainSharedEditorModel('output://source/doc-1');

    runtime.releaseSharedEditorModel('output://source/doc-1');
    await Promise.resolve();
    expect(disposeModel).not.toHaveBeenCalled();

    runtime.releaseSharedEditorModel('output://source/doc-1');
    await Promise.resolve();

    expect(parsePath).toHaveBeenCalledWith('output://source/doc-1');
    expect(disposeModel).toHaveBeenCalledTimes(1);
  });
});
