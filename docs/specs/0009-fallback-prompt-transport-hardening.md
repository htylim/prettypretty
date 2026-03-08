# 0009 Fallback Prompt Transport Hardening

## Goal

Eliminate process-argument leakage of user content during fallback agent execution.
Fallback prompt delivery must keep raw input out of child argv while preserving current fallback behavior and testability.

## Problem / Context

Current fallback execution supports `promptDelivery: 'arg'`, which places raw prompt text in process arguments.
On desktop platforms, argv is observable by local tools such as `ps`, Activity Monitor, and task managers, which is an avoidable data-exposure footgun.

## Deliverables

### Prompt transport policy

- Remove raw-content prompt transport through child process arguments for fallback runs.
- Treat `stdin` as the only allowed transport for any prompt that includes user content.
- If a transport discriminator remains in the preferences model for backward compatibility, `'arg'` must be migrated or normalized to `'stdin'` before execution.
- Reject or migrate invalid legacy agent configs instead of silently executing argv-based prompt delivery.

### Main-process execution changes

- Update `src/main/prettifier/agentFallbackExecutor.ts` so fallback execution never appends raw prompt text to spawned args.
- Keep `shell: false`.
- Preserve current timeout, output-size caps, cancellation, progress streaming, and process-tree cleanup semantics.
- Keep deterministic behavior for existing default agents (`amp`, `codex`) using stdin.

### Preferences and migration changes

- Update preferences validation/migration so legacy `promptDelivery: 'arg'` configs are converted to `stdin`.
- Document that fallback agents must accept prompt content on stdin.
- Keep persisted preferences loadable without corrupt-file fallback when only this field needs migration.

### Testing requirements

- Add/extend unit tests covering:
  - executor writes prompt content to stdin for fallback runs,
  - executor never appends raw prompt text to argv,
  - legacy `'arg'` preferences migrate to `'stdin'`,
  - default agents still execute correctly after migration.
- Add or update IPC/prettifier integration tests to ensure malformed-input fallback still succeeds after transport hardening.

### Documentation updates

- Update `docs/architecture.md` security and prettifier sections to state that fallback prompts are delivered via stdin only.
- Update `docs/dependencies-and-tools.md` or relevant docs to note the stdin requirement for supported fallback CLIs.
- Update `docs/learnings.md` with the prompt-transport secrecy rule.

## Acceptance Criteria

- [ ] No fallback execution path passes raw prompt or input text through child argv.
- [ ] Legacy preferences that specify `promptDelivery: 'arg'` are migrated to a safe supported value without corrupting the file.
- [ ] Existing stdin-based fallback agents keep working without behavior regressions.
- [ ] Timeout, cancellation, progress streaming, and output-size caps keep current behavior.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- Modify: `src/main/prettifier/agentFallbackExecutor.ts`
- Modify: `src/main/preferences/preferencesTypes.ts`
- Modify: `src/shared/preferences.ts`
- Modify: `src/main/preferences/preferencesDefaults.ts` if needed for stricter transport policy wording only
- Modify: `tests/unit/main/prettifier/agentFallbackExecutor.test.ts`
- Modify: `tests/unit/main/preferences/preferencesService.test.ts`
- Modify: `tests/unit/main/preferences/preferencesStore.test.ts`
- Modify: `tests/unit/main/prettifier/prettifierService.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/dependencies-and-tools.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0009-fallback-prompt-transport-hardening.md`

## Resolved Decisions

- Raw prompt transport via argv is not acceptable in this app.
- Backward compatibility should use migration, not corrupt-file replacement.
- This spec is about transport hardening only; it does not redesign the agent config UI.
