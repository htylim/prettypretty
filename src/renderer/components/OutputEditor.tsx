import Editor from '@monaco-editor/react';
import { forwardRef, useImperativeHandle, useMemo } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { OutputPaneSourceRange } from '../app/outputPaneDomain';
import { detectOutputLanguage } from '../output/detectOutputLanguage';
import { PRETTYPRETTY_DARK_THEME, PRETTYPRETTY_LIGHT_THEME } from '../output/monacoThemes';
import { getOutputEditorOptions } from '../output/outputEditorConfig';
import { useOutputEditorRuntime } from './useOutputEditorRuntime';

export type OutputEditorHandle = {
  collapseAll: () => void;
  expandAll: () => void;
  focus: () => void;
  openFind: () => void;
};

type OutputEditorProps = {
  value: string;
  themeMode: ThemeMode;
  documentId: string;
  viewStateKey: string;
  indentSize: IndentSize;
  viewRange?: OutputPaneSourceRange | null | undefined;
  onFocus?: (() => void) | undefined;
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
      viewRange = null,
      onFocus,
      testId = 'output-editor',
    },
    ref,
  ) => {
    const options = useMemo(() => getOutputEditorOptions(indentSize), [indentSize]);
    const language = useMemo(() => detectOutputLanguage(value), [value]);
    const theme = themeMode === 'dark' ? PRETTYPRETTY_DARK_THEME : PRETTYPRETTY_LIGHT_THEME;
    const outputEditorRuntime = useOutputEditorRuntime({
      documentId,
      viewStateKey,
      viewRange,
      onFocus,
    });

    useImperativeHandle(
      ref,
      () => ({
        collapseAll: outputEditorRuntime.collapseAll,
        expandAll: outputEditorRuntime.expandAll,
        focus: outputEditorRuntime.focus,
        openFind: outputEditorRuntime.openFind,
      }),
      [outputEditorRuntime],
    );

    return (
      <div
        className="output-editor"
        data-testid={testId}
        onFocusCapture={outputEditorRuntime.onFocusCapture}
        onMouseDown={outputEditorRuntime.onMouseDown}
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
