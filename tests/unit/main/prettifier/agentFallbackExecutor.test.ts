// @vitest-environment node

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConfig } from '../../../../src/shared/preferences';
import {
  createAgentFallbackExecutor,
  type SpawnProcessLike,
} from '../../../../src/main/prettifier/agentFallbackExecutor';

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: EventEmitter & { end: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
};

const createAgent = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  id: 'codex',
  name: 'Codex',
  executable: 'codex',
  argsTemplate: ['exec', '-'],
  promptTemplate: '<TEXT>\n{input}\n</TEXT>',
  promptDelivery: 'stdin',
  enabled: true,
  timeoutMs: 1000,
  maxOutputBytes: 1024,
  ...overrides,
});

const createMockChildProcess = (): MockChildProcess => {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), { end: vi.fn() });
  child.kill = vi.fn(() => {
    child.emit('close', null);
  });
  return child;
};

describe('agentFallbackExecutor', () => {
  let spawnMock: ReturnType<typeof vi.fn>;
  let child: MockChildProcess;

  beforeEach(() => {
    spawnMock = vi.fn();
    child = createMockChildProcess();
    spawnMock.mockReturnValue(child);
  });

  it('executes configured agent with stdin prompt delivery', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent({ promptDelivery: 'stdin' }),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stdout.emit('data', '{\n  "a": 1\n}\n');
    child.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      status: 'applied',
      outputText: '{\n  "a": 1\n}\n',
      exitCode: 0,
    });
    expect(child.stdin.end).toHaveBeenCalledWith('rendered prompt');
  });

  it('executes configured agent with arg prompt delivery', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const agent = createAgent({ promptDelivery: 'arg', argsTemplate: ['exec', '--model', 'x'] });
    const promise = executor.execute({
      agent,
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stdout.emit('data', '{\n  "a": 1\n}\n');
    child.emit('close', 0);
    await promise;

    expect(spawnMock).toHaveBeenCalledWith('codex', ['exec', '--model', 'x', 'rendered prompt'], {
      shell: false,
      stdio: 'pipe',
    });
    expect(child.stdin.end).not.toHaveBeenCalled();
  });

  it('returns failed-not-installed on ENOENT', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    const error = Object.assign(new Error('missing binary'), { code: 'ENOENT' });
    child.emit('error', error);

    await expect(promise).resolves.toMatchObject({
      status: 'failed-not-installed',
      outputText: null,
      exitCode: null,
    });
  });

  it('returns failed-non-zero-exit when process exits with non-zero code', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stderr.emit('data', 'execution failed');
    child.emit('close', 2);

    await expect(promise).resolves.toMatchObject({
      status: 'failed-non-zero-exit',
      outputText: null,
      exitCode: 2,
    });
  });

  it('returns failed-timeout when process exceeds timeout', async () => {
    vi.useFakeTimers();
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent({ timeoutMs: 10 }),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    await vi.advanceTimersByTimeAsync(15);

    await expect(promise).resolves.toMatchObject({
      status: 'failed-timeout',
      outputText: null,
    });
    expect(child.kill).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('returns failed-output-too-large when stdout exceeds configured max bytes', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent({ maxOutputBytes: 4 }),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stdout.emit('data', '12345');

    await expect(promise).resolves.toMatchObject({
      status: 'failed-output-too-large',
      outputText: null,
    });
    expect(child.kill).toHaveBeenCalledTimes(1);
  });

  it('returns failed-invalid-output for empty output', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stdout.emit('data', '   ');
    child.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      status: 'failed-invalid-output',
      outputText: null,
    });
  });

  it('unwraps markdown fenced output', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stdout.emit('data', '```json\n{"a":1}\n```');
    child.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      status: 'applied',
      outputText: '{"a":1}',
    });
  });

  it('accepts unchanged non-empty output', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.stdout.emit('data', '{"a":1}');
    child.emit('close', 0);

    await expect(promise).resolves.toMatchObject({
      status: 'applied',
      outputText: '{"a":1}',
    });
  });

  it('returns failed-spawn-error for non-ENOENT spawn errors', async () => {
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
    });

    child.emit('error', new Error('spawn failed'));

    await expect(promise).resolves.toMatchObject({
      status: 'failed-spawn-error',
      outputText: null,
      exitCode: null,
    });
  });

  it('emits last progress line from stdout and stderr chunks', async () => {
    const onProgressLine = vi.fn();
    const executor = createAgentFallbackExecutor({
      spawn: spawnMock as unknown as SpawnProcessLike,
    });
    const promise = executor.execute({
      agent: createAgent(),
      prompt: 'rendered prompt',
      inputText: '{"a":1}',
      onProgressLine,
    });

    child.stderr.emit('data', 'step 1/3\rstep 2/3\r');
    child.stdout.emit('data', '\u001b[32mthinking...\u001b[0m\n');
    child.stdout.emit('data', '{\n  "a": 1\n}\n');
    child.emit('close', 0);

    await promise;

    expect(onProgressLine).toHaveBeenCalledWith('step 2/3');
    expect(onProgressLine).toHaveBeenCalledWith('thinking...');
    expect(onProgressLine).toHaveBeenCalledWith('}');
  });
});
