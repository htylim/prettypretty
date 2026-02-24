import { CURRENT_PREFERENCES_VERSION, type Preferences } from '../../shared/preferences';

export const createDefaultPreferences = (): Preferences => ({
  version: CURRENT_PREFERENCES_VERSION,
  themeMode: 'light',
});
