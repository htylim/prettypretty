import type { editor as MonacoEditor } from 'monaco-editor';
import {
  applyFoldStartChildrenAction,
  getVisibleFoldStartLines,
  toggleFoldStart,
  type FoldToggleAction,
  type FoldStart,
} from '../editor/monacoFolding';

const INLINE_FOLD_CONTROL_OVERSCAN_LINES = 2;
const CONTENT_WIDGET_POSITION_PREFERENCE_EXACT = 0;

type FoldWidget = MonacoEditor.IContentWidget & {
  dispose: () => void;
  update: (foldStart: FoldStart) => void;
};

type FoldControlActionScope = 'self' | 'children';

const getSelfToggleAction = (foldStart: FoldStart): FoldToggleAction =>
  foldStart.isCollapsed ? 'expand' : 'collapse';

const getFoldControlAction = (
  foldStart: FoldStart,
  actionScope: FoldControlActionScope,
): FoldToggleAction =>
  actionScope === 'children'
    ? (foldStart.childToggleAction ?? 'collapse')
    : getSelfToggleAction(foldStart);

const getFoldControlGlyph = (action: FoldToggleAction): string => (action === 'expand' ? '+' : '-');

const createSelfFoldControlLabel = (foldStart: FoldStart): string =>
  getSelfToggleAction(foldStart) === 'expand'
    ? `Expand folded block at line ${foldStart.lineNumber}`
    : `Collapse folded block at line ${foldStart.lineNumber}`;

const createChildFoldControlLabel = (foldStart: FoldStart, action: FoldToggleAction): string =>
  action === 'expand'
    ? `Expand direct child blocks at line ${foldStart.lineNumber}`
    : `Collapse direct child blocks at line ${foldStart.lineNumber}`;

const createDisabledChildFoldControlLabel = (foldStart: FoldStart): string =>
  `No direct child blocks at line ${foldStart.lineNumber}`;

const stopMouseDownPropagation = (event: MouseEvent): void => {
  event.stopPropagation();
  if (event.ctrlKey) {
    event.preventDefault();
  }
};

const stopContextMenu = (event: MouseEvent): void => {
  event.preventDefault();
  event.stopPropagation();
};

const runButtonAction = (event: MouseEvent, action: () => void): void => {
  event.preventDefault();
  event.stopPropagation();
  action();
};

const createFoldControlButton = (
  scope: FoldControlActionScope,
  action: () => void,
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'output-inline-fold-control';
  button.setAttribute(
    'data-testid',
    scope === 'self' ? 'output-inline-fold-control' : 'output-inline-fold-children-control',
  );
  button.setAttribute('data-fold-action-scope', scope);
  button.setAttribute('data-fold-control-kind', scope);
  button.addEventListener('mousedown', stopMouseDownPropagation);
  button.addEventListener('click', (event: MouseEvent) => {
    runButtonAction(event, action);
  });
  button.addEventListener('contextmenu', stopContextMenu);
  return button;
};

const createFoldWidget = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  initialFoldStart: FoldStart,
  refresh: () => void,
): FoldWidget => {
  let foldStart = initialFoldStart;
  const domNode = document.createElement('div');
  domNode.className = 'output-inline-fold-control-widget';
  const buttonRow = document.createElement('div');
  buttonRow.className = 'output-inline-fold-control-row';
  const runSelfToggleAction = (): void => {
    if (!toggleFoldStart(editor, foldStart.lineNumber)) {
      return;
    }

    refresh();
  };
  const runChildToggleAction = (): void => {
    const childToggleAction = foldStart.childToggleAction;
    if (!childToggleAction) {
      return;
    }

    void applyFoldStartChildrenAction(editor, foldStart.lineNumber, childToggleAction).then(
      (didUpdate) => {
        if (!didUpdate) {
          return;
        }

        refresh();
      },
    );
  };

  const selfButton = createFoldControlButton('self', runSelfToggleAction);
  const childButton = createFoldControlButton('children', runChildToggleAction);

  buttonRow.append(selfButton, childButton);
  domNode.append(buttonRow);

  const updateButtons = (): void => {
    const selfAction = getSelfToggleAction(foldStart);
    selfButton.textContent = getFoldControlGlyph(selfAction);
    selfButton.setAttribute('data-line-number', String(foldStart.lineNumber));
    selfButton.setAttribute('data-fold-state', foldStart.isCollapsed ? 'collapsed' : 'expanded');
    selfButton.setAttribute('data-fold-action', selfAction);
    selfButton.setAttribute('aria-expanded', String(!foldStart.isCollapsed));
    selfButton.setAttribute('aria-label', createSelfFoldControlLabel(foldStart));
    selfButton.title = createSelfFoldControlLabel(foldStart);

    const childAction = foldStart.childToggleAction;
    if (childAction === null) {
      childButton.disabled = true;
      childButton.textContent = '-';
      childButton.setAttribute('data-line-number', String(foldStart.lineNumber));
      childButton.setAttribute('data-fold-action', 'none');
      childButton.setAttribute('aria-label', createDisabledChildFoldControlLabel(foldStart));
      childButton.title = createDisabledChildFoldControlLabel(foldStart);
      return;
    }

    childButton.disabled = false;
    childButton.textContent = getFoldControlGlyph(getFoldControlAction(foldStart, 'children'));
    childButton.setAttribute('data-line-number', String(foldStart.lineNumber));
    childButton.setAttribute('data-fold-action', childAction);
    childButton.setAttribute('aria-label', createChildFoldControlLabel(foldStart, childAction));
    childButton.title = createChildFoldControlLabel(foldStart, childAction);
  };

  const widget: FoldWidget = {
    // Monaco's exact-position overflowing content widgets ignore horizontal scroll.
    // Keep fold controls inside the scrollable content layer so they stay code-anchored.
    allowEditorOverflow: false,
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
      updateButtons();
      editor.layoutContentWidget(widget);
    },
    dispose: () => {
      domNode.replaceWith();
    },
  };

  updateButtons();
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
