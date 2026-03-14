# 0015 Code-Anchored Inline Fold Controls

## 1. Current State

- Output folding currently uses Monaco folding with native gutter affordances configured in [`src/renderer/output/outputEditorConfig.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts).
- Output editor interaction wiring lives in [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx), which currently mounts only the primary-modifier fold handler.
- Input and output editors both currently depend on [`src/renderer/output/indentBlockFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/indentBlockFolding.ts) for custom modifier-click fold targeting.
- That helper infers parent blocks from indentation. It is useful for indent-driven content, but it is not the authoritative definition of foldability for all Monaco output languages the app can render (for example Markdown headings or other language-provider-driven fold ranges).
- [`docs/specs/0004-output-editor-readonly-ide-parity.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0004-output-editor-readonly-ide-parity.md) and current product docs still describe gutter fold controls in output mode. This spec supersedes only the output fold-affordance presentation, not Monaco folding itself.

## 2. Desired End State

- Output mode shows fold controls on the code line itself, anchored at the end of each fold-start line that Monaco considers foldable for the active output model/language.
- The control is visually separate from the code:
  - it is not inserted as readable code text,
  - it does not cover any token,
  - it uses a muted control treatment distinct from syntax colors.
- The control scrolls with the code horizontally and vertically.
- Only Monaco fold-start lines render controls. If Monaco exposes no fold regions for the current output, no inline controls render.
- The control state is obvious:
  - expanded block shows a collapse affordance,
  - collapsed block shows an expand affordance.
- Output editor no longer shows Monaco’s native gutter fold controls. Line numbers stay visible.
- Input editor keeps the existing gutter-based fold affordance.
- Inline controls, primary-modifier click folding, toolbar `Expand` / `Collapse`, and restored output view state all reflect the same fold regions/state.

Reference intent example only:

```text
"people": [   [-]
"contact": {  [+]
```

The exact glyph can change, but the code-anchored position and non-code visual treatment are fixed by this spec.

## 3. Patterns To Follow

- Keep [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) thin. Add focused modules for folding-model access and output-only inline-control lifecycle instead of embedding Monaco widget management directly in the component.
- Introduce one authoritative Monaco-backed fold-source module for both editors. That module must answer:
  - which visible lines are Monaco fold starts,
  - which fold-start line owns an arbitrary clicked line,
  - whether a fold-start line is currently collapsed,
  - how to toggle a specific fold-start line.
- Reuse that same fold-source module in output inline controls and in the existing primary-modifier click gesture. Do not let each interaction path invent its own foldability rules.
- Do not make [`src/renderer/output/indentBlockFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/indentBlockFolding.ts) the source of truth for inline controls. If that file’s responsibility expands beyond indentation heuristics, rename or replace it with a Monaco-backed module name that matches reality.
- Use Monaco content widgets anchored to end-of-line positions. Do not use viewport-anchored overlay widgets as the primary rendering path because this feature must move with the code, not stay pinned to the viewport.
- Do not use injected text as the primary affordance. The control must read as UI, not as content.
- Follow the existing disposable-registration pattern already used by `InputEditor` and `OutputEditor` for Monaco interaction hooks.
- Keep output view-state persistence keyed by `documentId`; inline controls must reflect restored fold state instead of introducing separate persisted state.
- Do not special-case JSON braces, brackets, or other syntax tokens to decide foldability. Monaco’s active folding model is the single place of truth for what is foldable.

## 4. Deliverables

### Architecture decisions

- Add a shared Monaco folding module such as [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts) to own:
  - fold-start discovery from Monaco’s active fold regions,
  - fold-owner resolution for an arbitrary line,
  - collapsed/expanded state lookup,
  - toggle-by-fold-start-line behavior.
- Keep any non-public Monaco contribution access isolated inside that module. If Monaco public APIs are insufficient, contribution-based access must not leak into React components or output-widget code and must be covered with comments and tests.
- Add a dedicated output-only module such as [`src/renderer/output/inlineFoldControls.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/inlineFoldControls.ts) to own:
  - visible fold-start filtering,
  - Monaco content widget creation/update/removal,
  - control DOM/event wiring,
  - subscriptions for scroll, layout, model, and fold-state refreshes.
- Refactor the existing primary-modifier fold registration to depend on the shared Monaco folding module so input and output panes keep one fold-targeting path.
- [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) should mount both the shared fold interaction registration and the output-only inline-control registration.
- [`src/renderer/components/InputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/InputEditor.tsx) should keep its current UI but use the same shared fold-targeting module for primary-modifier click.
- Render widgets only for currently visible Monaco fold-start lines plus a small overscan window. Do not create one widget per foldable line across the entire document.

### Design decisions

- Scope is output editor only for the inline-control rendering layer.
- Shared Monaco options still belong in one base seam, but this feature intentionally adds an output-only fold-affordance override.
- Update output editor options in [`src/renderer/output/outputEditorConfig.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts):
  - set `showFoldingControls` to `'never'`,
  - disable `glyphMargin` for output mode unless implementation proves Monaco layout requires it,
  - keep line numbers enabled.
- Keep input editor options on the current gutter-fold path.
- Control placement:
  - anchor at `model.getLineMaxColumn(lineNumber)`,
  - add a fixed visual gap after the rendered line text,
  - vertically center within the existing `23px` line height,
  - move with horizontal scroll.
- Control styling:
  - use a `16px` to `18px` square or soft-rect control,
  - use border/background colors from UI tokens, not syntax-token colors,
  - use `+` for collapsed and `-` for expanded, or an equivalent equally explicit icon pair,
  - increase contrast on hover/focus without making the control look like code text.
- Control accessibility:
  - render a button or button-equivalent element with an accessible name,
  - expose collapsed/expanded state through semantics such as `aria-expanded`,
  - show a visible `:focus-visible` treatment using existing focus-ring tokens,
  - prevent the control’s own pointer handling from selecting text or moving the editor cursor unexpectedly.
- Keep Monaco’s folded placeholder text behavior unchanged. This spec changes the fold affordance only.

### Interaction decisions

- Clicking the inline control toggles the Monaco fold block owned by that fold-start line only.
- Plain click anywhere else in the line keeps Monaco default behavior.
- Existing primary-modifier click folding remains supported in both panes and must reuse the same fold-owner resolution + toggle path as inline controls.
- Primary-modifier click on a non-fold-start line should resolve the owning fold-start line from the shared Monaco folding module. If no owning fold region exists, it is a no-op.
- Toolbar `Expand` / `Collapse` continue using Monaco fold actions and inline controls must refresh after those actions run.
- Control state must refresh after:
  - inline control click,
  - primary-modifier fold toggle,
  - toolbar collapse/expand,
  - document switch + view-state restore,
  - output value change,
  - model/language change,
  - editor scroll/layout changes,
  - Monaco hidden-area changes.
- Long-line rule: the control is code-anchored. If the end of the line scrolls out of view, the control may scroll out with it. No viewport docking fallback is part of this spec.
- If Monaco reports zero fold regions for the current output, render zero inline controls and keep the rest of output-editor behavior unchanged.
- Cross-platform modifier behavior must stay aligned with [`docs/specs/0013-cross-platform-shortcuts-and-fold-modifiers.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0013-cross-platform-shortcuts-and-fold-modifiers.md). Do not hardcode macOS-only Cmd handling in new inline-control or fold-target code.

### Tests decisions

- Add unit coverage for the shared Monaco folding module, for example in [`tests/unit/renderer/editor/monacoFolding.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/editor/monacoFolding.test.ts):
  - fold-start discovery from Monaco fold regions,
  - owning fold-start resolution for nested lines,
  - collapsed-state lookup from Monaco hidden areas,
  - lines outside fold regions producing no owner.
- If [`src/renderer/output/indentBlockFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/indentBlockFolding.ts) remains, reduce it to a thin wrapper or remove outdated indentation-only assertions. Do not keep tests that lock the wrong source of truth.
- Add dedicated unit coverage for the inline-control module:
  - visible fold-start lines create widgets,
  - invisible lines do not,
  - widget click toggles fold through the shared path,
  - listeners and widgets dispose cleanly,
  - hidden-area refresh updates control state.
- Update [`tests/unit/renderer/output/outputEditorConfig.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/outputEditorConfig.test.ts) to assert output-mode gutter fold controls are disabled while input mode keeps the current gutter fold controls.
- Update [`tests/unit/renderer/components/OutputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputEditor.test.tsx) to assert inline-control registration/disposal and preserve existing toolbar/view-state behavior.
- Update [`tests/unit/renderer/components/InputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/InputEditor.test.tsx) so the shared fold-targeting path remains covered even though input keeps gutter controls.
- Add or extend Electron E2E coverage with:
  - a structured JSON case asserting inline fold controls are visible on Monaco fold-start lines,
  - a non-indentation folding case (for example Markdown headings or another Monaco language-provider-driven fold sample) asserting inline controls stay aligned with Monaco fold behavior,
  - gutter fold controls are not visible in output mode,
  - line numbers remain visible,
  - clicking an inline control collapses and re-expands the expected block.

### Documentation decisions

- On implementation, update [`docs/ui-spec.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md) to replace the current output gutter-fold statement with output-inline fold controls while keeping input on the gutter path.
- On implementation, update [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md) with the shared Monaco folding module plus the output-only inline-fold-controls module.
- On implementation, update [`docs/design-style.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/design-style.md) with spacing, sizing, token, and focus-ring rules for the inline controls.
- Keep [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md) aligned with the single-source-of-truth folding rule introduced by this work.

### Code quality decisions

- Do not make the control part of copied or saved output text.
- Do not duplicate fold-owner resolution or fold-toggle semantics between primary-modifier click, inline-control click, and any future fold UI.
- Do not derive foldability from indentation heuristics, brace scanning, or syntax-specific ad hoc parsing when Monaco already exposes fold regions for the active model.
- Do not bury Monaco widget DOM creation inside React render paths.
- Do not leave obsolete indentation-only fold logic active if responsibility moves to a Monaco-backed shared module.

Reference note for implementation agents: any code in this spec is intent-only, not copy-paste implementation source.

## 5. Acceptance Criteria

- [ ] Output mode shows fold controls at the end of each visible Monaco fold-start line.
- [ ] Inline fold controls never cover, replace, or visually read as code text.
- [ ] Output editor no longer shows native gutter fold controls.
- [ ] Input editor keeps the current gutter-fold affordance.
- [ ] Line numbers remain visible in output mode.
- [ ] Clicking an inline control collapses and expands the correct block.
- [ ] Toolbar `Expand` / `Collapse` remain functional and keep inline control state synchronized.
- [ ] Existing primary-modifier click fold toggle remains functional in both panes and uses the same fold-target resolution as inline controls.
- [ ] Non-foldable output content shows no inline fold controls.
- [ ] At least one non-indentation folding sample remains aligned with Monaco fold behavior.
- [ ] Input editor behavior is otherwise unchanged.
- [ ] Long-line behavior stays code-anchored: controls follow horizontal scroll and may leave the viewport with the line end.
- [ ] Both light and dark themes render the controls with a clear non-code visual treatment and visible focus styling.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## 6. File Summary

- Modify: [`docs/specs/0015-code-anchored-inline-fold-controls.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0015-code-anchored-inline-fold-controls.md)
- New: [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts)
- New: [`src/renderer/output/inlineFoldControls.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/inlineFoldControls.ts)
- Modify: [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- Modify: [`src/renderer/components/InputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/InputEditor.tsx)
- Modify: [`src/renderer/output/outputEditorConfig.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts)
- Modify/remove: [`src/renderer/output/indentBlockFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/indentBlockFolding.ts)
- Modify: [`src/renderer/styles/tailwind.css`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/styles/tailwind.css)
- New: [`tests/unit/renderer/editor/monacoFolding.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/editor/monacoFolding.test.ts)
- New: [`tests/unit/renderer/output/inlineFoldControls.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/inlineFoldControls.test.ts)
- Modify: [`tests/unit/renderer/output/outputEditorConfig.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/outputEditorConfig.test.ts)
- Modify: [`tests/unit/renderer/components/OutputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputEditor.test.tsx)
- Modify: [`tests/unit/renderer/components/InputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/InputEditor.test.tsx)
- Modify: [`tests/e2e/app-smoke.spec.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/e2e/app-smoke.spec.ts) or a dedicated output-fold-controls E2E spec
- On implementation modify: [`docs/ui-spec.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md)
- On implementation modify: [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
- On implementation modify: [`docs/design-style.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/design-style.md)
- Modify: [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)

## 7. Open Questions / Resolved Decisions

- Resolved: implement the code-anchored inline-controls option, not the viewport-anchored floating option.
- Resolved: foldability source of truth is Monaco’s active fold model/hidden areas, not indentation heuristics.
- Resolved: output editor hides native gutter fold controls to avoid dual affordances, while input keeps the existing gutter path.
- Resolved: Monaco content widgets are the primary rendering primitive for the inline controls.
- Resolved: fold-target resolution stays shared across inline controls and primary-modifier click.
- Resolved: input editor is out of scope for UI changes but not for shared fold-target logic.
- Resolved: cross-platform primary-modifier behavior from spec `0013` still applies.
- Open question: none.
