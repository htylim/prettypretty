import type { ThemeMode } from './types';

export type PreferencesVersion = 1;

export const CURRENT_PREFERENCES_VERSION: PreferencesVersion = 1;
export type IndentSize = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const DEFAULT_INDENT_SIZE: IndentSize = 2;

export type Preferences = {
  version: PreferencesVersion;
  themeMode: ThemeMode;
  indentSize: IndentSize;
};

export type PreferencesPatch = Partial<Pick<Preferences, 'themeMode' | 'indentSize'>>;
