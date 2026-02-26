import { create } from 'zustand';
import type { IndentSize } from '../../shared/preferences';
import type { PaneMode, ThemeMode } from '../../shared/types';

type UiState = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  indentSize: IndentSize;
  inputText: string;
  ingestNotice: string | null;
  setPaneMode: (mode: PaneMode) => void;
  togglePaneMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  setIndentSize: (size: IndentSize) => void;
  setInputText: (text: string) => void;
  setIngestNotice: (notice: string | null) => void;
  reset: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  paneMode: 'input',
  themeMode: 'light',
  indentSize: 2,
  inputText: '',
  ingestNotice: null,
  setPaneMode: (mode) => set({ paneMode: mode }),
  togglePaneMode: () =>
    set((state) => ({ paneMode: state.paneMode === 'input' ? 'output' : 'input' })),
  setThemeMode: (mode) => set({ themeMode: mode }),
  toggleThemeMode: () =>
    set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),
  setIndentSize: (size) => set({ indentSize: size }),
  setInputText: (text) => set({ inputText: text }),
  setIngestNotice: (notice) => set({ ingestNotice: notice }),
  reset: () => set({ paneMode: 'input', inputText: '', ingestNotice: null }),
}));
