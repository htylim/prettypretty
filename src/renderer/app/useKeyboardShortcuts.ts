import { useEffect } from 'react';
import type { PaneMode } from '../../shared/types';
import { hasPrimaryModifier } from './primaryModifier';

type UseKeyboardShortcutsOptions = {
  isOutputMode: boolean;
  paneMode: PaneMode;
  hasContent: boolean;
  canPopOutputPane: boolean;
  openNewWindow: () => void;
  resetCurrentWindow: () => void;
  handlePaneModeChange: (nextMode: PaneMode) => void;
  saveOutput: () => Promise<void>;
  copyOutput: () => Promise<void>;
  refreshCurrentFile: () => void;
  openFind: () => void;
  closeOutputPane: () => void;
  navigateOutputPaneViewport: (stepDelta: number) => void;
};

export const useKeyboardShortcuts = ({
  isOutputMode,
  paneMode,
  hasContent,
  canPopOutputPane,
  openNewWindow,
  resetCurrentWindow,
  handlePaneModeChange,
  saveOutput,
  copyOutput,
  refreshCurrentFile,
  openFind,
  closeOutputPane,
  navigateOutputPaneViewport,
}: UseKeyboardShortcutsOptions): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (event.key === 'Escape') {
        if (!isOutputMode || !canPopOutputPane) {
          return;
        }

        event.preventDefault();
        closeOutputPane();
        return;
      }

      const isLiteralCtrlShortcut = event.ctrlKey && !event.metaKey && !event.altKey;
      if (isOutputMode && !event.shiftKey && isLiteralCtrlShortcut) {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          navigateOutputPaneViewport(-1);
          return;
        }

        if (event.key === 'ArrowRight') {
          event.preventDefault();
          navigateOutputPaneViewport(1);
          return;
        }
      }

      const isBrowserBackShortcut =
        isOutputMode &&
        !event.shiftKey &&
        ((hasPrimaryModifier(event) && event.key === '[') ||
          (event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'ArrowLeft'));
      if (isBrowserBackShortcut) {
        event.preventDefault();
        navigateOutputPaneViewport(-1);
        return;
      }

      const isBrowserForwardShortcut =
        isOutputMode &&
        !event.shiftKey &&
        ((hasPrimaryModifier(event) && event.key === ']') ||
          (event.altKey && !event.metaKey && !event.ctrlKey && event.key === 'ArrowRight'));
      if (isBrowserForwardShortcut) {
        event.preventDefault();
        navigateOutputPaneViewport(1);
        return;
      }

      if (!hasPrimaryModifier(event)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (event.shiftKey && key === 'c') {
        event.preventDefault();
        if (!isOutputMode) {
          return;
        }
        void copyOutput();
        return;
      }

      if (event.shiftKey && key === 'n') {
        event.preventDefault();
        resetCurrentWindow();
        return;
      }

      if (event.shiftKey) {
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        openNewWindow();
        return;
      }

      if (key === 'i') {
        event.preventDefault();
        if (paneMode !== 'input') {
          handlePaneModeChange('input');
        }
        return;
      }

      if (key === 'o') {
        event.preventDefault();
        const canSwitchToOutput = paneMode === 'output' || hasContent;
        if (!canSwitchToOutput) {
          return;
        }
        if (paneMode !== 'output') {
          handlePaneModeChange('output');
        }
        return;
      }

      if (key === 's') {
        event.preventDefault();
        if (!isOutputMode) {
          return;
        }
        void saveOutput();
        return;
      }

      if (key === 'r') {
        event.preventDefault();
        refreshCurrentFile();
        return;
      }

      if (key === 'f') {
        if (!isOutputMode) {
          return;
        }
        event.preventDefault();
        openFind();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    copyOutput,
    closeOutputPane,
    canPopOutputPane,
    handlePaneModeChange,
    hasContent,
    isOutputMode,
    navigateOutputPaneViewport,
    openNewWindow,
    openFind,
    paneMode,
    refreshCurrentFile,
    resetCurrentWindow,
    saveOutput,
  ]);
};
