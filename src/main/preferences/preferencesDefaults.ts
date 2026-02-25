import {
  CURRENT_PREFERENCES_VERSION,
  DEFAULT_INDENT_SIZE,
  type Preferences,
} from '../../shared/preferences';

export const createDefaultPreferences = (): Preferences => ({
  version: CURRENT_PREFERENCES_VERSION,
  themeMode: 'light',
  indentSize: DEFAULT_INDENT_SIZE,
});
