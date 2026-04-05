import { useRef } from 'react';
import { useAppController } from './app/useAppController';
import { ConfirmationModal } from './components/ConfirmationModal';
import { EditorShell } from './components/EditorShell';
import { FallbackAgentComboButton } from './components/FallbackAgentComboButton';
import type { InputEditorHandle } from './components/InputEditor';
import { Toolbar } from './components/Toolbar';

export const App = () => {
  const inputEditorRef = useRef<InputEditorHandle>(null);
  const controller = useAppController({ inputEditorRef });
  const enabledFallbackAgentOptions = controller.fallbackAgentOptions.filter(
    (option) => option.enabled,
  );
  const isLargeContentFallbackModal = controller.fallbackModalState?.kind === 'large-content';
  const isFallbackAgentSelectionModal = controller.fallbackModalState?.kind === 'agent-selection';
  const isIngestRejectionModalOpen = controller.ingestRejectionMessage !== null;

  return (
    <main className="app-root">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-shell">
        <Toolbar
          paneMode={controller.paneMode}
          themeMode={controller.themeMode}
          indentSize={controller.indentSize}
          fallbackAgentId={controller.fallbackAgentId}
          fallbackAgentOptions={controller.fallbackAgentOptions}
          hasContent={controller.hasContent}
          canPopSplit={controller.hasDerivedOutputPane}
          canNavigateSplitLeft={controller.canNavigateOutputPaneLeft}
          canNavigateSplitRight={controller.canNavigateOutputPaneRight}
          visibleOutputPanePosition={controller.visibleOutputPanePosition}
          onNew={controller.onNew}
          onPaneModeChange={controller.onPaneModeChange}
          onCollapseAll={controller.onCollapseAll}
          onExpandAll={controller.onExpandAll}
          onSave={() => void controller.onSave()}
          onCopy={() => void controller.onCopy()}
          onPopSplit={controller.onCloseSplit}
          onNavigateSplitLeft={controller.onNavigateOutputPaneLeft}
          onNavigateSplitRight={controller.onNavigateOutputPaneRight}
          onThemeModeChange={(mode) => void controller.onThemeModeChange(mode)}
          onIndentSizeChange={(size) => void controller.onIndentSizeChange(size)}
          onFallbackAgentIdChange={(agentId) => void controller.onFallbackAgentIdChange(agentId)}
        />

        <EditorShell
          paneMode={controller.paneMode}
          themeMode={controller.themeMode}
          indentSize={controller.indentSize}
          inputText={controller.inputText}
          outputPanes={controller.outputPanes}
          activeOutputPaneId={controller.activeOutputPaneId}
          outputLeftVisiblePaneIndex={controller.outputLeftVisiblePaneIndex}
          outputPaneFocusRequest={controller.outputPaneFocusRequest}
          outputContextMenuState={controller.outputContextMenuState}
          ingestNotice={controller.ingestNotice}
          fallbackWaitState={controller.fallbackWaitState}
          inputEditorRef={inputEditorRef}
          onEditInputChange={controller.onEditInputChange}
          onIngestInput={controller.onIngestInput}
          onDismissIngestNotice={controller.onDismissIngestNotice}
          onOpenFile={controller.onOpenFile}
          onCancelFallbackWait={() => void controller.onCancelActiveFallback()}
          onOutputPaneHandleChange={controller.onOutputPaneHandleChange}
          onOutputPaneFocus={controller.onOutputPaneFocus}
          onToggleExtractedSourcePane={controller.onToggleExtractedSourcePane}
          onOutputPaneContextMenu={controller.onOutputPaneContextMenu}
          onDismissOutputContextMenu={controller.onDismissOutputContextMenu}
          onTriggerOutputContextPrettify={controller.onTriggerOutputContextPrettify}
          onNavigateOutputPaneViewport={controller.onNavigateOutputPaneViewport}
        />
      </div>

      <ConfirmationModal
        actions={
          isIngestRejectionModalOpen ? (
            <button
              autoFocus
              className="btn btn-primary"
              onClick={controller.onDismissIngestRejection}
              type="button"
            >
              OK
            </button>
          ) : undefined
        }
        isOpen={isIngestRejectionModalOpen}
        message={controller.ingestRejectionMessage ?? ''}
        onCancel={controller.onDismissIngestRejection}
        title="Content too large"
      />

      <ConfirmationModal
        actions={
          isFallbackAgentSelectionModal ? (
            <>
              <button className="btn" onClick={controller.onCancelFallback} type="button">
                No
              </button>
              <FallbackAgentComboButton
                autoFocusPrimaryAction={true}
                fallbackAgentOptions={enabledFallbackAgentOptions}
                onTrigger={controller.onSelectFallbackAgent}
              />
            </>
          ) : undefined
        }
        cancelLabel="Cancel"
        confirmLabel="Use fallback agent"
        isOpen={controller.fallbackModalState !== null}
        message={
          isLargeContentFallbackModal
            ? `Content exceeds ${controller.fallbackWarningLineThreshold} lines. Use fallback agent?`
            : "Couldn't prettify this text locally. Call a fallback agent for this run?"
        }
        onCancel={controller.onCancelFallback}
        onConfirm={isLargeContentFallbackModal ? controller.onConfirmFallback : undefined}
        title={isLargeContentFallbackModal ? 'Large content' : 'Call fallback agent'}
      />
    </main>
  );
};
