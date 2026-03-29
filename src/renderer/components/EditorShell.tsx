import {
  useEffect,
  useRef,
  type ClipboardEventHandler,
  type DragEventHandler,
  type RefObject,
} from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { PaneMode, ThemeMode } from '../../shared/types';
import type { FallbackWaitState, IngestSource } from '../app/appDomain';
import { InputEditor, type InputEditorHandle } from './InputEditor';
import {
  OutputPaneStrip,
  type OutputPaneFocusRequest,
  type OutputPaneViewModel,
} from './OutputPaneStrip';
import type { OutputEditorHandle } from './OutputEditor';
import { OutputContextMenu } from './OutputContextMenu';
import {
  getOutputContextMenuLabel,
  type OutputContextMenuState,
} from '../app/outputContextMenuDomain';

// Empty-state paste shares the shell container with Monaco. Ignore paste events
// coming from Monaco's find widget so search input keeps working normally.
const isMonacoFindWidgetTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Node)) {
    return false;
  }

  const targetElement = target instanceof Element ? target : target.parentElement;
  return targetElement?.closest('.find-widget') !== null;
};

type EditorShellProps = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  inputText: string;
  outputPanes: OutputPaneViewModel[];
  activeOutputPaneId: string;
  outputLeftVisiblePaneIndex: number;
  outputPaneFocusRequest: OutputPaneFocusRequest | null;
  outputContextMenuState: OutputContextMenuState | null;
  ingestNotice: string | null;
  fallbackWaitState: FallbackWaitState | null;
  inputEditorRef: RefObject<InputEditorHandle | null>;
  onEditInputChange: (value: string) => void;
  onIngestInput: (value: string, source: IngestSource) => void;
  onDismissIngestNotice: () => void;
  onOpenFile: () => Promise<void>;
  onCancelFallbackWait: () => void;
  onOutputPaneHandleChange: (paneId: string, handle: OutputEditorHandle | null) => void;
  onOutputPaneFocus: (paneId: string) => void;
  onOutputPaneContextMenu: (
    paneId: string,
    request: {
      anchorX: number;
      anchorY: number;
      isContentHit: boolean;
      position: {
        lineNumber: number;
        column: number;
      } | null;
      hasSelection: boolean;
    },
    value: string,
  ) => void;
  onDismissOutputContextMenu: () => void;
  onTriggerOutputContextPrettify: () => void;
  onNavigateOutputPaneViewport: (stepDelta: number) => void;
};

export const EditorShell = ({
  paneMode,
  themeMode,
  indentSize,
  inputText,
  outputPanes,
  activeOutputPaneId,
  outputLeftVisiblePaneIndex,
  outputPaneFocusRequest,
  outputContextMenuState,
  ingestNotice,
  fallbackWaitState,
  inputEditorRef,
  onEditInputChange,
  onIngestInput,
  onDismissIngestNotice,
  onOpenFile,
  onCancelFallbackWait,
  onOutputPaneHandleChange,
  onOutputPaneFocus,
  onOutputPaneContextMenu,
  onDismissOutputContextMenu,
  onTriggerOutputContextPrettify,
  onNavigateOutputPaneViewport,
}: EditorShellProps) => {
  const shellRef = useRef<HTMLElement | null>(null);
  const hasContent = inputText.trim().length > 0;
  const fallbackWaitMessage = fallbackWaitState ? (
    <>
      Malformed {fallbackWaitState.formatLabel}
      <br />
      Calling {fallbackWaitState.agentName}
    </>
  ) : null;
  const fallbackProgressText =
    fallbackWaitState && fallbackWaitState.progressLines.length > 0
      ? fallbackWaitState.progressLines.join('\n')
      : 'Waiting for agent output...';

  useEffect(() => {
    if (hasContent || fallbackWaitState) {
      return;
    }

    shellRef.current?.focus();
  }, [fallbackWaitState, hasContent]);

  const handleDrop: DragEventHandler<HTMLDivElement> = async (event) => {
    event.preventDefault();
    const [file] = Array.from(event.dataTransfer.files);

    if (!file) {
      return;
    }

    const fileText = await file.text();
    onIngestInput(fileText, 'drop');
  };

  const handlePaste: ClipboardEventHandler<HTMLDivElement> = (event) => {
    if (isMonacoFindWidgetTarget(event.target)) {
      return;
    }

    // Shell-level paste is only meaningful for ingest; once content exists, the
    // input editor itself handles normal text editing and Monaco receives the event.
    const pastedText = event.clipboardData.getData('text');
    onIngestInput(pastedText, 'paste');
  };

  return (
    <section
      className="editor-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      onPaste={handlePaste}
      data-testid="editor-shell"
      ref={shellRef}
      tabIndex={-1}
    >
      {ingestNotice ? (
        <div className="ingest-notice" data-testid="ingest-notice" role="status">
          <span>{ingestNotice}</span>
          <button
            aria-label="Dismiss notice"
            className="ingest-notice-dismiss"
            onClick={onDismissIngestNotice}
            type="button"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {fallbackWaitState ? (
        <div
          aria-live="polite"
          className="fallback-wait-screen"
          data-testid="fallback-wait-screen"
          role="status"
        >
          <p className="fallback-wait-message" data-testid="fallback-wait-message">
            {fallbackWaitMessage}
          </p>
          <div className="fallback-wait-progress">
            <span aria-hidden="true" className="fallback-wait-spinner" />
            <span className="fallback-wait-progress-label">Processing...</span>
          </div>
          <pre className="fallback-wait-line" data-testid="fallback-wait-line">
            {fallbackProgressText}
          </pre>
          <button
            className="btn fallback-wait-cancel"
            data-testid="fallback-wait-cancel"
            onClick={onCancelFallbackWait}
            type="button"
          >
            CANCEL
          </button>
        </div>
      ) : !hasContent ? (
        <div className="empty-state">
          <p className="empty-state-cta" data-testid="empty-state-cta">
            Paste, Drop <em>or</em>{' '}
            <button className="empty-state-link" onClick={() => void onOpenFile()} type="button">
              Click
            </button>
          </p>
        </div>
      ) : paneMode === 'input' ? (
        <InputEditor
          ref={inputEditorRef}
          value={inputText}
          themeMode={themeMode}
          indentSize={indentSize}
          onChange={onEditInputChange}
        />
      ) : (
        <div className="output-pane">
          <OutputPaneStrip
            activePaneId={activeOutputPaneId}
            focusRequest={outputPaneFocusRequest}
            indentSize={indentSize}
            leftVisiblePaneIndex={outputLeftVisiblePaneIndex}
            onNavigatePaneViewport={onNavigateOutputPaneViewport}
            onPaneContextMenu={onOutputPaneContextMenu}
            onPaneFocus={onOutputPaneFocus}
            onPaneHandleChange={onOutputPaneHandleChange}
            panes={outputPanes}
            themeMode={themeMode}
          />
        </div>
      )}
      <OutputContextMenu
        anchorX={outputContextMenuState?.anchorX ?? 0}
        anchorY={outputContextMenuState?.anchorY ?? 0}
        disabled={outputContextMenuState?.target === null}
        isOpen={outputContextMenuState !== null}
        label={getOutputContextMenuLabel(outputContextMenuState?.target ?? null)}
        onClose={onDismissOutputContextMenu}
        onSelect={onTriggerOutputContextPrettify}
      />
    </section>
  );
};
