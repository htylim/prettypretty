import { useCallback, useEffect, useRef, useState } from 'react';
import type { IndentSize } from '../../shared/preferences';
import type { ThemeMode } from '../../shared/types';
import type { WindowApi } from '../../shared/window-api';
import { type FallbackAgentOption, toFallbackAgentOptions } from './appDomain';
import { reportRendererError } from './reportRendererError';

type UsePreferencesFlowOptions = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  setIndentSize: (size: IndentSize) => void;
  getWindowApi: () => WindowApi | null;
};

export type UsePreferencesFlowResult = {
  fallbackAgentId: string | null;
  fallbackAgentOptions: FallbackAgentOption[];
  persistThemeMode: (nextThemeMode: ThemeMode) => Promise<void>;
  persistFallbackAgentId: (nextFallbackAgentId: string | null) => Promise<void>;
};

export const usePreferencesFlow = ({
  themeMode,
  setThemeMode,
  setIndentSize,
  getWindowApi,
}: UsePreferencesFlowOptions): UsePreferencesFlowResult => {
  const latestThemeRequestIdRef = useRef(0);
  const latestFallbackAgentRequestIdRef = useRef(0);
  const [fallbackAgentId, setFallbackAgentId] = useState<string | null>(null);
  const [fallbackAgentOptions, setFallbackAgentOptions] = useState<FallbackAgentOption[]>([]);

  const persistThemeMode = useCallback(
    async (nextThemeMode: ThemeMode): Promise<void> => {
      const previousThemeMode = themeMode;
      if (nextThemeMode === previousThemeMode) {
        return;
      }

      setThemeMode(nextThemeMode);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = latestThemeRequestIdRef.current + 1;
      latestThemeRequestIdRef.current = requestId;

      try {
        const updatedPreferences = await api.preferences.update({ themeMode: nextThemeMode });

        if (requestId === latestThemeRequestIdRef.current) {
          setThemeMode(updatedPreferences.themeMode);
        }
      } catch (error) {
        if (requestId === latestThemeRequestIdRef.current) {
          setThemeMode(previousThemeMode);
        }

        reportRendererError('Failed to persist theme preferences', error);
      }
    },
    [getWindowApi, setThemeMode, themeMode],
  );

  const persistFallbackAgentId = useCallback(
    async (nextFallbackAgentId: string | null): Promise<void> => {
      const previousFallbackAgentId = fallbackAgentId;
      if (nextFallbackAgentId === previousFallbackAgentId) {
        return;
      }

      setFallbackAgentId(nextFallbackAgentId);

      const api = getWindowApi();
      if (!api) {
        return;
      }

      const requestId = latestFallbackAgentRequestIdRef.current + 1;
      latestFallbackAgentRequestIdRef.current = requestId;

      try {
        const updatedPreferences = await api.preferences.update({
          fallbackAgentId: nextFallbackAgentId,
        });

        if (requestId === latestFallbackAgentRequestIdRef.current) {
          setFallbackAgentId(updatedPreferences.fallbackAgentId);
          setFallbackAgentOptions(toFallbackAgentOptions(updatedPreferences));
        }
      } catch (error) {
        if (requestId === latestFallbackAgentRequestIdRef.current) {
          setFallbackAgentId(previousFallbackAgentId);
        }

        reportRendererError('Failed to persist fallback agent preferences', error);
      }
    },
    [fallbackAgentId, getWindowApi],
  );

  useEffect(() => {
    let cancelled = false;
    const api = getWindowApi();

    if (!api) {
      return;
    }

    void (async () => {
      try {
        const preferences = await api.preferences.getAll();
        if (!cancelled) {
          setThemeMode(preferences.themeMode);
          setIndentSize(preferences.indentSize);
          setFallbackAgentId(preferences.fallbackAgentId);
          setFallbackAgentOptions(toFallbackAgentOptions(preferences));
        }
      } catch (error) {
        reportRendererError('Failed to load preferences', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getWindowApi, setIndentSize, setThemeMode]);

  return {
    fallbackAgentId,
    fallbackAgentOptions,
    persistThemeMode,
    persistFallbackAgentId,
  };
};
