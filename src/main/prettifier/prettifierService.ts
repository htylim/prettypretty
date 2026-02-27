import type { Logger } from '../logging/logger';
import type { PreferencesService } from '../preferences/preferencesService';
import {
  createAgentFallbackExecutor,
  type AgentFallbackExecutor,
  type AgentFallbackExecutionResult,
} from './agentFallbackExecutor';
import { renderAgentPromptTemplate } from './agentPromptTemplate';
import { runLocalPrettifier } from './localPrettifier';
import type { PrettifyRunRequest, PrettifyRunResponse } from '../../shared/prettifier';

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
};

const summarizeFallbackResult = (
  fallbackResult: AgentFallbackExecutionResult,
  localDetection: PrettifyRunResponse['localDetection'],
  request: PrettifyRunRequest,
  agentId: string,
  durationMs: number,
): PrettifyRunResponse => {
  if (fallbackResult.status === 'applied' && fallbackResult.outputText !== null) {
    return {
      status: 'applied-fallback',
      outputText: fallbackResult.outputText,
      localDetection,
      fallbackStatus: 'applied',
      agentId,
      durationMs,
    };
  }

  return {
    status: 'passthrough-fallback-failed',
    outputText: request.inputText,
    localDetection,
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
      logger.info('prettifier.run.requested', {
        trigger: request.trigger,
        inputLength: request.inputText.length,
        indentSize: request.indentSize,
        requestId: request.requestId,
      });

      const localResult = runLocalPrettifier(request.inputText, request.indentSize);
      logger.info('prettifier.local.detected', {
        localDetection: localResult.detection,
        localResultKind: localResult.kind,
      });

      if (localResult.kind === 'applied') {
        const response: PrettifyRunResponse = {
          status: 'applied-local',
          outputText: localResult.outputText,
          localDetection: localResult.detection,
          fallbackStatus: 'not-attempted',
          agentId: null,
          durationMs: now() - startedAt,
        };

        logger.info('prettifier.run.completed', {
          status: response.status,
          localDetection: response.localDetection,
          fallbackStatus: response.fallbackStatus,
          durationMs: response.durationMs,
        });

        return response;
      }

      const preferences = await preferencesService.getAll();
      if (!preferences.fallbackAgentId) {
        const response: PrettifyRunResponse = {
          status: 'passthrough-no-fallback',
          outputText: request.inputText,
          localDetection: localResult.detection,
          fallbackStatus: 'skipped-no-fallback',
          agentId: null,
          durationMs: now() - startedAt,
        };

        logger.info('prettifier.fallback.decision', {
          fallbackStatus: response.fallbackStatus,
          reason: 'fallback-agent-id-not-configured',
        });
        logger.info('prettifier.run.completed', {
          status: response.status,
          localDetection: response.localDetection,
          fallbackStatus: response.fallbackStatus,
          durationMs: response.durationMs,
        });

        return response;
      }

      const fallbackAgent = preferences.agents.find(
        (agent) => agent.id === preferences.fallbackAgentId,
      );
      if (!fallbackAgent || !fallbackAgent.enabled) {
        const response: PrettifyRunResponse = {
          status: 'passthrough-no-fallback',
          outputText: request.inputText,
          localDetection: localResult.detection,
          fallbackStatus: 'skipped-invalid-agent',
          agentId: preferences.fallbackAgentId,
          durationMs: now() - startedAt,
        };

        logger.info('prettifier.fallback.decision', {
          fallbackStatus: response.fallbackStatus,
          fallbackAgentId: preferences.fallbackAgentId,
        });
        logger.info('prettifier.run.completed', {
          status: response.status,
          localDetection: response.localDetection,
          fallbackStatus: response.fallbackStatus,
          durationMs: response.durationMs,
        });

        return response;
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

        const response: PrettifyRunResponse = {
          status: 'passthrough-fallback-failed',
          outputText: request.inputText,
          localDetection: localResult.detection,
          fallbackStatus: 'failed-spawn-error',
          agentId: fallbackAgent.id,
          durationMs: now() - startedAt,
        };
        logger.info('prettifier.run.completed', {
          status: response.status,
          localDetection: response.localDetection,
          fallbackStatus: response.fallbackStatus,
          durationMs: response.durationMs,
        });

        return response;
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
        localResult.detection,
        request,
        fallbackAgent.id,
        now() - startedAt,
      );

      logger.info('prettifier.run.completed', {
        status: response.status,
        localDetection: response.localDetection,
        fallbackStatus: response.fallbackStatus,
        durationMs: response.durationMs,
      });

      return response;
    },
  };
};
