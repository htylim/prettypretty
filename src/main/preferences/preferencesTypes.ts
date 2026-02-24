import {
  CURRENT_PREFERENCES_VERSION,
  type Preferences,
  type PreferencesPatch,
} from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const isThemeMode = (value: unknown): value is ThemeMode => {
  return value === 'light' || value === 'dark';
};

export const isPreferencesPatch = (value: unknown): value is PreferencesPatch => {
  if (!isRecord(value)) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (key !== 'themeMode') {
      return false;
    }
  }

  if ('themeMode' in value) {
    const { themeMode } = value;
    if (themeMode !== undefined && !isThemeMode(themeMode)) {
      return false;
    }
  }

  return true;
};

export const migratePreferences = (value: unknown): Preferences | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (value.version !== CURRENT_PREFERENCES_VERSION) {
    return null;
  }

  if (!isThemeMode(value.themeMode)) {
    return null;
  }

  return {
    version: CURRENT_PREFERENCES_VERSION,
    themeMode: value.themeMode,
  };
};
