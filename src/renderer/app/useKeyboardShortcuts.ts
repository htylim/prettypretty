import { useEffect } from 'react';
import type { PaneMode } from '../../shared/types';

type UseKeyboardShortcutsOptions = {
  isOutputMode: boolean;
  paneMode: PaneMode;
  hasContent: boolean;
  handleNew: () => void;
  handlePaneModeChange: (nextMode: PaneMode) => void;
  saveOutput: () => Promise<void>;
  copyOutput: () => Promise<void>;
  openFind: () => void;
};

export const useKeyboardShortcuts = ({
  isOutputMode,
  paneMode,
  hasContent,
  handleNew,
  handlePaneModeChange,
  saveOutput,
  copyOutput,
  openFind,
}: UseKeyboardShortcutsOptions): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      if (!event.metaKey || event.ctrlKey || event.altKey) {
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

      if (event.shiftKey) {
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        handleNew();
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
    handleNew,
    handlePaneModeChange,
    hasContent,
    isOutputMode,
    openFind,
    paneMode,
    saveOutput,
  ]);
};
