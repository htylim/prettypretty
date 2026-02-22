# 0002 EditorShell Empty-State Single-Line CTA

## Goal

Fix the `EditorShell` empty state in input mode so it renders a single centered line only: `Paste, Drop or Click`.  
The `Click` text must be the only interactive part of the line and must invoke `openFile`.

## Problem / Context

The current UI renders three lines in empty state:

- heading text,
- helper paragraph,
- separate `Click` action.

This duplicates guidance and does not match the intended compact CTA.

## Deliverables

- Update empty-state markup in `EditorShell` to render one centered line instead of three lines.
- Use exact copy: `Paste, Drop or Click`.
- Make only `Click` interactive and wire it to existing `onOpenFile` handler.
- Style `Click` as an underlined inline link-like control so affordance is visually obvious.
- Keep paste/drop behavior unchanged.
- Preserve keyboard accessibility for the interactive `Click` control.
- Update unit tests:
- verify helper paragraph is not rendered in empty state.
- verify only a single-line CTA is rendered.
- verify `Click` triggers `onOpenFile`.
- Update renderer app test expectations for the new copy.
- Keep implementation focused on this bug; no toolbar or pane-mode behavior changes.

Reference note for implementation agents: any code snippets in specs are intent examples only, not copy-paste source of truth.

## Acceptance Criteria

- [ ] In input mode with empty input, only one centered line is visible: `Paste, Drop or Click`.
- [ ] No additional helper text is displayed below or above this line.
- [ ] `Click` is interactive and calls `onOpenFile` exactly once per user activation.
- [ ] `Click` is visually underlined in the empty-state line.
- [ ] Paste and drop still populate input as before.
- [ ] Existing input/output pane switching behavior remains unchanged.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `docs/specs/0002-editor-shell-empty-state-single-line-cta.md`
- Modify: `src/renderer/components/EditorShell.tsx`
- Modify: `tests/unit/renderer/components/EditorShell.test.tsx`
- Modify: `tests/unit/renderer/App.test.tsx`

## Open Questions / Resolved Decisions

- Resolved: use exact user-facing copy `Paste, Drop or Click` (single line).
- Resolved: `Click` should be inline and visually link-like, while remaining keyboard accessible.
