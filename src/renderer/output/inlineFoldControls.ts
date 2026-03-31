import type { editor as MonacoEditor } from 'monaco-editor';
import {
  applyFoldStartChildrenAction,
  getVisibleFoldStartLines,
  toggleFoldStart,
  type FoldToggleAction,
  type FoldStart,
} from '../editor/monacoFolding';
import { areOutputPaneSourceRangesEqual, type OutputPaneSourceRange } from './outputRange';

const INLINE_FOLD_CONTROL_OVERSCAN_LINES = 2;
const CONTENT_WIDGET_POSITION_PREFERENCE_EXACT = 0;
const COLLAPSED_FOLD_PREVIEW_MAX_LENGTH = 60;
const COLLAPSED_FOLD_PREVIEW_MAX_LINES = 4;
const COLLAPSED_FOLD_PREVIEW_ELLIPSIS = ' ...';
const COLLAPSED_FOLD_PREVIEW_SKIP_LINE_PATTERN = /^[()[\]{}]+,?$/;

type FoldControlModifierMode = 'self' | 'children' | 'source-pane';

type RegisterInlineFoldControlsOptions = {
  getActiveExtractedSourceRange?: (() => OutputPaneSourceRange | null) | undefined;
  onToggleExtractedSourcePane?: ((foldStart: FoldStart) => void) | undefined;
};

const isControlModifierKey = (event: KeyboardEvent): boolean =>
  event.key === 'Control' || event.code === 'ControlLeft' || event.code === 'ControlRight';

const isShiftModifierKey = (event: KeyboardEvent): boolean =>
  event.key === 'Shift' || event.code === 'ShiftLeft' || event.code === 'ShiftRight';

type FoldWidget = MonacoEditor.IContentWidget & {
  dispose: () => void;
  update: (foldStart: FoldStart) => void;
};

type FoldPreview = {
  displayText: string;
  fullText: string;
};

const isFoldStartOpenInAdjacentPane = (
  foldStart: FoldStart,
  activeExtractedSourceRange: OutputPaneSourceRange | null,
): boolean => {
  return (
    foldStart.sourceRange !== null &&
    activeExtractedSourceRange !== null &&
    areOutputPaneSourceRangesEqual(foldStart.sourceRange, activeExtractedSourceRange)
  );
};

const resolveFoldControlMode = (
  foldStart: FoldStart,
  modifierMode: FoldControlModifierMode,
  activeExtractedSourceRange: OutputPaneSourceRange | null,
): FoldControlModifierMode => {
  return isFoldStartOpenInAdjacentPane(foldStart, activeExtractedSourceRange)
    ? 'source-pane'
    : modifierMode;
};

const getSelfToggleAction = (foldStart: FoldStart): FoldToggleAction =>
  foldStart.isCollapsed ? 'expand' : 'collapse';

const getFoldControlModifierMode = (
  isCtrlModifierActive: boolean,
  isShiftModifierActive: boolean,
): FoldControlModifierMode => {
  if (isCtrlModifierActive === isShiftModifierActive) {
    return 'self';
  }

  return isCtrlModifierActive ? 'children' : 'source-pane';
};

