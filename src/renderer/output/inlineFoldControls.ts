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
  setCtrlHintVisible: (isVisible: boolean) => void;
  update: (foldStart: FoldStart) => void;
};

type CtrlHintSubscriber = (isCtrlHintVisible: boolean) => void;
type FoldControlActionScope = 'self' | 'children';

const ctrlHintSubscribers = new Set<CtrlHintSubscriber>();
let ctrlHintDocument: Document | null = null;
let ctrlHintWindow: Window | null = null;
let isCtrlHintVisible = false;

const getSelfToggleAction = (foldStart: FoldStart): FoldToggleAction =>
  foldStart.isCollapsed ? 'expand' : 'collapse';

const getFoldControlActionScope = (
  foldStart: FoldStart,
  isCtrlMode: boolean,
): FoldControlActionScope =>
  isCtrlMode && foldStart.childToggleAction !== null ? 'children' : 'self';

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

const createFoldControlLabel = (foldStart: FoldStart, isCtrlMode: boolean): string => {
  const actionScope = getFoldControlActionScope(foldStart, isCtrlMode);
  if (actionScope === 'children') {
    return createChildFoldControlLabel(foldStart, getFoldControlAction(foldStart, actionScope));
  }

  return createSelfFoldControlLabel(foldStart);
};

const createFoldControlTitle = (foldStart: FoldStart, isCtrlMode: boolean): string => {
  const label = createFoldControlLabel(foldStart, isCtrlMode);
  if (isCtrlMode || foldStart.childToggleAction === null) {
    return label;
  }

  return `${label}. Ctrl+click ${
    foldStart.childToggleAction === 'expand' ? 'expands' : 'collapses'
  } direct child blocks.`;
};

const notifyCtrlHintSubscribers = (): void => {
  for (const subscriber of ctrlHintSubscribers) {
    subscriber(isCtrlHintVisible);
  }
};

const setCtrlHintVisible = (nextValue: boolean): void => {
  if (isCtrlHintVisible === nextValue) {
    return;
  }

  isCtrlHintVisible = nextValue;
  notifyCtrlHintSubscribers();
};

const handleCtrlHintKeyboardEvent = (event: KeyboardEvent): void => {
  setCtrlHintVisible(event.ctrlKey);
};

const handleCtrlHintVisibilityChange = (): void => {
  if (!ctrlHintDocument?.hidden) {
    return;
  }

  setCtrlHintVisible(false);
};

const handleCtrlHintWindowBlur = (): void => {
  setCtrlHintVisible(false);
};

const detachCtrlHintListeners = (): void => {
  if (!ctrlHintWindow || !ctrlHintDocument) {
    return;
  }

  ctrlHintWindow.removeEventListener('keydown', handleCtrlHintKeyboardEvent, true);
  ctrlHintWindow.removeEventListener('keyup', handleCtrlHintKeyboardEvent, true);
  ctrlHintWindow.removeEventListener('blur', handleCtrlHintWindowBlur);
  ctrlHintDocument.removeEventListener('visibilitychange', handleCtrlHintVisibilityChange);
  ctrlHintWindow = null;
  ctrlHintDocument = null;
  isCtrlHintVisible = false;
};

const ensureCtrlHintListeners = (targetDocument: Document): void => {
  const targetWindow = targetDocument.defaultView;
  if (!targetWindow || (ctrlHintWindow === targetWindow && ctrlHintDocument === targetDocument)) {
    return;
  }

  detachCtrlHintListeners();
  ctrlHintWindow = targetWindow;
  ctrlHintDocument = targetDocument;
  targetWindow.addEventListener('keydown', handleCtrlHintKeyboardEvent, true);
  targetWindow.addEventListener('keyup', handleCtrlHintKeyboardEvent, true);
  targetWindow.addEventListener('blur', handleCtrlHintWindowBlur);
  targetDocument.addEventListener('visibilitychange', handleCtrlHintVisibilityChange);
};

const registerCtrlHintSubscriber = (
  targetDocument: Document,
  subscriber: CtrlHintSubscriber,
): { dispose: () => void } => {
  ensureCtrlHintListeners(targetDocument);
  ctrlHintSubscribers.add(subscriber);
  subscriber(isCtrlHintVisible);

  return {
    dispose: () => {
      ctrlHintSubscribers.delete(subscriber);
      if (ctrlHintSubscribers.size === 0) {
        detachCtrlHintListeners();
      }
    },
  };
};

const createFoldWidget = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  initialFoldStart: FoldStart,
  refresh: () => void,
): FoldWidget => {
  let foldStart = initialFoldStart;
  let ctrlHintVisible = isCtrlHintVisible;
  let skipNextCtrlClick = false;
  const domNode = document.createElement('div');
  domNode.className = 'output-inline-fold-control-widget';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'output-inline-fold-control';
  button.setAttribute('data-testid', 'output-inline-fold-control');
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
  button.addEventListener('mousedown', (event: MouseEvent) => {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    skipNextCtrlClick = true;
    button.ownerDocument.defaultView?.setTimeout(() => {
      skipNextCtrlClick = false;
    }, 0);
    runChildToggleAction();
  });
  button.addEventListener('click', (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.ctrlKey) {
      if (skipNextCtrlClick) {
        skipNextCtrlClick = false;
        return;
      }

      runChildToggleAction();
      return;
    }

    runSelfToggleAction();
  });
  button.addEventListener('contextmenu', (event: MouseEvent) => {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  });

  domNode.append(button);

  const updateButton = (): void => {
    const actionScope = getFoldControlActionScope(foldStart, ctrlHintVisible);
    const activeAction = getFoldControlAction(foldStart, actionScope);
    const showsCtrlHint = actionScope === 'children';

    button.textContent = getFoldControlGlyph(activeAction);
    button.setAttribute('data-line-number', String(foldStart.lineNumber));
    button.setAttribute('data-fold-state', foldStart.isCollapsed ? 'collapsed' : 'expanded');
    button.setAttribute('data-fold-action', activeAction);
    button.setAttribute('data-fold-action-scope', actionScope);
    button.setAttribute('data-ctrl-hint', showsCtrlHint ? 'true' : 'false');
    if (actionScope === 'self') {
      button.setAttribute('aria-expanded', String(!foldStart.isCollapsed));
    } else {
      button.removeAttribute('aria-expanded');
    }
    button.setAttribute('aria-label', createFoldControlLabel(foldStart, ctrlHintVisible));
    button.title = createFoldControlTitle(foldStart, ctrlHintVisible);
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
    setCtrlHintVisible: (isVisible) => {
      ctrlHintVisible = isVisible;
      updateButton();
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

  const ctrlHintSubscription = registerCtrlHintSubscriber(document, (nextCtrlHintVisible) => {
    for (const widget of widgetsByLine.values()) {
      widget.setCtrlHintVisible(nextCtrlHintVisible);
    }
  });

  disposables.push(ctrlHintSubscription);
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
