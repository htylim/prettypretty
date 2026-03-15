import { useEffect } from 'react';
import type { PaneMode } from '../../shared/types';
import { hasPrimaryModifier } from './primaryModifier';

type UseKeyboardShortcutsOptions = {
  isOutputMode: boolean;
  paneMode: PaneMode;
  hasContent: boolean;
  openNewWindow: () => void;
  resetCurrentWindow: () => void;
  handlePaneModeChange: (nextMode: PaneMode) => void;
  saveOutput: () => Promise<void>;
  copyOutput: () => Promise<void>;
  openFind: () => void;
};

export const useKeyboardShortcuts = ({
  isOutputMode,
  paneMode,
  hasContent,
  openNewWindow,
  resetCurrentWindow,
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
    handlePaneModeChange,
    hasContent,
    isOutputMode,
    openNewWindow,
    openFind,
    paneMode,
    resetCurrentWindow,
    saveOutput,
  ]);
};
