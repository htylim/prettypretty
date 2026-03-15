import { useEffect, useRef } from 'react';
import type { AppNavigationCommand } from '../../shared/window-api';
import { getWindowApi } from './windowApi';

type UseMouseNavigationShortcutsOptions = {
  isOutputMode: boolean;
  navigateOutputPaneViewport: (stepDelta: number) => void;
};

const BACK_MOUSE_BUTTON = 3;
const FORWARD_MOUSE_BUTTON = 4;
const DUPLICATE_NAVIGATION_WINDOW_MS = 80;

const getStepDeltaForCommand = (command: AppNavigationCommand): number => {
  return command === 'browser-backward' ? -1 : 1;
};

const getCommandForMouseButton = (button: number): AppNavigationCommand | null => {
  if (button === BACK_MOUSE_BUTTON) {
    return 'browser-backward';
  }

  if (button === FORWARD_MOUSE_BUTTON) {
    return 'browser-forward';
  }

  return null;
};

export const useMouseNavigationShortcuts = ({
  isOutputMode,
  navigateOutputPaneViewport,
}: UseMouseNavigationShortcutsOptions): void => {
  const lastNavigationRef = useRef<{
    command: AppNavigationCommand;
    handledAt: number;
  } | null>(null);

  useEffect(() => {
    const handleNavigationCommand = (command: AppNavigationCommand): boolean => {
      if (!isOutputMode) {
        return false;
      }

      const now = Date.now();
      const lastNavigation = lastNavigationRef.current;
      if (
        lastNavigation &&
        lastNavigation.command === command &&
        now - lastNavigation.handledAt <= DUPLICATE_NAVIGATION_WINDOW_MS
      ) {
        return false;
      }

      lastNavigationRef.current = {
        command,
        handledAt: now,
      };
      navigateOutputPaneViewport(getStepDeltaForCommand(command));
      return true;
    };

    const api = getWindowApi();
    const unsubscribeNativeNavigation =
      typeof api?.app.onNavigationCommand === 'function'
        ? api.app.onNavigationCommand((command) => {
            handleNavigationCommand(command);
          })
        : undefined;

    const handleMouseDown = (event: MouseEvent): void => {
      if (event.defaultPrevented) {
        return;
      }

      const command = getCommandForMouseButton(event.button);
      if (!command) {
        return;
      }

      const didNavigate = handleNavigationCommand(command);
      if (!didNavigate && !isOutputMode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      unsubscribeNativeNavigation?.();
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [isOutputMode, navigateOutputPaneViewport]);
};
