import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerMocks = vi.hoisted(() => {
  class EditorWorker {}
  class CssWorker {}
  class HtmlWorker {}
  class JsonWorker {}
  class TsWorker {}

  return {
    EditorWorker,
    CssWorker,
    HtmlWorker,
    JsonWorker,
    TsWorker,
  };
});

vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({
  default: workerMocks.EditorWorker,
}));

vi.mock('monaco-editor/esm/vs/language/css/css.worker?worker', () => ({
  default: workerMocks.CssWorker,
}));

vi.mock('monaco-editor/esm/vs/language/html/html.worker?worker', () => ({
  default: workerMocks.HtmlWorker,
}));

vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({
  default: workerMocks.JsonWorker,
}));

vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({
  default: workerMocks.TsWorker,
}));

describe('configureMonaco', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as Window & { MonacoEnvironment?: unknown }).MonacoEnvironment;
  });

  it('registers MonacoEnvironment worker routing once', async () => {
    const { configureMonaco } = await import('../../../../src/renderer/output/configureMonaco');

    configureMonaco();
    configureMonaco();

    const environment = (
      window as Window & {
        MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => unknown };
      }
    ).MonacoEnvironment;
    expect(environment).toBeDefined();
    expect(environment?.getWorker('', 'json')).toBeInstanceOf(workerMocks.JsonWorker);
    expect(environment?.getWorker('', 'css')).toBeInstanceOf(workerMocks.CssWorker);
    expect(environment?.getWorker('', 'html')).toBeInstanceOf(workerMocks.HtmlWorker);
    expect(environment?.getWorker('', 'typescript')).toBeInstanceOf(workerMocks.TsWorker);
    expect(environment?.getWorker('', 'other')).toBeInstanceOf(workerMocks.EditorWorker);
  });
});
