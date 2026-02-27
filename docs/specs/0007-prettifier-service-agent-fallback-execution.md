# 0007 Prettifier Service Agent Fallback Execution

## Goal

Extend prettification so local parsing stays first, and configured LLM agents are used as fallback only when local prettification cannot produce a result, triggered only when output mode is requested.
This spec implements actual fallback execution (not just persisted configuration) using the existing agent preference model (`agents`, `fallbackAgentId`, `promptTemplate`, `promptDelivery`, `timeoutMs`, `maxOutputBytes`).
Example: if input is malformed JSON or an unsupported structured format, the app invokes the configured fallback agent non-interactively and uses its returned text as output.

## Problem / Context

Current behavior is renderer-local parsing only (JSON -> JSON5 -> Python-literal normalization + JSON5) and passthrough on failure.
Agent configuration already exists in preferences, but there is no runtime pipeline to execute fallback agents and consume results.
Without this, unsupported or malformed inputs cannot benefit from configured non-interactive CLI agents (for example `amp`, `codex`).

## Deliverables

### Architecture and ownership decisions

- Keep local parser-first behavior in renderer `PrettifierService` for supported native formats.
- Add main-process fallback execution service for agent invocation; renderer must not spawn processes directly.
- Add a typed IPC channel for fallback invocation (`renderer -> preload -> main`).
- Keep preferences (`agents`, `fallbackAgentId`) as single source of truth in main `PreferencesService`.

### Local-first decision tree

- On each prettify request:

1. If input is empty/whitespace, return `''`.
2. Attempt local prettification first (strict JSON, JSON5 object-literal, Python dict-like normalization).
3. If local prettification succeeds with structured output, return local result immediately.
4. If local prettification is unsupported/failed, attempt fallback agent execution.
5. If fallback is unavailable or fails validation/execution, return original input unchanged.

- Local path must still handle:
  - JSON files natively,
  - Python dict-like payloads natively,
  - JavaScript object-literal payloads natively.

### Main-process fallback executor

- Add a dedicated executor module in `src/main` (for example `src/main/prettifier/agentFallbackExecutor.ts`).
- Resolve fallback agent from current preferences:
  - if `fallbackAgentId === null`, skip fallback,
  - if configured id is missing/disabled, skip fallback.
- Build prompt from configured `promptTemplate` by substituting:
  - `{input}` with raw input text,
  - `{indentSize}` with current indentation number.
- Command construction rules:
  - use `child_process.spawn` with `shell: false`,
  - executable = `agent.executable`,
  - args = `agent.argsTemplate`,
  - if `promptDelivery === 'stdin'`, write rendered prompt to stdin and close stdin,
  - if `promptDelivery === 'arg'`, append rendered prompt as the final argument.

### Execution safety and failure semantics

- Enforce `timeoutMs` with hard process termination on timeout.
- Enforce `maxOutputBytes` while collecting stdout; terminate process when exceeded.
- Capture stdout/stderr as UTF-8 text for result classification.
- Normalize execution outcomes into typed statuses, for example:
  - `applied`,
  - `skipped-no-fallback`,
  - `skipped-invalid-agent`,
  - `failed-not-installed`,
  - `failed-timeout`,
  - `failed-non-zero-exit`,
  - `failed-output-too-large`,
  - `failed-invalid-output`,
  - `failed-spawn-error`.
- Define `failed-not-installed` as spawn error `ENOENT`.

### Response validation and acceptance

- Fallback output is accepted only when:
  - process outcome is success,
  - stdout is non-empty after trim,
  - output size is within `maxOutputBytes`.
- On invalid output (empty/whitespace-only), treat as fallback failure and return original input.
- Do not throw to renderer for expected fallback failure paths; return typed failure and degrade gracefully.

### IPC and shared contracts

- Extend shared IPC contracts with a fallback prettify channel (for example `prettifier:prettify-with-fallback`).
- Add shared request/response types for fallback invocation.
- Add preload API method under a new namespace (for example `window.prettypretty.prettifier.prettifyWithFallback(...)`).
- Validate incoming IPC payload in main before execution.

### Renderer integration and sequencing

- Refactor output computation from sync `useMemo` to output-triggered async request orchestration so fallback can run.
- Preserve local-first fast path:
  - apply local result immediately when local succeeds,
  - only call IPC fallback when local path cannot prettify.
- Do not run prettifier while typing in input mode.
- Run prettifier only for:
  - non-empty ingestion (`open file`, `drop`, `paste`) that switches to output mode,
  - manual switch from input to output mode when content exists.
- Keep empty input in input mode.
- If `open file` or `drop` returns empty content, keep input mode and show inline notice (`File has no content.`).
- Do not show that empty-file notice for empty paste.
- Prevent stale async responses from overwriting newer input:
  - use request sequencing (`requestId`) and ignore outdated completions.
- Keep output deterministic:
  - fallback success replaces output,
  - fallback skip/failure keeps original input passthrough.
- Show a dedicated wait screen only while fallback IPC execution is in-flight; hide input/output editors during this state.
- Stream a single latest fallback execution line to the wait screen (best effort) through main->renderer IPC progress events keyed by request id.

### Logging and observability

- Add verbose logging mode behind `-v`/`--verbose`.
- Log startup/runtime events and prettifier/fallback pipeline milestones to stdout in verbose mode.
- Log fallback failures in main with structured reason and agent id (no prompt/body logging).
- Do not log raw input/output payloads to avoid sensitive content leakage.

