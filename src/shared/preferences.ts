import type { ThemeMode } from './types';

export type PreferencesVersion = 1;

export const CURRENT_PREFERENCES_VERSION: PreferencesVersion = 1;

export type Preferences = {
  version: PreferencesVersion;
  themeMode: ThemeMode;
};

export type PreferencesPatch = Partial<Pick<Preferences, 'themeMode'>>;
