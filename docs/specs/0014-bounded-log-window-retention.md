# 0014 Bounded Log Window Retention

## Goal

Keep the renderer log window memory-bounded during long sessions.
The log window must mirror the main session-log retention policy instead of growing without limit after initialization.

## Problem / Context

Main-process log storage is capped, but the log window renderer keeps appending lines forever once subscribed.
That creates unbounded renderer memory growth during long-running verbose sessions.

## Deliverables

### Retention alignment

- Define one explicit retention policy for log-window rendering.
- Match the renderer cap to the main session log cap unless there is a documented reason to differ.
- Ensure history merge plus live append keeps the newest lines and discards older ones deterministically.

### Renderer implementation changes

- Update `LogWindowApp` state updates so line buffers are trimmed on every append and after initial history merge.
- Keep current auto-scroll behavior.
- Preserve overlap-deduplication behavior between initial history and buffered live lines.

### Testing requirements

- Add/extend renderer tests for:
  - bounded retention after repeated live appends,
  - bounded retention after history+buffer merge,
  - newest lines retained in correct order,
  - unsubscribe behavior unchanged.

### Documentation updates

- Update `docs/architecture.md` logging section to say both main log capture and log-window rendering are bounded.
- Update `docs/ui-spec.md` log window behavior if retention details are surfaced there.
- Update `docs/learnings.md` with the append-only renderer log growth rule.

## Acceptance Criteria

- [ ] Log window renderer state remains bounded during long sessions.
- [ ] Newest log lines are retained in order when the cap is exceeded.
- [ ] Initial history merge and live append behavior remain correct.
- [ ] Auto-scroll behavior remains intact.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- Modify: `src/renderer/LogWindowApp.tsx`
- Modify: `tests/unit/renderer/LogWindowApp.test.tsx`
- Modify: `docs/architecture.md`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0014-bounded-log-window-retention.md`

## Resolved Decisions

- Bounded renderer retention should match the bounded main-session log policy by default.
- This spec is about memory bounds only; it does not add search/filter/export features.
