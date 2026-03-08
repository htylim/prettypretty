# 0012 Startup Preferences Hydration Race Guard

## Goal

Prevent stale startup preference hydration from overwriting newer user actions.
Theme, indentation, and fallback selection must remain stable even if the initial async preferences load resolves after the user has already interacted with the UI.

## Problem / Context

`usePreferencesFlow` hydrates preferences after mount and then writes them directly into renderer state.
That creates a race where a slow startup read can revert a user action made moments earlier.

## Deliverables

### Hydration sequencing

- Add explicit stale-response protection for initial `preferences.getAll()` hydration.
- Ensure hydration cannot overwrite a user mutation that happened after the request started.
- Choose one explicit strategy and document it in code/tests:
  - request token/versioning, or
  - hydration-complete gate before user actions, or
  - preload-seeded initial preferences with post-mount reconciliation.

### Renderer state behavior

- Protect at least:
  - `themeMode`,
  - `indentSize`,
  - `fallbackAgentId`,
  - derived fallback agent options / warning threshold as applicable.
- Keep optimistic persistence sequencing behavior for later writes.
- Avoid introducing startup theme flicker regressions.

### Testing requirements

- Add/extend unit tests that simulate:
  - slow initial hydration followed by fast user theme change,
  - slow initial hydration followed by fast indent change,
  - slow initial hydration followed by fast fallback-agent change,
  - unmount during hydration.
- Remove current test warnings caused by stale async state updates if they are tied to this flow.

### Documentation updates

- Update `docs/architecture.md` preferences flow section with the chosen stale-hydration protection model.
- Update `docs/learnings.md` with the startup-hydration race rule.

## Acceptance Criteria

- [ ] Initial `preferences.getAll()` cannot overwrite a newer user selection made after mount.
- [ ] Theme, indent size, and fallback agent selection stay consistent under delayed hydration.
- [ ] Existing optimistic write/rollback behavior keeps working.
- [ ] No new startup flicker or preference-reset regressions are introduced.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- Modify: `src/renderer/app/usePreferencesFlow.ts`
- Modify: `src/renderer/app/useAppController.ts` if startup sequencing changes
- Modify: `src/renderer/main.tsx` if initial preference seeding strategy changes
- Modify: `tests/unit/renderer/app/usePreferencesFlow.test.ts`
- Modify: `tests/unit/renderer/app/useAppController.test.ts` if needed
- Modify: `docs/architecture.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0012-startup-preferences-hydration-race-guard.md`

## Resolved Decisions

- Stale startup hydration is a correctness bug, not just a UX issue.
- This spec is about sequencing correctness; it does not add new preference fields.
