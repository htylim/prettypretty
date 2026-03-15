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

const getSelfToggleAction = (foldStart: FoldStart): FoldToggleAction =>
  foldStart.isCollapsed ? 'expand' : 'collapse';

const getFoldControlGlyph = (action: FoldToggleAction, scope: 'self' | 'children'): string => {
  if (scope === 'children') {
    return action === 'expand'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h6"/><path d="M7 9v6"/><path d="M14 12h6"/><path d="M17 9v6"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h6"/><path d="M14 12h6"/></svg>`;
  }
  return action === 'expand'
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;
};

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

const stopContextMenu = (event: MouseEvent): void => {
  event.preventDefault();
  event.stopPropagation();
};

const runButtonAction = (event: MouseEvent, action: () => void): void => {
  event.preventDefault();
  event.stopPropagation();
  action();
};

const createFoldControlButton = (action: (event: MouseEvent) => void): HTMLButtonElement => {
  const button = document.createElement('button');
  let shouldIgnoreNextClick = false;
  button.type = 'button';
  button.className = 'output-inline-fold-control';
  button.setAttribute('data-testid', 'output-inline-fold-control');
  button.addEventListener('mousedown', (event: MouseEvent) => {
    event.stopPropagation();
    if (!event.ctrlKey) {
      return;
    }

    shouldIgnoreNextClick = true;
    window.setTimeout(() => {
      shouldIgnoreNextClick = false;
    }, 0);
    runButtonAction(event, () => action(event));
  });
  button.addEventListener('click', (event: MouseEvent) => {
    if (shouldIgnoreNextClick) {
      shouldIgnoreNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    runButtonAction(event, () => action(event));
  });
  button.addEventListener('contextmenu', stopContextMenu);
  return button;
};

const createFoldWidget = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  initialFoldStart: FoldStart,
  getIsCtrlModifierActive: () => boolean,
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

  const controlButton = createFoldControlButton((event) => {
    const isCtrlModifierActive = event.ctrlKey || getIsCtrlModifierActive();
    if (isCtrlModifierActive) {
      if (foldStart.childToggleAction) {
        runChildToggleAction();
      }
      return;
    }

    runSelfToggleAction();
  });

  buttonRow.append(controlButton);
  domNode.append(buttonRow);

  const updateButton = (): void => {
    const isCtrlModifierActive = getIsCtrlModifierActive();
    const selfAction = getSelfToggleAction(foldStart);
    controlButton.setAttribute('data-line-number', String(foldStart.lineNumber));

    if (!isCtrlModifierActive) {
      controlButton.disabled = false;
      controlButton.innerHTML = getFoldControlGlyph(selfAction, 'self');
      controlButton.setAttribute(
        'data-fold-state',
        foldStart.isCollapsed ? 'collapsed' : 'expanded',
      );
      controlButton.setAttribute('data-fold-action', selfAction);
      controlButton.setAttribute('data-fold-action-scope', 'self');
      controlButton.setAttribute('data-fold-control-kind', 'self');
      controlButton.setAttribute('aria-expanded', String(!foldStart.isCollapsed));
      controlButton.setAttribute('aria-label', createSelfFoldControlLabel(foldStart));
      controlButton.title = createSelfFoldControlLabel(foldStart);
      return;
    }

    const childAction = foldStart.childToggleAction;
    controlButton.removeAttribute('aria-expanded');
    controlButton.setAttribute('data-fold-action-scope', 'children');
    controlButton.setAttribute('data-fold-control-kind', 'children');

    if (childAction === null) {
      controlButton.disabled = true;
      controlButton.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>`;
      controlButton.setAttribute('data-fold-action', 'none');
      controlButton.setAttribute('aria-label', createDisabledChildFoldControlLabel(foldStart));
      controlButton.title = createDisabledChildFoldControlLabel(foldStart);
      return;
    }

    controlButton.disabled = false;
    controlButton.innerHTML = getFoldControlGlyph(childAction, 'children');
    controlButton.setAttribute('data-fold-action', childAction);
    controlButton.setAttribute('aria-label', createChildFoldControlLabel(foldStart, childAction));
    controlButton.title = createChildFoldControlLabel(foldStart, childAction);
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
      updateButton();
      editor.layoutContentWidget(widget);
    },
    dispose: () => {
      domNode.replaceWith();
    },
  };

  updateButton();
  return widget;
};

const syncWidgets = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  widgetsByLine: Map<number, FoldWidget>,
  foldStarts: FoldStart[],
  getIsCtrlModifierActive: () => boolean,
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

    const widget = createFoldWidget(editor, foldStart, getIsCtrlModifierActive, refresh);
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
  let isCtrlModifierActive = false;
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

      syncWidgets(editor, widgetsByLine, foldStarts, () => isCtrlModifierActive, refresh);
    });
  };

  const setCtrlModifierActive = (nextIsCtrlModifierActive: boolean): void => {
    if (isCtrlModifierActive === nextIsCtrlModifierActive) {
      return;
    }

    isCtrlModifierActive = nextIsCtrlModifierActive;
    refresh();
  };

  disposables.push(editor.onDidScrollChange(refresh));
  disposables.push(editor.onDidLayoutChange(refresh));
  disposables.push(editor.onDidChangeHiddenAreas(refresh));
  disposables.push(editor.onDidChangeModel(refresh));
  disposables.push(editor.onDidChangeModelContent(refresh));
  disposables.push(editor.onDidChangeModelDecorations(refresh));
  disposables.push(editor.onDidChangeModelLanguage(refresh));
  const handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Control') {
      setCtrlModifierActive(true);
    }
  };
  const handleWindowKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Control') {
      setCtrlModifierActive(false);
    }
  };
  const handleWindowBlur = (): void => {
    setCtrlModifierActive(false);
  };

  window.addEventListener('keydown', handleWindowKeyDown);
  window.addEventListener('keyup', handleWindowKeyUp);
  window.addEventListener('blur', handleWindowBlur);
  disposables.push({
    dispose: () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    },
  });

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
