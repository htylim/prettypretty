import type { editor as MonacoEditor } from 'monaco-editor';
import { getVisibleFoldStartLines, toggleFoldStart, type FoldStart } from '../editor/monacoFolding';

const INLINE_FOLD_CONTROL_OVERSCAN_LINES = 2;
const CONTENT_WIDGET_POSITION_PREFERENCE_EXACT = 0;

type FoldWidget = MonacoEditor.IContentWidget & {
  dispose: () => void;
  update: (foldStart: FoldStart) => void;
};

const createFoldControlLabel = (foldStart: FoldStart): string =>
  foldStart.isCollapsed
    ? `Expand folded block at line ${foldStart.lineNumber}`
    : `Collapse folded block at line ${foldStart.lineNumber}`;

const createFoldWidget = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  initialFoldStart: FoldStart,
  refresh: () => void,
): FoldWidget => {
  let foldStart = initialFoldStart;
  const domNode = document.createElement('div');
  domNode.className = 'output-inline-fold-control-widget';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'output-inline-fold-control';
  button.setAttribute('data-testid', 'output-inline-fold-control');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!toggleFoldStart(editor, foldStart.lineNumber)) {
      return;
    }

    refresh();
  });

  domNode.append(button);

  const updateButton = (): void => {
    button.textContent = foldStart.isCollapsed ? '+' : '-';
    button.setAttribute('data-fold-state', foldStart.isCollapsed ? 'collapsed' : 'expanded');
    button.setAttribute('aria-expanded', String(!foldStart.isCollapsed));
    button.setAttribute('aria-label', createFoldControlLabel(foldStart));
    button.title = createFoldControlLabel(foldStart);
  };

  const widget: FoldWidget = {
    allowEditorOverflow: true,
    suppressMouseDown: true,
    getId: () => `output-inline-fold-control:${foldStart.lineNumber}`,
    getDomNode: () => domNode,
    getPosition: () => {
      const model = editor.getModel();
      if (!model) {
        return null;
      }

      return {
        position: {
          lineNumber: foldStart.lineNumber,
          column: model.getLineMaxColumn(foldStart.lineNumber),
        },
        preference: [CONTENT_WIDGET_POSITION_PREFERENCE_EXACT],
      };
    },
    update: (nextFoldStart) => {
      foldStart = nextFoldStart;
      updateButton();
      editor.layoutContentWidget(widget);
    },
    dispose: () => {
      button.replaceWith();
    },
  };

  updateButton();
  return widget;
};

const syncWidgets = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  widgetsByLine: Map<number, FoldWidget>,
  foldStarts: FoldStart[],
  refresh: () => void,
): void => {
  const nextLineNumbers = new Set(foldStarts.map(({ lineNumber }) => lineNumber));

  for (const [lineNumber, widget] of widgetsByLine) {
    if (nextLineNumbers.has(lineNumber)) {
      continue;
    }

    editor.removeContentWidget(widget);
    widget.dispose();
    widgetsByLine.delete(lineNumber);
  }

  for (const foldStart of foldStarts) {
    const existingWidget = widgetsByLine.get(foldStart.lineNumber);
    if (existingWidget) {
      existingWidget.update(foldStart);
      continue;
    }

    const widget = createFoldWidget(editor, foldStart, refresh);
    widgetsByLine.set(foldStart.lineNumber, widget);
    editor.addContentWidget(widget);
  }
};

export const registerInlineFoldControls = (
  editor: MonacoEditor.IStandaloneCodeEditor,
): { dispose: () => void } => {
  const disposables: Array<{ dispose: () => void }> = [];
  const widgetsByLine = new Map<number, FoldWidget>();
  let disposed = false;
  let refreshSequence = 0;

  const disposeWidgets = (): void => {
    for (const widget of widgetsByLine.values()) {
      editor.removeContentWidget(widget);
      widget.dispose();
    }
    widgetsByLine.clear();
  };

  const refresh = (): void => {
    const sequence = ++refreshSequence;
    void getVisibleFoldStartLines(editor, INLINE_FOLD_CONTROL_OVERSCAN_LINES).then((foldStarts) => {
      if (disposed || sequence !== refreshSequence) {
        return;
      }

      syncWidgets(editor, widgetsByLine, foldStarts, refresh);
    });
  };

  disposables.push(editor.onDidScrollChange(refresh));
  disposables.push(editor.onDidLayoutChange(refresh));
  disposables.push(editor.onDidChangeHiddenAreas(refresh));
  disposables.push(editor.onDidChangeModel(refresh));
  disposables.push(editor.onDidChangeModelContent(refresh));
  disposables.push(editor.onDidChangeModelDecorations(refresh));
  disposables.push(editor.onDidChangeModelLanguage(refresh));

  refresh();

  return {
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      for (const disposable of disposables) {
        disposable.dispose();
      }
      disposeWidgets();
    },
  };
};