### Testing requirements (mocked execution only)

- Do not execute real agents in tests.
- Mock process execution (`spawn`) and child-process events/streams.

- Add unit tests for fallback executor:
  - executes configured agent with `stdin` prompt delivery.
  - executes configured agent with `arg` prompt delivery.
  - returns `failed-not-installed` on `ENOENT`.
  - returns `failed-non-zero-exit` on non-zero exit code.
  - returns `failed-timeout` when process exceeds `timeoutMs`.
  - returns `failed-output-too-large` when stdout exceeds configured cap.
  - returns `failed-invalid-output` on empty/whitespace-only stdout.
  - returns `applied` and output text on successful execution.

- Add unit tests for fallback orchestrator service:
  - skips when `fallbackAgentId` is `null`.
  - skips when fallback agent is missing/disabled.
  - applies fallback output when executor succeeds.
  - returns original input path when executor fails.

- Add IPC tests:
  - channel is registered.
  - invalid payload is rejected.
  - valid payload is forwarded and typed response returned.

- Add renderer `App` tests:
  - prettifier is not invoked during input typing.
  - non-empty output mode switch invokes prettifier path.
  - local JSON/JS/Python success path never calls fallback IPC.
  - unsupported/malformed local path triggers fallback IPC.
  - fallback success updates output text.
  - fallback failure keeps passthrough output unchanged.
  - stale fallback response does not overwrite latest output.
  - empty open-file/drop keeps input mode and shows inline notice.
  - empty paste keeps input mode and does not show empty-file notice.
  - wait screen is visible while fallback is pending and hides on completion.
  - wait screen shows the latest streamed fallback progress line for the active request.

### Documentation updates required by implementation

- Update `docs/architecture.md`:
  - move fallback execution from future scope to implemented runtime flow,
  - document main-process ownership of child-process execution.
- Update `docs/ui-spec.md`:
  - define unsupported/malformed behavior as local-first then fallback attempt.
- Update `docs/dependencies-and-tools.md` only if execution dependencies are added.
- Update `docs/learnings.md` with failure patterns discovered during implementation.

Reference note for implementation agents: any code snippets in specs are intent examples only, not copy-paste source of truth.

## Acceptance Criteria

- [ ] Local parser-first behavior remains the default path for JSON, JS object-literal, and Python dict-like inputs.
- [ ] Unsupported/malformed local inputs trigger fallback agent attempt when configured.
- [ ] Fallback execution runs only in main process through typed IPC (no renderer process spawning).
- [ ] Fallback uses persisted preferences (`agents`, `fallbackAgentId`, prompt templates, timeout, output cap).
- [ ] Prompt token replacement supports `{input}` and `{indentSize}`.
- [ ] `stdin` and `arg` prompt delivery modes are both supported.
- [ ] Missing/uninstalled agent (`ENOENT`) is handled gracefully with passthrough result.
- [ ] Non-zero exit, timeout, oversized output, and invalid output are handled gracefully with passthrough result.
- [ ] Async response sequencing prevents stale fallback results from replacing newer output.
- [ ] Prettifier executes only on output-triggered paths (not per input keystroke).
- [ ] Empty open-file/drop content keeps input mode and shows inline notice.
- [ ] Empty paste keeps input mode without empty-file notice.
- [ ] Wait screen is visible while fallback execution is pending and editors are hidden.
- [ ] Wait screen displays the latest streamed fallback progress line for the active request only.
- [ ] Verbose logs emit to stdout only when app is started with `-v` / `--verbose`.
- [ ] Unit tests fully mock process execution (no real CLI execution in CI).
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `docs/specs/0007-prettifier-service-agent-fallback-execution.md`
- New: `src/shared/prettifier.ts` (fallback request/response contracts)
- New: `src/main/prettifier/agentPromptTemplate.ts`
- New: `src/main/prettifier/agentFallbackExecutor.ts`
- New: `src/main/prettifier/prettifierService.ts`
- New: `src/main/logging/runtimeFlags.ts`
- New: `src/main/logging/logger.ts`
- New: `tests/unit/main/prettifier/agentFallbackExecutor.test.ts`
- New: `tests/unit/main/prettifier/prettifierService.test.ts`
- New: `tests/unit/main/logging/runtimeFlags.test.ts`
- New: `tests/unit/main/logging/logger.test.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/shared/window-api.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/renderer/prettifier/prettifierService.ts` (surface local outcome metadata for orchestration)
- Modify: `src/renderer/App.tsx` (async fallback orchestration + stale-response guard)
- Modify: `tests/unit/main/ipc/preferencesIpc.test.ts` (or split into focused IPC tests if preferred)
- New: `tests/unit/main/ipc/prettifierIpc.test.ts`
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `tests/unit/renderer/components/EditorShell.test.tsx`
- Modify: `tests/unit/renderer/state/uiStore.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`

## Open Questions / Resolved Decisions

- Resolved: local parser path remains first and authoritative for natively supported formats.
- Resolved: fallback execution belongs in main process and is accessed through preload IPC.
- Resolved: fallback failures are non-fatal and must degrade to original-input passthrough.
- Resolved: tests must fully mock command execution and child-process behavior.
- Resolved: wait screen is shown while fallback is pending and hidden when fallback completes.
- Resolved: verbose logs are opt-in through `-v`/`--verbose` and go to stdout.
