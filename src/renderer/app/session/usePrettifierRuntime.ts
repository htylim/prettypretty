import { useCallback, useEffect, useRef } from 'react';
import type {
  PrettifyRunRequest,
  PrettifyRunResponse,
  PrettifierProgressEvent,
} from '../../../shared/prettifier';
import type { WindowApi } from '../../../shared/window-api';
import { reportRendererError } from '../reportRendererError';

type UsePrettifierRuntimeOptions = {
  getWindowApi: () => WindowApi | null;
  onProgress: (event: PrettifierProgressEvent) => void;
};

export const usePrettifierRuntime = ({ getWindowApi, onProgress }: UsePrettifierRuntimeOptions) => {
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const api = getWindowApi();
    if (!api) {
      return;
    }

    return api.prettifier.onProgress((event) => {
      onProgressRef.current(event);
    });
  }, [getWindowApi]);

  const cancelPrettifierFallback = useCallback(
    async (requestId: number): Promise<void> => {
      const api = getWindowApi();
      if (!api) {
        return;
      }

      try {
        await api.prettifier.cancel({ requestId });
      } catch (error) {
        reportRendererError('Failed to cancel prettifier fallback', error);
      }
    },
    [getWindowApi],
  );

  const runPrettifier = useCallback(
    async (request: PrettifyRunRequest): Promise<PrettifyRunResponse | null> => {
      const api = getWindowApi();
      if (!api) {
        return null;
      }

      return api.prettifier.run(request);
    },
    [getWindowApi],
  );

  return {
    runPrettifier,
    cancelPrettifierFallback,
  };
};
