import { act, render, waitFor } from '@testing-library/react';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrettifyRunResponse } from '../../../../src/shared/prettifier';
import type { WindowApi } from '../../../../src/shared/window-api';
import { createInitialDocumentSessionState } from '../../../../src/renderer/app/session/documentSessionDomain';
import { useDocumentSession } from '../../../../src/renderer/app/session/useDocumentSession';
import { usePrettifierRequestFlow } from '../../../../src/renderer/app/usePrettifierRequestFlow';

const runPrettifierMock = vi.fn();
const cancelPrettifierFallbackMock = vi.fn();

vi.mock('../../../../src/renderer/app/session/usePrettifierRuntime', () => ({
  usePrettifierRuntime: () => ({
    runPrettifier: runPrettifierMock,
    cancelPrettifierFallback: cancelPrettifierFallbackMock,
  }),
}));

type HarnessHandle = ReturnType<typeof usePrettifierRequestFlow>;

type HarnessProps = {
  api: WindowApi | null;
  fallbackAgentId?: string | null;
  fallbackAgentOptions?: { id: string; name: string; enabled: boolean }[];
  fallbackWarningLineThreshold?: number;
  requestFallbackConfirmation?: (lineCount: number) => Promise<boolean>;
  requestFallbackAgentSelection?: () => Promise<string | null>;
};

const RequestFlowHarness = forwardRef<HarnessHandle, HarnessProps>(
  (
    {
      api,
      fallbackAgentId = 'codex',
      fallbackAgentOptions = [{ id: 'codex', name: 'Codex', enabled: true }],
      fallbackWarningLineThreshold = 300,
      requestFallbackConfirmation = async () => true,
      requestFallbackAgentSelection = async () => null,
    },
    ref,
  ) => {
    const flow = usePrettifierRequestFlow({
      indentSize: 2,
      fallbackWarningLineThreshold,
      fallbackAgentId,
      fallbackAgentOptions,
      getWindowApi: () => api,
      requestFallbackConfirmation,
      requestFallbackAgentSelection,
      logTelemetry: vi.fn().mockResolvedValue(undefined),
    });

    useImperativeHandle(ref, () => flow, [flow]);

    return null;
  },
);

RequestFlowHarness.displayName = 'RequestFlowHarness';

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};

describe('usePrettifierRequestFlow', () => {
  beforeEach(() => {
    useDocumentSession.setState(createInitialDocumentSessionState());
    runPrettifierMock.mockReset();
    cancelPrettifierFallbackMock.mockReset();
  });

  it('returns the local result without spawning fallback work for JSON input', async () => {
    const ref = { current: null as HarnessHandle | null };

    render(createElement(RequestFlowHarness, { api: null, ref }));

    await act(async () => {
      const response = await ref.current?.requestPrettifier('{"a":1}', 'context-pane-prettify');
      expect(response).toEqual({
        status: 'applied-local',
        outputText: '{\n  "a": 1\n}',
        localDetection: 'json',
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: expect.any(Number),
      });
    });

    expect(runPrettifierMock).not.toHaveBeenCalled();
    expect(cancelPrettifierFallbackMock).not.toHaveBeenCalled();
  });

  it('keeps large plain text on the local path without fallback wait or confirmation', async () => {
    const ref = { current: null as HarnessHandle | null };
    const requestFallbackConfirmation = vi.fn().mockResolvedValue(true);
    const largePlainText = Array.from({ length: 400 }, (_, index) => `line ${index}`).join('\n');

    render(
      createElement(RequestFlowHarness, {
        api: {} as WindowApi,
        fallbackWarningLineThreshold: 1,
        requestFallbackConfirmation,
        ref,
      }),
    );

    await act(async () => {
      const response = await ref.current?.requestPrettifier(largePlainText, 'switch-output');
      expect(response).toEqual({
        status: 'applied-local',
        outputText: largePlainText,
        localDetection: 'text',
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: expect.any(Number),
      });
    });

    expect(requestFallbackConfirmation).not.toHaveBeenCalled();
    expect(runPrettifierMock).not.toHaveBeenCalled();
    expect(useDocumentSession.getState().fallbackWaitState).toBeNull();
  });

  it('tracks fallback wait state and resolves explicit cancellation to passthrough output', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    runPrettifierMock.mockReturnValueOnce(deferred.promise);
    const ref = { current: null as HarnessHandle | null };
    const api = {} as WindowApi;

    render(createElement(RequestFlowHarness, { api, ref }));

    let requestPromise: Promise<PrettifyRunResponse | null> | undefined;
    act(() => {
      requestPromise = ref.current?.requestPrettifier('{bad', 'context-pane-prettify');
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fallbackWaitState).not.toBeNull();
    });

    expect(ref.current?.isLlmRunning).toBe(true);
    expect(runPrettifierMock).toHaveBeenCalledWith({
      requestId: 1,
      inputText: '{bad',
      indentSize: 2,
      trigger: 'context-pane-prettify',
    });

    await act(async () => {
      await ref.current?.cancelActiveFallback();
    });

    expect(cancelPrettifierFallbackMock).toHaveBeenCalledWith(1);
    expect(useDocumentSession.getState().fallbackWaitState).toBeNull();

    deferred.resolve({
      status: 'applied-fallback',
      outputText: '{\n  "ok": true\n}',
      localDetection: 'malformed',
      fallbackStatus: 'applied',
      agentId: 'codex',
      durationMs: 9,
    });

    await expect(requestPromise).resolves.toEqual({
      status: 'passthrough-fallback-failed',
      outputText: '{bad',
      localDetection: 'malformed',
      fallbackStatus: 'failed-canceled',
      agentId: 'codex',
      durationMs: expect.any(Number),
    });
  });

  it('clears stale fallback wait state when a newer request supersedes an active fallback', async () => {
    const deferred = createDeferred<PrettifyRunResponse>();
    runPrettifierMock.mockReturnValueOnce(deferred.promise);
    const ref = { current: null as HarnessHandle | null };
    const api = {} as WindowApi;

    render(createElement(RequestFlowHarness, { api, ref }));

    let firstRequestPromise: Promise<PrettifyRunResponse | null> | undefined;
    act(() => {
      firstRequestPromise = ref.current?.requestPrettifier('{bad', 'context-pane-prettify');
    });

    await waitFor(() => {
      expect(useDocumentSession.getState().fallbackWaitState).not.toBeNull();
    });

    await act(async () => {
      const response = await ref.current?.requestPrettifier('{"a":1}', 'context-pane-prettify');
      expect(response).toEqual({
        status: 'applied-local',
        outputText: '{\n  "a": 1\n}',
        localDetection: 'json',
        fallbackStatus: 'not-attempted',
        agentId: null,
        durationMs: expect.any(Number),
      });
    });

    expect(cancelPrettifierFallbackMock).toHaveBeenCalledWith(1);
    expect(useDocumentSession.getState().fallbackWaitState).toBeNull();

    deferred.resolve({
      status: 'applied-fallback',
      outputText: '{\n  "ok": true\n}',
      localDetection: 'malformed',
      fallbackStatus: 'applied',
      agentId: 'codex',
      durationMs: 9,
    });

    await expect(firstRequestPromise).resolves.toBeNull();
    expect(useDocumentSession.getState().fallbackWaitState).toBeNull();
  });
});
