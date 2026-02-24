import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

type MonacoWorkerFactory = () => Worker;

type MonacoEnvironmentConfig = {
  getWorker: (_moduleId: string, label: string) => Worker;
};

declare global {
  interface Window {
    MonacoEnvironment?: MonacoEnvironmentConfig;
  }
}

let isMonacoConfigured = false;

const createWorkerFactory = (label: string): MonacoWorkerFactory => {
  switch (label) {
    case 'json':
      return () => new jsonWorker();
    case 'css':
    case 'scss':
    case 'less':
      return () => new cssWorker();
    case 'html':
    case 'handlebars':
    case 'razor':
      return () => new htmlWorker();
    case 'typescript':
    case 'javascript':
      return () => new tsWorker();
    default:
      return () => new editorWorker();
  }
};

export const configureMonaco = (): void => {
  if (isMonacoConfigured || typeof window === 'undefined') {
    return;
  }

  window.MonacoEnvironment = {
    getWorker: (_moduleId, label) => createWorkerFactory(label)(),
  };

  isMonacoConfigured = true;
};
