# 0013 Cross-Platform Shortcuts And Fold Modifiers

## Goal

Make keyboard shortcuts and custom fold gestures work correctly on macOS, Windows, and Linux.
Platform-specific modifier handling must be centralized so the app’s core actions are not accidentally macOS-only.

## Problem / Context

Current renderer shortcut handling and custom fold toggling depend on `metaKey`.
That means key behavior degrades or breaks on non-macOS platforms even though the app ships non-mac packaging assets and window icons.

## Deliverables

### Modifier abstraction

- Introduce one shared renderer helper for “primary modifier” behavior:
  - `Meta` on macOS,
  - `Ctrl` on Windows/Linux.
- Use that helper for keyboard shortcuts and Monaco fold gesture detection.
- Keep guardrails that reject alt-modified combinations and preserve current command set.

### Keyboard shortcut updates

- Ensure `New`, `Reset Window`, `Input`, `Output`, `Save`, `Copy`, and `Find` all work with the platform-appropriate primary modifier.
- Keep menu accelerators aligned with actual renderer behavior.
- Avoid duplicate-trigger behavior when Electron menu accelerators and renderer listeners overlap.

### Fold gesture updates

- Replace hardcoded Cmd+click detection with platform-appropriate primary-modifier click behavior.
- Keep plain click behavior untouched.

### Testing requirements

- Add/extend unit tests for:
  - macOS modifier behavior,
  - Windows/Linux modifier behavior,
  - fold toggle only with the expected modifier,
  - no regression for unmodified click/keyboard behavior.
- Add or update E2E coverage where practical for at least one non-mac-compatible path via synthetic events.

### Documentation updates

- Update `docs/ui-spec.md` keyboard shortcut text to say `Cmd` on macOS / `Ctrl` on Windows/Linux`.
- Update `docs/architecture.md` renderer controller section if a shared modifier helper is introduced.
- Update `docs/learnings.md` with the platform-modifier rule.

## Acceptance Criteria

- [ ] All documented shortcuts work with `Cmd` on macOS and `Ctrl` on Windows/Linux.
- [ ] Custom fold toggle uses the platform-appropriate primary modifier.
- [ ] Plain click behavior remains unchanged.
- [ ] Shortcut/menu behavior stays aligned and does not double-trigger actions.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- Modify: `src/renderer/app/useKeyboardShortcuts.ts`
- Modify: `src/renderer/output/indentBlockFolding.ts`
- New: shared renderer modifier helper if needed
- Modify: `tests/unit/renderer/app/useKeyboardShortcuts.test.ts`
- Modify: `tests/unit/renderer/output/indentBlockFolding.test.ts`
- Modify: `tests/e2e/window-lifecycle.spec.ts` and/or `tests/e2e/app-smoke.spec.ts` if coverage is added
- Modify: `docs/ui-spec.md`
- Modify: `docs/architecture.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0013-cross-platform-shortcuts-and-fold-modifiers.md`

## Resolved Decisions

- Cross-platform primary-modifier behavior belongs in one helper, not repeated ad hoc checks.
- This spec keeps the current shortcut set; it only fixes platform correctness.
