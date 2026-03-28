import type { IRange, editor as MonacoEditor } from 'monaco-editor';
import { configureMonaco } from './configureMonaco';
import { registerGraphqlLanguage } from './registerGraphqlLanguage';
import { registerMonacoThemes } from './monacoThemes';

type HiddenAreaCapableEditor = MonacoEditor.IStandaloneCodeEditor & {
  setHiddenAreas?: (ranges: IRange[], source?: unknown, forceUpdate?: boolean) => void;
};

const MAX_VIEW_STATE_ENTRIES = 120;

const viewStateByKey = new Map<string, MonacoEditor.ICodeEditorViewState | null>();
const modelReferenceCounts = new Map<string, number>();
let monacoModule: typeof import('monaco-editor') | null = null;

const cacheViewState = (
  viewStateKey: string,
  viewState: MonacoEditor.ICodeEditorViewState | null,
): void => {
  if (viewStateByKey.has(viewStateKey)) {
    viewStateByKey.delete(viewStateKey);
  }

  viewStateByKey.set(viewStateKey, viewState);

  while (viewStateByKey.size > MAX_VIEW_STATE_ENTRIES) {
    const oldestViewStateKey = viewStateByKey.keys().next().value;
    if (!oldestViewStateKey) {
      return;
    }

    viewStateByKey.delete(oldestViewStateKey);
  }
};

export const prepareMonacoEditorRuntime = (monaco: typeof import('monaco-editor')): void => {
  monacoModule = monaco;
  configureMonaco();
  registerGraphqlLanguage(monaco);
  registerMonacoThemes(monaco);
};

export const saveEditorViewState = (
  viewStateKey: string,
  editor: MonacoEditor.IStandaloneCodeEditor,
): void => {
  cacheViewState(viewStateKey, editor.saveViewState());
};

export const restoreEditorViewState = (
  viewStateKey: string,
  editor: MonacoEditor.IStandaloneCodeEditor,
  options: {
    hiddenAreaResetSource: object;
  },
): void => {
  const savedViewState = viewStateByKey.get(viewStateKey) ?? null;
  if (savedViewState) {
    cacheViewState(viewStateKey, savedViewState);
    editor.restoreViewState(savedViewState);
    return;
  }

  (editor as HiddenAreaCapableEditor).setHiddenAreas?.([], options.hiddenAreaResetSource, true);
  editor.setScrollTop(0);
  editor.setScrollLeft(0);
  editor.setPosition({ lineNumber: 1, column: 1 });
};

export const retainSharedEditorModel = (modelPath: string): void => {
  modelReferenceCounts.set(modelPath, (modelReferenceCounts.get(modelPath) ?? 0) + 1);
};

export const releaseSharedEditorModel = (modelPath: string): void => {
  const currentReferenceCount = modelReferenceCounts.get(modelPath) ?? 0;
  if (currentReferenceCount <= 1) {
    modelReferenceCounts.delete(modelPath);
    globalThis.queueMicrotask(() => {
      if ((modelReferenceCounts.get(modelPath) ?? 0) > 0) {
        return;
      }

      const model = monacoModule?.editor.getModel(monacoModule.Uri.parse(modelPath));
      model?.dispose();
    });
    return;
  }

  modelReferenceCounts.set(modelPath, currentReferenceCount - 1);
};
