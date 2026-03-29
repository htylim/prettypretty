import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { IndentSize, Preferences } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import { type FallbackAgentOption, toFallbackAgentOptions } from './appDomain';
import { reportRendererError } from './reportRendererError';
import {
  selectFallbackAgentId,
  selectFallbackAgentOptions,
  selectFallbackWarningLineThreshold,
} from './session/documentSessionSelectors';
import { useDocumentSession } from './session/useDocumentSession';

type UsePreferencesFlowOptions = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setIndentSize: (size: IndentSize) => void;
  getWindowApi: () => WindowApi | null;
};

export type UsePreferencesFlowResult = {
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  fallbackWarningLineThreshold: number;
  invalidateHydratedPreferences: () => void;
  persistThemeMode: (nextThemeMode: ThemeMode) => Promise<void>;
  persistFallbackAgentId: (nextFallbackAgentId: string | null) => Promise<void>;
};

// Request ids let optimistic UI updates ignore late async responses that belong
// to an earlier selection.
const getNextRequestId = (requestIdRef: MutableRefObject<number>): number => {
  const nextRequestId = requestIdRef.current + 1;
  requestIdRef.current = nextRequestId;
  return nextRequestId;
};

const isLatestRequest = (requestIdRef: MutableRefObject<number>, requestId: number): boolean => {
  return requestIdRef.current === requestId;
};

/**
 * Hydrates renderer-owned preference state and persists optimistic edits while
 * guarding against stale async responses from earlier requests.
 */
export const usePreferencesFlow = ({
  themeMode,
  setThemeMode,
  setIndentSize,
  getWindowApi,
}: UsePreferencesFlowOptions): UsePreferencesFlowResult => {
  const latestThemeRequestIdRef = useRef(0);
  const latestFallbackAgentRequestIdRef = useRef(0);
  const hydrationVersionRef = useRef(0);
  const fallbackAgentId = useDocumentSession(selectFallbackAgentId);
  const fallbackAgentOptions = useDocumentSession(selectFallbackAgentOptions);
  const fallbackWarningLineThreshold = useDocumentSession(selectFallbackWarningLineThreshold);
  const setFallbackAgentId = useDocumentSession((state) => state.setFallbackAgentId);
  const setFallbackAgentOptions = useDocumentSession((state) => state.setFallbackAgentOptions);
  const setFallbackWarningLineThreshold = useDocumentSession(
    (state) => state.setFallbackWarningLineThreshold,
  );

  const invalidateHydratedPreferences = useCallback((): void => {
    hydrationVersionRef.current += 1;
  }, []);

  // Keep the one-time hydration write path in one helper so startup and future
  // preference shape changes do not drift.
  const applyHydratedPreferences = useCallback(
    (preferences: Preferences): void => {
      setThemeMode(preferences.themeMode);
      setIndentSize(preferences.indentSize);
      setFallbackWarningLineThreshold(preferences.fallbackWarningLineThreshold);
      setFallbackAgentId(preferences.fallbackAgentId);
      setFallbackAgentOptions(toFallbackAgentOptions(preferences));
    },
    [
      setFallbackAgentId,
      setFallbackAgentOptions,
      setFallbackWarningLineThreshold,
      setIndentSize,
      setThemeMode,
    ],
  );

  const persistThemeMode = useCallback(
    async (nextThemeMode: ThemeMode): Promise<void> => {
      const previousThemeMode = themeMode;
      if (nextThemeMode === previousThemeMode) {
        return;
      }

      invalidateHydratedPreferences();
      setThemeMode(nextThemeMode);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = getNextRequestId(latestThemeRequestIdRef);

      try {
        const updatedPreferences = await api.preferences.update({ themeMode: nextThemeMode });

        if (isLatestRequest(latestThemeRequestIdRef, requestId)) {
          setThemeMode(updatedPreferences.themeMode);
        }
      } catch (error) {
        if (isLatestRequest(latestThemeRequestIdRef, requestId)) {
          setThemeMode(previousThemeMode);
        }

        reportRendererError('Failed to persist theme preferences', error);
      }
    },
    [getWindowApi, invalidateHydratedPreferences, setThemeMode, themeMode],
  );

  const persistFallbackAgentId = useCallback(
    async (nextFallbackAgentId: string | null): Promise<void> => {
      const previousFallbackAgentId = fallbackAgentId;
      if (nextFallbackAgentId === previousFallbackAgentId) {
        return;
      }

      invalidateHydratedPreferences();
      setFallbackAgentId(nextFallbackAgentId);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = getNextRequestId(latestFallbackAgentRequestIdRef);

      try {
        const updatedPreferences = await api.preferences.update({
          fallbackAgentId: nextFallbackAgentId,
        });

        if (isLatestRequest(latestFallbackAgentRequestIdRef, requestId)) {
          setFallbackAgentId(updatedPreferences.fallbackAgentId);
          setFallbackAgentOptions(toFallbackAgentOptions(updatedPreferences));
        }
      } catch (error) {
        if (isLatestRequest(latestFallbackAgentRequestIdRef, requestId)) {
          setFallbackAgentId(previousFallbackAgentId);
        }

        reportRendererError('Failed to persist fallback agent preferences', error);
      }
    },
    [
      fallbackAgentId,
      getWindowApi,
      invalidateHydratedPreferences,
      setFallbackAgentId,
      setFallbackAgentOptions,
    ],
  );

  useEffect(() => {
    let isCancelled = false;
    const api = getWindowApi();

    if (!api) {
      return;
    }

    const loadPreferences = async (): Promise<void> => {
      const hydrationVersion = hydrationVersionRef.current;

      try {
        const preferences = await api.preferences.getAll();
        if (!isCancelled && hydrationVersion === hydrationVersionRef.current) {
          applyHydratedPreferences(preferences);
        }
      } catch (error) {
        reportRendererError('Failed to load preferences', error);
      }
    };

    void loadPreferences();

    return () => {
      isCancelled = true;
    };
  }, [applyHydratedPreferences, getWindowApi]);

  return {
    fallbackAgentId,
    fallbackAgentOptions,
    fallbackWarningLineThreshold,
    invalidateHydratedPreferences,
    persistThemeMode,
    persistFallbackAgentId,
  };
};
