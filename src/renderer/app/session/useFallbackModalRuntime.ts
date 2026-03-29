import { useCallback, useEffect, useRef } from 'react';
import {
  createAgentSelectionFallbackModalState,
  createLargeContentFallbackModalState,
} from './prettifierSessionDomain';
import { selectFallbackModalState } from './documentSessionSelectors';
import { useDocumentSession } from './useDocumentSession';

export const useFallbackModalRuntime = () => {
  const fallbackModalState = useDocumentSession(selectFallbackModalState);
  const setFallbackModalState = useDocumentSession((state) => state.setFallbackModalState);
  const fallbackConfirmationResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const fallbackAgentSelectionResolverRef = useRef<((agentId: string | null) => void) | null>(null);

  const cancelPendingFallbackPrompts = useCallback((): void => {
    if (fallbackConfirmationResolverRef.current) {
      fallbackConfirmationResolverRef.current(false);
      fallbackConfirmationResolverRef.current = null;
    }

    if (fallbackAgentSelectionResolverRef.current) {
      fallbackAgentSelectionResolverRef.current(null);
      fallbackAgentSelectionResolverRef.current = null;
    }

    setFallbackModalState(null);
  }, [setFallbackModalState]);

  const requestFallbackConfirmation = useCallback(
    (lineCount: number): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        cancelPendingFallbackPrompts();
        fallbackConfirmationResolverRef.current = resolve;
        setFallbackModalState(createLargeContentFallbackModalState(lineCount));
      });
    },
    [cancelPendingFallbackPrompts, setFallbackModalState],
  );

  const settleFallbackConfirmation = useCallback(
    (accepted: boolean): void => {
      const resolver = fallbackConfirmationResolverRef.current;
      fallbackConfirmationResolverRef.current = null;
      setFallbackModalState(null);
      resolver?.(accepted);
    },
    [setFallbackModalState],
  );

  const requestFallbackAgentSelection = useCallback((): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      cancelPendingFallbackPrompts();
      fallbackAgentSelectionResolverRef.current = resolve;
      setFallbackModalState(createAgentSelectionFallbackModalState());
    });
  }, [cancelPendingFallbackPrompts, setFallbackModalState]);

  const settleFallbackAgentSelection = useCallback(
    (agentId: string | null): void => {
      const resolver = fallbackAgentSelectionResolverRef.current;
      fallbackAgentSelectionResolverRef.current = null;
      setFallbackModalState(null);
      resolver?.(agentId);
    },
    [setFallbackModalState],
  );

  useEffect(() => {
    return () => {
      cancelPendingFallbackPrompts();
    };
  }, [cancelPendingFallbackPrompts]);

  return {
    fallbackModalState,
    requestFallbackConfirmation,
    requestFallbackAgentSelection,
    cancelPendingFallbackPrompts,
    settleFallbackConfirmation,
    settleFallbackAgentSelection,
  };
};
