import type { Logger } from '../logging/logger';
import type { PreferencesService } from '../preferences/preferencesService';
import {
  createAgentFallbackExecutor,
  type AgentFallbackExecutor,
  type AgentFallbackExecutionResult,
} from './agentFallbackExecutor';
import { renderAgentPromptTemplate } from './agentPromptTemplate';
import { runLocalPrettifier } from './localPrettifier';
import {
  flattenLocalPrettifySummary,
  summarizeLocalPrettifyResult,
  type LocalPrettifySummary,
  type PrettifyRunRequest,
  type PrettifyRunResponse,
} from '../../shared/prettifier';

type PrettifierServiceDependencies = {
  preferencesService: Pick<PreferencesService, 'getAll'>;
  logger: Logger;
  fallbackExecutor?: AgentFallbackExecutor;
  now?: () => number;
};

type PrettifierRunOptions = {
  onFallbackProgress?: (line: string) => void;
};

export type PrettifierService = {
  run: (
    request: PrettifyRunRequest,
    options?: PrettifierRunOptions,
  ) => Promise<PrettifyRunResponse>;
  cancel: (requestId: number) => boolean;
};

// Centralize completion logging so every exit path reports the same metadata.
const logCompletedRun = (logger: Logger, response: PrettifyRunResponse): PrettifyRunResponse => {
  logger.info('prettifier.run.completed', {
    status: response.status,
    fallbackStatus: response.fallbackStatus,
    durationMs: response.durationMs,
    ...flattenLocalPrettifySummary(response.localResult),
  });

  return response;
};

// Passthrough responses all preserve the original input; only the reason/status varies.
const createPassthroughResponse = (
  request: PrettifyRunRequest,
  localResult: PrettifyRunResponse['localResult'],
  fallbackStatus: PrettifyRunResponse['fallbackStatus'],
  agentId: string | null,
  durationMs: number,
  status: Extract<
    PrettifyRunResponse['status'],
    'passthrough-no-fallback' | 'passthrough-fallback-failed'
  >,
): PrettifyRunResponse => {
  return {
    status,
    outputText: request.inputText,
    localResult,
    fallbackStatus,
    agentId,
    durationMs,
  };
};

const summarizeFallbackResult = (
  fallbackResult: AgentFallbackExecutionResult,
  localResult: PrettifyRunResponse['localResult'],
  request: PrettifyRunRequest,
  agentId: string,
  durationMs: number,
): PrettifyRunResponse => {
  if (fallbackResult.status === 'applied' && fallbackResult.outputText !== null) {
    return {
      status: 'applied-fallback',
      outputText: fallbackResult.outputText,
      localResult,
      fallbackStatus: 'applied',
      agentId,
      durationMs,
    };
  }

  return {
    status: 'passthrough-fallback-failed',
    outputText: request.inputText,
    localResult,
    fallbackStatus: fallbackResult.status,
    agentId,
    durationMs,
  };
};

export const createPrettifierService = ({
  preferencesService,
  logger,
  fallbackExecutor = createAgentFallbackExecutor(),
  now = Date.now,
}: PrettifierServiceDependencies): PrettifierService => {
  return {
    run: async (request, options = {}) => {
      const startedAt = now();
      // `getDurationMs` keeps duration accounting consistent even when the flow
      // returns early from multiple decision branches.
      const getDurationMs = (): number => now() - startedAt;
      logger.info('prettifier.run.requested', {
        trigger: request.trigger,
        inputLength: request.inputText.length,
        indentSize: request.indentSize,
        requestId: request.requestId,
      });

      const localResult = await runLocalPrettifier(request.inputText, request.indentSize);
      const localSummary: LocalPrettifySummary = summarizeLocalPrettifyResult(localResult);
      logger.info('prettifier.local.detected', {
        localResultKind: localResult.kind,
        ...flattenLocalPrettifySummary(localSummary),
      });

      if (localResult.kind === 'applied') {
        return logCompletedRun(logger, {
          status: 'applied-local',
          outputText: localResult.outputText,
          localResult: localSummary,
          fallbackStatus: 'not-attempted',
          agentId: null,
          durationMs: getDurationMs(),
        });
      }

      const preferences = await preferencesService.getAll();
      const resolvedFallbackAgentId =
        request.fallbackAgentIdOverride ?? preferences.fallbackAgentId ?? null;

      // The renderer may request a one-off override, but main still validates
      // the resolved agent against current persisted preferences before execution.
      if (!resolvedFallbackAgentId) {
        logger.info('prettifier.fallback.decision', {
          fallbackStatus: 'skipped-no-fallback',
          reason: 'fallback-agent-id-not-configured',
        });
        return logCompletedRun(
          logger,
          createPassthroughResponse(
            request,
            localSummary,
            'skipped-no-fallback',
            null,
            getDurationMs(),
            'passthrough-no-fallback',
          ),
        );
      }

      const fallbackAgent = preferences.agents.find(
        (agent) => agent.id === resolvedFallbackAgentId,
      );
      if (!fallbackAgent || !fallbackAgent.enabled) {
        logger.info('prettifier.fallback.decision', {
          fallbackStatus: 'skipped-invalid-agent',
          fallbackAgentId: resolvedFallbackAgentId,
        });
        return logCompletedRun(
          logger,
          createPassthroughResponse(
            request,
            localSummary,
            'skipped-invalid-agent',
            resolvedFallbackAgentId,
            getDurationMs(),
            'passthrough-no-fallback',
          ),
        );
      }

      const prompt = renderAgentPromptTemplate(
        fallbackAgent.promptTemplate,
        request.inputText,
        request.indentSize,
      );

      logger.info('prettifier.fallback.start', {
        agentId: fallbackAgent.id,
        promptDelivery: fallbackAgent.promptDelivery,
        timeoutMs: fallbackAgent.timeoutMs,
        maxOutputBytes: fallbackAgent.maxOutputBytes,
      });

      let fallbackResult: AgentFallbackExecutionResult;
      try {
        const fallbackExecutionInput = {
          requestId: request.requestId,
          agent: fallbackAgent,
          prompt,
          inputText: request.inputText,
          ...(options.onFallbackProgress ? { onProgressLine: options.onFallbackProgress } : {}),
        };

        fallbackResult = await fallbackExecutor.execute({
          ...fallbackExecutionInput,
        });
      } catch (error) {
        logger.error('prettifier.fallback.end', {
          agentId: fallbackAgent.id,
          fallbackStatus: 'failed-spawn-error',
          errorName: error instanceof Error ? error.name : 'unknown',
        });

        return logCompletedRun(
          logger,
          createPassthroughResponse(
            request,
            localSummary,
            'failed-spawn-error',
            fallbackAgent.id,
            getDurationMs(),
            'passthrough-fallback-failed',
          ),
        );
      }

      logger.info('prettifier.fallback.end', {
        agentId: fallbackAgent.id,
        fallbackStatus: fallbackResult.status,
        exitCode: fallbackResult.exitCode,
        stderrLength: fallbackResult.stderrLength,
        durationMs: fallbackResult.durationMs,
      });

      const response = summarizeFallbackResult(
        fallbackResult,
        localSummary,
        request,
        fallbackAgent.id,
        getDurationMs(),
      );

      return logCompletedRun(logger, response);
    },
    cancel: (requestId) => {
      const didCancel = fallbackExecutor.cancel(requestId);
      logger.info('prettifier.fallback.cancel.requested', {
        requestId,
        didCancel,
      });
      return didCancel;
    },
  };
};