const getFoldControlGlyph = (
  action: FoldToggleAction | 'open-pane' | 'close-pane',
  scope: FoldControlModifierMode,
): string => {
  if (scope === 'children') {
    return action === 'expand'
      ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h6"/><path d="M7 9v6"/><path d="M14 12h6"/><path d="M17 9v6"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h6"/><path d="M14 12h6"/></svg>`;
  }
  if (scope === 'source-pane') {
    return action === 'open-pane'
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10"/><path d="M8 17h9V8"/></svg>`;
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

const createOpenSourcePaneLabel = (foldStart: FoldStart): string =>
  `Open block at line ${foldStart.lineNumber} in adjacent pane`;

const createCloseSourcePaneLabel = (foldStart: FoldStart): string =>
  `Close pane for block at line ${foldStart.lineNumber}`;

const normalizeFoldPreviewLine = (lineContent: string): string =>
  lineContent.trim().replace(/\s+/g, ' ');

const truncateFoldPreview = (previewText: string): string => {
  if (previewText.length <= COLLAPSED_FOLD_PREVIEW_MAX_LENGTH) {
    return previewText;
  }

  const hardLimit = Math.max(
    1,
    COLLAPSED_FOLD_PREVIEW_MAX_LENGTH - COLLAPSED_FOLD_PREVIEW_ELLIPSIS.length,
  );
  const softLimit = previewText.lastIndexOf(' ', hardLimit);
  const shouldUseSoftLimit = softLimit >= Math.max(1, hardLimit - 16);
  const cutIndex = shouldUseSoftLimit ? softLimit : hardLimit;
  return `${previewText.slice(0, cutIndex).trimEnd()}${COLLAPSED_FOLD_PREVIEW_ELLIPSIS}`;
};

const createCollapsedFoldPreview = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  foldStart: FoldStart,
): FoldPreview | null => {
  if (!foldStart.isCollapsed) {
    return null;
  }

  const model = editor.getModel();
  if (!model) {
    return null;
  }

  const previewSegments: string[] = [];
  for (
    let lineNumber = foldStart.lineNumber + 1;
    lineNumber <= foldStart.endLineNumber &&
    previewSegments.length < COLLAPSED_FOLD_PREVIEW_MAX_LINES;
    lineNumber += 1
  ) {
    const normalizedLine = normalizeFoldPreviewLine(model.getLineContent(lineNumber));
    if (
      normalizedLine.length === 0 ||
      COLLAPSED_FOLD_PREVIEW_SKIP_LINE_PATTERN.test(normalizedLine)
    ) {
      continue;
    }

    previewSegments.push(normalizedLine);
  }

  if (previewSegments.length === 0) {
    return null;
  }

  const fullText = previewSegments.join(' ');
  return {
    displayText: truncateFoldPreview(fullText),
    fullText,
  };
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

const createFoldControlButton = (action: (event: MouseEvent) => void): HTMLButtonElement => {
  const button = document.createElement('button');
  let shouldIgnoreNextClick = false;
  button.type = 'button';
  button.className = 'output-inline-fold-control';
  button.setAttribute('data-testid', 'output-inline-fold-control');
  button.addEventListener('mousedown', (event: MouseEvent) => {
    event.preventDefault();
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
  getModifierMode: () => FoldControlModifierMode,
  getActiveExtractedSourceRange: () => OutputPaneSourceRange | null,
  onToggleExtractedSourcePane: ((foldStart: FoldStart) => void) | undefined,
  refresh: () => void,
): FoldWidget => {
  let foldStart = initialFoldStart;
  const domNode = document.createElement('div');
  domNode.className = 'output-inline-fold-control-widget';
  const buttonRow = document.createElement('div');
  buttonRow.className = 'output-inline-fold-control-row';
  const preview = document.createElement('span');
  preview.className = 'output-inline-fold-preview';
  preview.setAttribute('data-testid', 'output-inline-fold-preview');
  preview.setAttribute('aria-hidden', 'true');
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
    const modifierMode =
      event.ctrlKey || event.shiftKey
        ? getFoldControlModifierMode(event.ctrlKey, event.shiftKey)
        : getModifierMode();
    const activeExtractedSourceRange = getActiveExtractedSourceRange();
    const resolvedMode = resolveFoldControlMode(
      foldStart,
      modifierMode,
      activeExtractedSourceRange,
    );

    if (resolvedMode === 'children') {
      if (foldStart.childToggleAction) {
        runChildToggleAction();
      }
      return;
    }

    if (resolvedMode === 'source-pane') {
      onToggleExtractedSourcePane?.(foldStart);
      return;
    }

    runSelfToggleAction();
  });

  buttonRow.append(controlButton);
  buttonRow.append(preview);
  domNode.append(buttonRow);

  const updateButton = (): void => {
    const modifierMode = getModifierMode();
    const activeExtractedSourceRange = getActiveExtractedSourceRange();
    const resolvedMode = resolveFoldControlMode(
      foldStart,
      modifierMode,
      activeExtractedSourceRange,
    );
    const selfAction = getSelfToggleAction(foldStart);
    controlButton.setAttribute('data-line-number', String(foldStart.lineNumber));
    buttonRow.setAttribute('data-fold-state', foldStart.isCollapsed ? 'collapsed' : 'expanded');

    if (resolvedMode === 'self') {
      controlButton.disabled = false;
      controlButton.innerHTML = getFoldControlGlyph(selfAction, resolvedMode);
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

    controlButton.removeAttribute('aria-expanded');
    controlButton.setAttribute('data-fold-action-scope', resolvedMode);
    controlButton.setAttribute('data-fold-control-kind', resolvedMode);

    if (resolvedMode === 'source-pane') {
      const isOpenInAdjacentPane = isFoldStartOpenInAdjacentPane(
        foldStart,
        activeExtractedSourceRange,
      );
      controlButton.disabled =
        foldStart.sourceRange === null || onToggleExtractedSourcePane === undefined;
      controlButton.innerHTML = getFoldControlGlyph(
        isOpenInAdjacentPane ? 'close-pane' : 'open-pane',
        resolvedMode,
      );
      controlButton.setAttribute(
        'data-fold-action',
        isOpenInAdjacentPane ? 'close-pane' : 'open-pane',
      );
      controlButton.setAttribute(
        'aria-label',
        isOpenInAdjacentPane
          ? createCloseSourcePaneLabel(foldStart)
          : createOpenSourcePaneLabel(foldStart),
      );
      controlButton.title = isOpenInAdjacentPane
        ? createCloseSourcePaneLabel(foldStart)
        : createOpenSourcePaneLabel(foldStart);
      return;
    }

    const childAction = foldStart.childToggleAction;
    if (childAction === null) {
      controlButton.disabled = true;
      controlButton.innerHTML = getFoldControlGlyph('collapse', resolvedMode);
      controlButton.setAttribute('data-fold-action', 'none');
      controlButton.setAttribute('aria-label', createDisabledChildFoldControlLabel(foldStart));
      controlButton.title = createDisabledChildFoldControlLabel(foldStart);
      return;
    }

    controlButton.disabled = false;
    controlButton.innerHTML = getFoldControlGlyph(childAction, resolvedMode);
    controlButton.setAttribute('data-fold-action', childAction);
    controlButton.setAttribute('aria-label', createChildFoldControlLabel(foldStart, childAction));
    controlButton.title = createChildFoldControlLabel(foldStart, childAction);
  };

  const updatePreview = (): void => {
    const foldPreview = createCollapsedFoldPreview(editor, foldStart);
    if (!foldPreview) {
      preview.hidden = true;
      preview.textContent = '';
      preview.removeAttribute('title');
      buttonRow.setAttribute('data-fold-preview-visible', 'false');
      return;
    }

    preview.hidden = false;
    preview.textContent = foldPreview.displayText;
    preview.title = foldPreview.fullText;
    buttonRow.setAttribute('data-fold-preview-visible', 'true');
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
      updatePreview();
      editor.layoutContentWidget(widget);
    },
    dispose: () => {
      domNode.replaceWith();
    },
  };

  updateButton();
  updatePreview();
  return widget;
};

const syncWidgets = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  widgetsByLine: Map<number, FoldWidget>,
  foldStarts: FoldStart[],
  getModifierMode: () => FoldControlModifierMode,
  getActiveExtractedSourceRange: () => OutputPaneSourceRange | null,
  onToggleExtractedSourcePane: ((foldStart: FoldStart) => void) | undefined,
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

    const widget = createFoldWidget(
      editor,
      foldStart,
      getModifierMode,
      getActiveExtractedSourceRange,
      onToggleExtractedSourcePane,
      refresh,
    );
    widgetsByLine.set(foldStart.lineNumber, widget);
    editor.addContentWidget(widget);
  }
};

