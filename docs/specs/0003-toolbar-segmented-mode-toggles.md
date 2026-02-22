# 0003 Toolbar Segmented Mode Toggles

## Goal

Replace the current single-action `Input/Output` and `Light/Dark` buttons with two-option segmented toggles that always show the active mode.
The control must make current state obvious at a glance and allow direct switching to the other mode.

## Problem / Context

Current toolbar buttons only show the next action label (`Output` or `Input`, `Dark` or `Light`).
Users cannot see the active mode without inferring it from surrounding UI.

## Deliverables

- Replace the pane mode button with an `inputOutputToggle` segmented control containing `Input` and `Output` options.
- Replace the theme button with a segmented control containing `Light` and `Dark` options.
- Update toolbar props so segmented controls set explicit target mode instead of toggling implicitly.
- Pane control callback: `onPaneModeChange(nextMode: PaneMode)`.
- Theme control callback: `onThemeModeChange(nextMode: ThemeMode)`.
- Keep pane toggle state synchronized to rendered content: input pane visible means `Input` is active; output pane visible means `Output` is active.
- Keep theme toggle state synchronized to applied theme: `data-theme="light"` means `Light` is active; `data-theme="dark"` means `Dark` is active.
- Preserve existing toolbar behavior: `Save` and `Copy` visible only in output mode, and `Collapse` and `Expand` enabled only in output mode.
- Keep `inputOutputToggle` visible at all times.
- Empty-input behavior in input mode: `Input` remains active and `Output` is disabled until content exists.
- Empty-ingestion behavior in output mode: if ingestion sets empty text and pane mode is output, `Output` remains active and enabled.
- Apply segmented control styling to match the visual reference: shared pill container, active segment has a filled/highlighted background, inactive segment appears unfilled.
- Add or adjust tests for segmented behavior.
- Test expectation: active segment updates from store-driven pane and theme state.
- Test expectation: clicking inactive segment switches to that mode.
- Test expectation: clicking active segment is a no-op.
- Test expectation: `Output` segment is disabled when there is no content and pane mode is input.
- Test expectation: `Output` segment remains enabled if pane mode is output, even when content is empty.
- Test expectation: controls remain in sync after non-toolbar state changes, including `openFile` forcing output mode and `reset` forcing input mode.

Reference note for implementation agents: any code snippets in specs are intent examples only, not copy-paste source of truth.

## Acceptance Criteria

- [ ] Toolbar shows an `inputOutputToggle` with both `Input` and `Output` labels visible.
- [ ] Exactly one pane segment is visually active and semantically marked active at all times.
- [ ] Input pane visible -> `Input` segment active.
- [ ] Output pane visible -> `Output` segment active.
- [ ] With empty input and pane mode set to input, `Output` segment is disabled and cannot be activated.
- [ ] With empty input and pane mode set to output (ingestion edge case), `Output` segment stays active and enabled.
- [ ] With non-empty input, clicking inactive pane segment switches to that pane.
- [ ] Toolbar shows a theme segmented control with both `Light` and `Dark` labels visible.
- [ ] Exactly one theme segment is visually active and semantically marked active at all times.
- [ ] Clicking inactive theme segment applies that theme and updates active state.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `docs/specs/0003-toolbar-segmented-mode-toggles.md`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `tests/unit/renderer/components/Toolbar.test.tsx`
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`

## Open Questions / Resolved Decisions

- Resolved: segmented controls must show both options simultaneously; active state must be explicit.
- Resolved: clicking an already-active segment does not change state.
- Resolved: if no content exists and pane mode is input, keep `Input` enabled and `Output` disabled.
- Resolved: ingestion (drop, paste, click-open) uses one input-set path that switches pane mode to output.
