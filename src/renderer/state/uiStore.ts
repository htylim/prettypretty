import { create } from 'zustand';
import type { PaneMode, ThemeMode } from '../../shared/types';

type UiState = {
  paneMode: PaneMode;
  themeMode: ThemeMode;
  inputText: string;
  setPaneMode: (mode: PaneMode) => void;
  togglePaneMode: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  setInputText: (text: string) => void;
  reset: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  paneMode: 'input',
  themeMode: 'light',
  inputText: '',
  setPaneMode: (mode) => set({ paneMode: mode }),
  togglePaneMode: () =>
    set((state) => ({ paneMode: state.paneMode === 'input' ? 'output' : 'input' })),
  setThemeMode: (mode) => set({ themeMode: mode }),
  toggleThemeMode: () =>
    set((state) => ({ themeMode: state.themeMode === 'light' ? 'dark' : 'light' })),
  setInputText: (text) => set({ inputText: text }),
  reset: () => set({ paneMode: 'input', inputText: '' }),
}));
