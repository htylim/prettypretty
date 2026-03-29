import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialDocumentSessionState } from '../../../../../src/renderer/app/session/documentSessionDomain';
import { useFallbackModalRuntime } from '../../../../../src/renderer/app/session/useFallbackModalRuntime';
import { useDocumentSession } from '../../../../../src/renderer/app/session/useDocumentSession';

type HarnessHandle = {
  getFallbackModalKind: () => string | null;
  requestFallbackConfirmation: (lineCount: number) => Promise<boolean>;
  requestFallbackAgentSelection: () => Promise<string | null>;
  cancelPendingFallbackPrompts: () => void;
  settleFallbackConfirmation: (accepted: boolean) => void;
  settleFallbackAgentSelection: (agentId: string | null) => void;
};

const ModalHarness = forwardRef<HarnessHandle>((_, ref) => {
  const runtime = useFallbackModalRuntime();

  useImperativeHandle(
    ref,
    () => ({
      getFallbackModalKind: () => runtime.fallbackModalState?.kind ?? null,
      requestFallbackConfirmation: runtime.requestFallbackConfirmation,
      requestFallbackAgentSelection: runtime.requestFallbackAgentSelection,
      cancelPendingFallbackPrompts: runtime.cancelPendingFallbackPrompts,
      settleFallbackConfirmation: runtime.settleFallbackConfirmation,
      settleFallbackAgentSelection: runtime.settleFallbackAgentSelection,
    }),
    [runtime],
  );

  return null;
});

ModalHarness.displayName = 'ModalHarness';

describe('useFallbackModalRuntime', () => {
  beforeEach(() => {
    useDocumentSession.setState(createInitialDocumentSessionState());
  });

  it('tracks confirmation prompts and settles them', async () => {
    const ref = { current: null as HarnessHandle | null };

    render(createElement(ModalHarness, { ref }));

    let accepted: boolean | null = null;
    act(() => {
      void ref.current?.requestFallbackConfirmation(12).then((value) => {
        accepted = value;
      });
    });

    await waitFor(() => {
      expect(ref.current?.getFallbackModalKind()).toBe('large-content');
    });

    act(() => {
      ref.current?.settleFallbackConfirmation(true);
    });

    await waitFor(() => {
      expect(accepted).toBe(true);
    });
    expect(ref.current?.getFallbackModalKind()).toBeNull();
  });

  it('cancels pending agent selection prompts', async () => {
    const ref = { current: null as HarnessHandle | null };

    render(createElement(ModalHarness, { ref }));

    let selected: string | null | undefined;
    act(() => {
      void ref.current?.requestFallbackAgentSelection().then((value) => {
        selected = value;
      });
    });

    await waitFor(() => {
      expect(ref.current?.getFallbackModalKind()).toBe('agent-selection');
    });

    act(() => {
      ref.current?.cancelPendingFallbackPrompts();
    });

    await waitFor(() => {
      expect(selected).toBeNull();
    });
    expect(ref.current?.getFallbackModalKind()).toBeNull();
  });
});