export const registerInlineFoldControls = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  options: RegisterInlineFoldControlsOptions = {},
): { dispose: () => void } => {
  const disposables: Array<{ dispose: () => void }> = [];
  const widgetsByLine = new Map<number, FoldWidget>();
  let disposed = false;
  let isCtrlModifierActive = false;
  let isShiftModifierActive = false;
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

      syncWidgets(
        editor,
        widgetsByLine,
        foldStarts,
        () => getFoldControlModifierMode(isCtrlModifierActive, isShiftModifierActive),
        () => options.getActiveExtractedSourceRange?.() ?? null,
        options.onToggleExtractedSourcePane,
        refresh,
      );
    });
  };

  const setModifierState = (modifier: 'ctrl' | 'shift', nextIsActive: boolean): void => {
    const currentIsActive = modifier === 'ctrl' ? isCtrlModifierActive : isShiftModifierActive;
    if (currentIsActive === nextIsActive) {
      return;
    }

    if (modifier === 'ctrl') {
      isCtrlModifierActive = nextIsActive;
    } else {
      isShiftModifierActive = nextIsActive;
    }
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
    if (isControlModifierKey(event)) {
      setModifierState('ctrl', true);
    }
    if (isShiftModifierKey(event)) {
      setModifierState('shift', true);
    }
  };
  const handleWindowKeyUp = (event: KeyboardEvent): void => {
    if (isControlModifierKey(event)) {
      setModifierState('ctrl', false);
    }
    if (isShiftModifierKey(event)) {
      setModifierState('shift', false);
    }
  };
  const handleWindowBlur = (): void => {
    setModifierState('ctrl', false);
    setModifierState('shift', false);
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
