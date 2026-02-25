import {
  CURRENT_PREFERENCES_VERSION,
  DEFAULT_INDENT_SIZE,
  type IndentSize,
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

export const isIndentSize = (value: unknown): value is IndentSize => {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 8;
};

export const isPreferencesPatch = (value: unknown): value is PreferencesPatch => {
  if (!isRecord(value)) {
    return false;
  }

  for (const key of Object.keys(value)) {
    if (key !== 'themeMode' && key !== 'indentSize') {
      return false;
    }
  }

  if ('themeMode' in value) {
    const { themeMode } = value;
    if (themeMode !== undefined && !isThemeMode(themeMode)) {
      return false;
    }
  }

  if ('indentSize' in value) {
    const { indentSize } = value;
    if (indentSize !== undefined && !isIndentSize(indentSize)) {
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
    indentSize: isIndentSize(value.indentSize) ? value.indentSize : DEFAULT_INDENT_SIZE,
  };
};
