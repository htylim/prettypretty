# 0008 Session Log Window via macOS App Menu

## Goal

Capture main-process logs for the entire app session regardless of `-v` and expose them in a dedicated log window opened from the macOS `prettypretty` app menu (`View Log`, `Cmd+L`).
Keep existing `-v` / `--verbose` behavior for stdout logging.

## Problem / Context

Current logging is fully gated by verbose runtime flags, so launches without `-v` have no retained diagnostic history.
This blocks post-start troubleshooting unless the app is relaunched with verbose enabled.

## Deliverables

### Logging pipeline changes

- Add a main-process in-memory session log store with bounded retention (`2000` lines).
- Refactor logger so each log call always creates one sanitized JSON line.
- Always append generated lines into the session store.
- Keep stdout writes gated by verbose mode only.

### Log window behavior

- Add a singleton log window controller in main.
- Opening behavior:
  - if already open, focus existing window;
  - else create a new window and load renderer with `?window=log`.
- Stream new session lines to this window via IPC event channel while open.
- Cleanup stream subscription when window closes.

### Menu integration

- Extend app menu configuration with optional callbacks.
- On macOS app menu (`prettypretty`) add:
  - `View Log` item
  - accelerator `Cmd+L`
  - click handler wired to open/focus log window
- Keep non-mac menu templates unchanged.

### IPC + preload + renderer integration

- Add IPC channels:
  - `logs:get-history`
  - `logs:line-appended` (event)
- Expose preload logs API:
  - `window.prettypretty.logs.getHistory()`
  - `window.prettypretty.logs.onLine(listener)`
- Renderer root selects log view when query param is `window=log`.
- Log view:
  - fetches history on mount,
  - subscribes to live lines,
  - renders raw JSONL in a scrollable `<pre>`,
  - auto-scrolls to bottom on updates.

### Testing requirements

- Add store unit tests:
  - append/snapshot behavior
  - retention cap enforcement
  - subscribe/unsubscribe behavior
- Update logger tests for always-on line generation plus verbose-gated stdout.
- Update IPC tests for log-history channel.
- Add menu test to validate `View Log` item and callback.
- Add renderer test for log window history + live updates + unsubscribe.

### Documentation updates

- Update `docs/architecture.md` logging section for session capture + verbose stdout behavior.
- Update `docs/ui-spec.md` with macOS menu `View Log` and log window behavior.
- Update `docs/learnings.md` with capture-vs-transport separation rule.

## Acceptance Criteria

- [ ] Session log lines are captured from app startup even when not launched with `-v`.
- [ ] `-v` / `--verbose` still controls stdout emission exactly as before.
- [ ] macOS app menu includes `View Log` with `Cmd+L`.
- [ ] `View Log` opens or focuses a singleton log window.
- [ ] Log window shows startup history immediately and live-appends new lines.
- [ ] Session log retention is bounded to `2000` lines in-memory only.
- [ ] Logs remain redacted for sensitive keys as defined by current logger policy.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `src/main/logging/sessionLogStore.ts`
- Modify: `src/main/logging/logger.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/menu/applicationMenu.ts`
- New: `src/main/windows/logWindow.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/shared/window-api.ts`
- Modify: `src/preload/index.ts`
- New: `src/renderer/LogWindowApp.tsx`
- Modify: `src/renderer/main.tsx`
- New: `tests/unit/main/logging/sessionLogStore.test.ts`
- Modify: `tests/unit/main/logging/logger.test.ts`
- New: `tests/unit/main/menu/applicationMenu.test.ts`
- Modify: `tests/unit/main/ipc/preferencesIpc.test.ts`
- Modify: `tests/unit/main/ipc/prettifierIpc.test.ts`
- New: `tests/unit/renderer/LogWindowApp.test.tsx`
- Modify: `docs/architecture.md`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0008-session-log-window-macos-menu.md`

## Resolved Decisions

- Retention is session memory only (no disk persistence).
- Buffer cap is `2000` lines.
- Log window rendering is raw JSONL text.
- Menu integration is macOS app-menu only for this iteration.
