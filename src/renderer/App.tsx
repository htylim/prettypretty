import { useRef } from 'react';
import { EditorShell } from './components/EditorShell';
import type { InputEditorHandle } from './components/InputEditor';
import type { OutputEditorHandle } from './components/OutputEditor';
import { Toolbar } from './components/Toolbar';
import { useAppController } from './app/useAppController';

export const App = () => {
  const inputEditorRef = useRef<InputEditorHandle>(null);
  const outputEditorRef = useRef<OutputEditorHandle>(null);
  const controller = useAppController({ inputEditorRef, outputEditorRef });

  return (
    <main className="app-root">
      <div className="app-backdrop" aria-hidden="true" />
      <div className="app-shell">
        <Toolbar
          paneMode={controller.paneMode}
          themeMode={controller.themeMode}
          fallbackAgentId={controller.fallbackAgentId}
          fallbackAgentOptions={controller.fallbackAgentOptions}
          hasContent={controller.hasContent}
          onNew={controller.onNew}
          onPaneModeChange={controller.onPaneModeChange}
          onCollapseAll={controller.onCollapseAll}
          onExpandAll={controller.onExpandAll}
          onSave={() => void controller.onSave()}
          onCopy={() => void controller.onCopy()}
          onThemeModeChange={(mode) => void controller.onThemeModeChange(mode)}
          onFallbackAgentIdChange={(agentId) => void controller.onFallbackAgentIdChange(agentId)}
        />

        <EditorShell
          paneMode={controller.paneMode}
          themeMode={controller.themeMode}
          indentSize={controller.indentSize}
          inputText={controller.inputText}
          outputText={controller.outputText}
          outputDocumentId={controller.outputDocumentId}
          ingestNotice={controller.ingestNotice}
          fallbackWaitState={controller.fallbackWaitState}
          inputEditorRef={inputEditorRef}
          outputEditorRef={outputEditorRef}
          onEditInputChange={controller.onEditInputChange}
          onIngestInput={controller.onIngestInput}
          onDismissIngestNotice={controller.onDismissIngestNotice}
          onOpenFile={controller.onOpenFile}
        />
      </div>
    </main>
  );
};
