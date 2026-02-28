import { spawn as spawnProcess } from 'node:child_process';
import type { AgentConfig } from '../../shared/preferences';
import type { FallbackStatus } from '../../shared/prettifier';

type ExecutorStatus = Exclude<
  FallbackStatus,
  'not-attempted' | 'skipped-no-fallback' | 'skipped-invalid-agent'
>;

export type AgentFallbackExecutionInput = {
  agent: AgentConfig;
  prompt: string;
  inputText: string;
  onProgressLine?: (line: string) => void;
};

export type AgentFallbackExecutionResult = {
  status: ExecutorStatus;
  outputText: string | null;
  exitCode: number | null;
  stderrLength: number;
  durationMs: number;
};

type ExecutorDependencies = {
  spawn?: SpawnProcessLike;
  now?: () => number;
};

type SpawnedProcess = {
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
  on(event: 'close', listener: (code: number | null) => void): unknown;
  stdout?: {
    on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
  };
  stderr?: {
    on: (event: 'data', listener: (chunk: Buffer | string) => void) => unknown;
  };
  stdin?: {
    on: (event: 'error', listener: () => void) => unknown;
    end: (chunk: string) => void;
  };
  kill: (signal?: NodeJS.Signals) => void;
};

export type SpawnProcessLike = (
  command: string,
  args: string[],
  options: { shell: false; stdio: 'pipe' },
) => SpawnedProcess;

const extractMarkdownFencedContent = (outputText: string): string | null => {
  const match = outputText.trim().match(/^```[^\n`]*\n([\s\S]*?)\n```$/u);
  if (!match || typeof match[1] !== 'string') {
    return null;
  }

  return match[1];
};

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[ -/]*[@-~]`, 'gu');
const MAX_PROGRESS_LINE_LENGTH = 200;

const extractLastProgressLine = (chunkText: string): string | null => {
  const stripped = chunkText.replace(ANSI_ESCAPE_PATTERN, '');
  const candidates = stripped
    .split(/[\r\n]+/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const lastCandidate = candidates.at(-1);
  if (!lastCandidate) {
    return null;
  }

  if (lastCandidate.length <= MAX_PROGRESS_LINE_LENGTH) {
    return lastCandidate;
  }

  return `${lastCandidate.slice(0, MAX_PROGRESS_LINE_LENGTH - 3)}...`;
};

export type AgentFallbackExecutor = {
  execute: (input: AgentFallbackExecutionInput) => Promise<AgentFallbackExecutionResult>;
};

export const createAgentFallbackExecutor = (
  dependencies: ExecutorDependencies = {},
): AgentFallbackExecutor => {
  const spawn: SpawnProcessLike =
    dependencies.spawn ??
    ((command, args, options) => {
      return spawnProcess(command, args, options) as unknown as SpawnedProcess;
    });
  const now = dependencies.now ?? Date.now;

  return {
    execute: async ({ agent, prompt, onProgressLine }) => {
      const startedAt = now();
      const args =
        agent.promptDelivery === 'arg' ? [...agent.argsTemplate, prompt] : [...agent.argsTemplate];

      return await new Promise<AgentFallbackExecutionResult>((resolve) => {
        let finished = false;
        let timedOut = false;
        let outputTooLarge = false;
        let stdoutLength = 0;
        let stderrLength = 0;
        let stdout = '';
        let lastExitCode: number | null = null;

        const finish = (
          status: ExecutorStatus,
          outputText: string | null,
          exitCode: number | null,
        ): void => {
          if (finished) {
            return;
          }

          finished = true;
          clearTimeout(timeoutHandle);

          resolve({
            status,
            outputText,
            exitCode,
            stderrLength,
            durationMs: now() - startedAt,
          });
        };

        const child = spawn(agent.executable, args, {
          shell: false,
          stdio: 'pipe',
        });

        const timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, agent.timeoutMs);

        child.on('error', (error) => {
          const code = typeof error === 'object' && error && 'code' in error ? error.code : null;

          if (code === 'ENOENT') {
            finish('failed-not-installed', null, null);
            return;
          }

          finish('failed-spawn-error', null, null);
        });

        child.stdout?.on('data', (chunk: Buffer | string) => {
          const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          const progressLine = extractLastProgressLine(chunkText);
          if (progressLine && onProgressLine) {
            try {
              onProgressLine(progressLine);
            } catch {
              // Progress callbacks are best-effort and must not affect execution.
            }
          }

          const chunkByteLength = Buffer.byteLength(chunkText);
          stdoutLength += chunkByteLength;

          if (stdoutLength > agent.maxOutputBytes) {
            outputTooLarge = true;
            child.kill('SIGKILL');
            return;
          }

          stdout += chunkText;
        });

        child.stderr?.on('data', (chunk: Buffer | string) => {
          const chunkText = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          const progressLine = extractLastProgressLine(chunkText);
          if (progressLine && onProgressLine) {
            try {
              onProgressLine(progressLine);
            } catch {
              // Progress callbacks are best-effort and must not affect execution.
            }
          }

          stderrLength += Buffer.byteLength(chunkText);
        });

        if (agent.promptDelivery === 'stdin') {
          child.stdin?.on('error', () => {
            // Swallow stream write errors, process exit path will classify the final status.
          });
          child.stdin?.end(prompt);
        }

        child.on('close', (code) => {
          lastExitCode = code;

          if (timedOut) {
            finish('failed-timeout', null, lastExitCode);
            return;
          }

          if (outputTooLarge) {
            finish('failed-output-too-large', null, lastExitCode);
            return;
          }

          if (code !== 0) {
            finish('failed-non-zero-exit', null, lastExitCode);
            return;
          }

          const trimmedOutput = stdout.trim();
          if (!trimmedOutput) {
            finish('failed-invalid-output', null, lastExitCode);
            return;
          }

          const fencedContent = extractMarkdownFencedContent(stdout);
          const outputText = fencedContent ?? stdout;
          if (!outputText.trim()) {
            finish('failed-invalid-output', null, lastExitCode);
            return;
          }

          finish('applied', outputText, lastExitCode);
        });
      });
    },
  };
};
