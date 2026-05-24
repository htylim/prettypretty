import Editor from '@monaco-editor/react';
import { forwardRef, useImperativeHandle, useMemo } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import { detectOutputLanguage, type OutputLanguageId } from '../output/detectOutputLanguage';
import { PRETTYPRETTY_DARK_THEME, PRETTYPRETTY_LIGHT_THEME } from '../output/monacoThemes';
import { getOutputEditorOptions } from '../output/outputEditorConfig';
import type { OutputPaneSourceRange } from '../output/outputRange';
import { useOutputEditorRuntime } from './useOutputEditorRuntime';
import type { OutputEditorContextMenuRequest } from './useOutputEditorRuntime';
import type { EditorViewportSnapshot } from './InputEditor';

export type OutputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
  focus: () => void;
  openFind: () => void;
  captureViewportSnapshot: () => EditorViewportSnapshot | null;
  restoreViewportSnapshot: (snapshot: EditorViewportSnapshot | null) => void;
};

type OutputEditorProps = {
  value: string;
  themeMode: ThemeMode;
  documentId: string;
  viewStateKey: string;
  indentSize: IndentSize;
  languageOverride?: OutputLanguageId | null | undefined;
  activeExtractedSourceRange?: OutputPaneSourceRange | null | undefined;
  lineNumberStart?: number | null | undefined;
  viewRange?: OutputPaneSourceRange | null | undefined;
  onFocus?: (() => void) | undefined;
  onViewportInteraction?: (() => void) | undefined;
  onToggleExtractedSourcePane?:
    | ((content: {
        kind: 'extracted-source';
        value: string;
        sourceRange: OutputPaneSourceRange;
        lineNumberStart: number;
      }) => void)
    | undefined;
  onContextMenu?: ((request: OutputEditorContextMenuRequest) => void) | undefined;
  testId?: string | undefined;
};

/**
 * Monaco-backed read-only output editor. It owns pane-local editor state,
 * optional view-range filtering, and active-pane focus handoff.
 */
export const OutputEditor = forwardRef<OutputEditorHandle, OutputEditorProps>(
  (
    {
      value,
      themeMode,
      documentId,
      viewStateKey,
      indentSize,
      languageOverride = null,
      activeExtractedSourceRange = null,
      lineNumberStart = null,
      viewRange = null,
      onFocus,
      onViewportInteraction,
      onToggleExtractedSourcePane,
      onContextMenu,
      testId = 'output-editor',
    },
    ref,
  ) => {
    const options = useMemo(
      () =>
        lineNumberStart === null
          ? getOutputEditorOptions(indentSize)
          : getOutputEditorOptions(indentSize, lineNumberStart),
      [indentSize, lineNumberStart],
    );
    const language = useMemo(
      () => languageOverride ?? detectOutputLanguage(value),
      [languageOverride, value],
    );
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;
    const outputEditorRuntime = useOutputEditorRuntime({
      activeExtractedSourceRange,
      documentId,
      lineNumberStart,
      onToggleExtractedSourcePane,
      viewStateKey,
      viewRange,
      onFocus,
      onContextMenu,
    });

    useImperativeHandle(
      ref,
      () => ({
        collapseAll: outputEditorRuntime.collapseAll,
        expandAll: outputEditorRuntime.expandAll,
        focus: outputEditorRuntime.focus,
        openFind: outputEditorRuntime.openFind,
        captureViewportSnapshot: outputEditorRuntime.captureViewportSnapshot,
        restoreViewportSnapshot: outputEditorRuntime.restoreViewportSnapshot,
      }),
      [outputEditorRuntime],
    );

    return (
      <div
        className="output-editor"
        data-testid={testId}
        onFocusCapture={outputEditorRuntime.onFocusCapture}
        onKeyDownCapture={onViewportInteraction}
        onMouseDown={outputEditorRuntime.onMouseDown}
        onMouseDownCapture={onViewportInteraction}
        onWheelCapture={onViewportInteraction}
      >
        <Editor
          beforeMount={outputEditorRuntime.beforeMount}
          height="100%"
          keepCurrentModel
          language={language}
          onMount={outputEditorRuntime.onMount}
          options={options}
          path={`output://source/${documentId}`}
          saveViewState={false}
          theme={theme}
          value={value}
        />
      </div>
    );
  },
);

OutputEditor.displayName = 'OutputEditor';
