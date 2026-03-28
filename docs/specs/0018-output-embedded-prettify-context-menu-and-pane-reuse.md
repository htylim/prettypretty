# Output Embedded Prettify Context Menu And Pane Reuse Implementation Plan

## Overview

Replace the current output structural-split product behavior with embedded-content exploration focused on `Prettify in Pane` and `Prettify & Replace`.

This plan preserves the existing output pane-strip platform, but repurposes it so panes can render independent prettified content instead of only filtered ranges from the same root document. As product behavior, this plan supersedes the recursive structural split interaction described in [0017](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md) while intentionally retaining the reusable pane-strip architecture.

## Implementation Status

- Phase 1: Completed
- Phase 2: Completed
- Phase 3: Completed
- Phase 4: Completed
- Product correction required before Phase 3:
  - embedded prettify must be selection-first, not click-target inference,
  - output context-menu prettify actions must stay enabled even when local parsing/prettify cannot improve the selection,
  - execution must still open the pane or replace the document with the selected payload even when prettify falls back to passthrough text.

## Post-Implementation Correction

The implemented phase-1/phase-2 behavior exposed a product misunderstanding.

The intended workflow is:

- The user explicitly selects text in the output editor.
- The user right-clicks that selection.
- `Prettify in Pane` and `Prettify & Replace` operate on the exact selected text, not on an embedded candidate inferred from the right-click location.
- If there is no current non-empty selection, both menu actions are visible but disabled.
- The selected text may be wrapped by host syntax. The extraction flow must:
  - unwrap enclosing quotes or equivalent host delimiters when the selection includes them,
  - decode escapes when needed,
  - pass the normalized payload through the normal prettifier flow.
- The actions must not disable only because local detection says `unsupported` or `malformed`.
- If prettification cannot improve the payload, the app must still surface the normalized/pass-through result:
  - in a pane for `Prettify in Pane`,
  - through the replace flow for `Prettify & Replace`.

The GraphQL-in-JSON example is the canonical product case for this correction.

## Current State Analysis

- Output-mode right-click actions for Monaco do not exist because the shared editor options disable Monaco context menus in [src/renderer/output/outputEditorConfig.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts#L10).
- Output-mode `Ctrl+click` currently resolves a structural fold range and opens or replaces a derived pane in [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx#L43).
- The output pane domain hardcodes a `sourceRange`-only child model in [src/renderer/app/outputPaneDomain.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts#L5).
- The pane controller rebuilds every pane from the same `outputText` and `documentId` in [src/renderer/app/useOutputPaneController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts#L122).
- Output prettification is whole-document only. The renderer prettifier flow owns complete-document input/output transitions in [src/renderer/app/usePrettifierFlow.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts#L53).
- The current pane-strip layout, snapped viewport motion, active-pane routing, and rightmost-pop behavior are already good and should stay intact in [src/renderer/components/OutputPaneStrip.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx#L59).

### Key Discoveries

- The reusable asset is the pane-strip/view-model/editor-shell architecture, not the current range-derived product behavior.
- The current domain model is the main blocker because it assumes every child pane is a filtered view into one shared root source document.
- Output-mode highlighting already exists and can be repurposed instead of thrown away.
- The repo now requires plans to be phase-based, independently verifiable, and paused after each phase for manual confirmation.

## Desired End State

In output mode, the user can select or target embedded structured content inside the visible output and explore it without leaving the current document context.

The final product behavior is:

- Output mode only.
- `Ctrl+click` no longer opens panes.
- `Ctrl+click` detects the embedded structured block at the clicked location and highlights it in the current pane.
- Right-clicking exposes:
  - `Prettify & Replace`
  - `Prettify in Pane`
- Action state is selection-driven:
  - when there is a non-empty selection, `Prettify in Pane` is enabled,
  - when there is no selection, both actions are disabled,
  - before phase 4, `Prettify & Replace` may remain disabled even when a selection exists.
- Detection is format-agnostic at the product level:
  - it is not limited to JSON roots,
  - it is not limited to GraphQL,
  - it works anywhere the current document contains an embedded quoted substring or equivalent extractable structured payload that the app can parse/prettify.
- If multiple candidate embedded blocks are present:
  - when candidates are nested, prefer the outermost containing candidate,
  - otherwise pick the first detected candidate in source order.
- `Prettify in Pane` is the primary workflow:
  - it extracts the detected embedded content,
  - unescapes/normalizes it as needed,
  - prettifies it through the app’s existing prettifier pipeline,
  - opens it in a right-side pane using the existing pane-strip metaphor.
- `Prettify & Replace` is a root-content rewrite workflow:
  - it replaces the input document with the extracted prettified fragment,
  - output then updates naturally through the existing input->output pipeline,
  - all panes to the right are closed because downstream panes depend on upstream content.
- Pane dependency becomes an explicit product rule:
  - every pane depends on the pane immediately to its left,
  - any modification to a pane’s content invalidates and closes every pane to its right.

The pane-strip UX that must remain:

- root-only pane is full width,
- once split, panes use fixed `50/50` width,
- panes stack horizontally to the right,
- viewport movement stays snapped and animated,
- rightmost-pop behavior stays stack-based,
- active-pane focus and toolbar routing stay deterministic.

## What We're NOT Doing

- No input-mode context menu or embedded-content actions in this scope.
- No attempt to support arbitrary language ASTs beyond extractable embedded content patterns the app can deterministically detect.
- No pane headers, breadcrumbs, pane titles, or extra chrome.
- No preservation of the old product behavior where `Ctrl+click` opens a structural split pane.
- No commitment that every possible embedded string in every language is supported in phase one.
- No layer-by-layer implementation plan. Every phase must be a vertical slice with usable UI behavior and independent verification.

## Implementation Approach

- Preserve the pane-strip infrastructure and generalize the pane content model.
- Treat “pane showing a filtered source range” as one pane content strategy, not as the pane model itself.
- Introduce an embedded-content detection seam that can:
  - map current editor selection or click target into one extracted candidate,
  - provide a stable source span for highlight rendering,
  - provide the extracted raw fragment for prettification.
- Keep output editor integration explicit:
  - `Ctrl+click` becomes highlight-only,
  - context menu actions operate on the current explicit selection, not the click target.
- Keep root-document rewrites on the existing input/output path so `Prettify & Replace` is not a parallel shadow state machine.
- Remove dead code and obsolete structural-split product paths as the new flow lands, but keep generalized pane infrastructure even if some seams are not fully exercised in this scope.

## Phase 1: Embedded Detection And Highlight

Status: Completed.

### Overview

Replace output-mode `Ctrl+click` pane creation with embedded-content detection and highlight-only behavior.

### Changes Required

#### 1. Output embedded-selection domain

**Files**:

- [src/renderer/output/structuralSplitSelection.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts)
- new focused embedded-selection module under `src/renderer/output/`
- new unit tests under `tests/unit/renderer/output/`

**Changes**:

- Stop using fold-range resolution as the user-facing product rule for output `Ctrl+click`.
- Introduce a dedicated embedded-selection resolver that:
  - accepts current output text plus click/selection context,
  - returns the extracted candidate span in the current pane source,
  - returns the extracted content payload for later prettification,
  - prefers the outermost nested candidate,
  - otherwise picks the first detected candidate in source order,
  - returns `null` for unsupported/no-match cases.
- Keep the initial implementation deterministic and text-model based. Do not scrape DOM text.

#### 2. Output highlight plumbing

**Files**:

- [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- [src/renderer/output/splitSelectionDecorations.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/splitSelectionDecorations.ts)
- [src/renderer/styles/tailwind.css](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/styles/tailwind.css)

**Changes**:

- Re-purpose the existing non-native highlight decorations for detected embedded content.
- Replace `Ctrl+click => onSplitSelection` with `Ctrl+click => detect and highlight`.
- Keep the highlight visually subtle and clearly non-native.
- Clear the highlight when no candidate is resolved or when root output changes.

#### 3. Controller/state integration

**Files**:

- [src/renderer/app/useOutputPaneController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
- [src/renderer/app/useAppController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)
- [src/renderer/components/EditorShell.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx)

**Changes**:

- Add controller-owned state for the current embedded candidate per active pane.
- Keep pane creation disabled in this phase.
- Keep reset rules explicit:
  - output invalidation clears highlight state,
  - leaving output mode clears highlight state,
  - resetting the window clears highlight state.

### Success Criteria

#### Automated Verification:

- [ ] Unit tests cover embedded candidate resolution ordering, nested-candidate preference, and no-match behavior.
- [ ] Unit tests cover `Ctrl+click` highlight updates and clear/reset rules.
- [ ] Unit tests cover that `Ctrl+click` no longer opens panes.
- [ ] Targeted renderer tests pass: `pnpm exec vitest run tests/unit/renderer/output tests/unit/renderer/components/OutputEditor.test.tsx tests/unit/renderer/app/useOutputPaneController.test.ts`
- [ ] Full local quality gate passes: `pnpm check`
- [ ] Full test suite passes: `pnpm test`

#### Manual Verification:

- [ ] Launch the Electron app and paste a fixture containing embedded structured content.
- [ ] `Ctrl+click` on an embedded block highlights it without opening a pane.
- [ ] `Ctrl+click` on unsupported text does nothing destructive and clears/keeps state predictably.
- [ ] Nested candidates resolve to the outermost containing block.
- [ ] Agent-driven Playwright inspection confirms the DOM/editor state matches the intended highlight behavior.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Context Menu And Prettify In Pane

Status: Completed.

### Overview

Deliver the primary user value: right-clicking a detected embedded block and opening its prettified content in a pane.

### Changes Required

#### 1. Output context menu command seam

**Files**:

- [src/renderer/output/outputEditorConfig.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts)
- [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- new context-menu helper under `src/renderer/output/` or `src/renderer/components/`

**Changes**:

- Add an explicit output-mode context menu integration.
- The menu must expose:
  - `Prettify & Replace`
  - `Prettify in Pane`
- In this phase, only `Prettify in Pane` needs to execute. `Prettify & Replace` may be visible but disabled or routed as a stub only if implementation cleanliness demands it.
- The action enablement must be selection-driven:
  - both actions are disabled when there is no non-empty selection,
  - `Prettify in Pane` uses the exact current selection,
  - selection normalization may unwrap/decode host-literal syntax before prettification.

#### 2. Generalized pane content model

**Files**:

- [src/renderer/app/outputPaneDomain.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts)
- [src/renderer/app/useOutputPaneController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
- [src/renderer/components/OutputPaneStrip.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx)
- [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- [src/renderer/output/outputViewRange.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputViewRange.ts)

**Changes**:

- Replace the current `sourceRange`-only derived pane model with pane descriptors that can represent:
  - root pane content,
  - source-range filtered content,
  - independent extracted/prettified content.
- Preserve pane-strip layout, viewport snapping, focus routing, and rightmost-pop behavior.
- Keep pane-local editor view state isolated per pane instance.
- Allow the new pane type to use its own `documentId`/model identity when content is independent from the root source.

#### 3. Embedded prettify-in-pane flow

**Files**:

- [src/renderer/app/useAppController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)
- [src/renderer/app/usePrettifierFlow.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts)
- [src/renderer/prettifier/prettifierService.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/prettifier/prettifierService.ts)
- shared helper(s) under `src/shared/` if extraction/prettification logic should be reused

**Changes**:

- Add a dedicated flow for prettifying extracted embedded content for pane display.
- Reuse the existing prettifier pipeline semantics rather than introducing ad hoc formatting logic.
- Treat the pane content as first-class output content, including syntax detection, line numbers, fold controls, and find support.

### Success Criteria

#### Automated Verification:

- [ ] Unit tests cover context-menu enable/disable and action dispatch for a valid embedded candidate.
- [ ] Unit tests cover generalized pane descriptors and independent pane content rendering.
- [ ] Unit tests cover prettified pane creation from extracted embedded content.
- [ ] Electron integration/e2e tests cover right-click -> `Prettify in Pane` -> pane opens with prettified content.
- [ ] Targeted tests pass: `pnpm exec vitest run tests/unit/renderer/app tests/unit/renderer/components tests/unit/renderer/output`
- [ ] Targeted e2e passes: `pnpm exec playwright test tests/e2e/output-split-pane.spec.ts`
- [ ] Full local quality gate passes: `pnpm check`
- [ ] Full test suite passes: `pnpm test`

#### Manual Verification:

- [ ] Launch the Electron app and use right-click on a detected embedded block in output mode.
- [ ] `Prettify in Pane` opens a right-side pane with prettified extracted content.
- [ ] The pane strip still uses the existing `50/50` layout, snapped navigation, and rightmost pop behavior.
- [ ] The new pane behaves like a first-class output pane for focus, find, folding, and viewport navigation.
- [ ] Agent-driven Playwright inspection confirms the pane content is independent from the root source when appropriate.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Explicit Pane Dependency And Descendant Invalidation

### Overview

Make left-to-right pane dependency a first-class invariant and align the pane controller with the new independent-content model.

### Changes Required

#### 1. Dependency rules in pane domain/controller

**Files**:

- [src/renderer/app/outputPaneDomain.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts)
- [src/renderer/app/useOutputPaneController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)

**Changes**:

- Model descendant invalidation explicitly instead of as a side effect of the old range-based logic.
- Any content mutation in a pane must close every pane to the right.
- Keep rightmost-pop stack semantics unchanged.
- Keep active-pane and viewport normalization deterministic after invalidation.

#### 2. Product cleanup of obsolete structural-split behavior

**Files**:

- [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- [src/renderer/output/structuralSplitSelection.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts)
- [src/renderer/output/outputViewRange.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputViewRange.ts)
- related tests under `tests/unit/renderer/` and `tests/e2e/`

**Changes**:

- Remove dead product logic that exists only for the old `Ctrl+click => open structural split pane` feature.
- Keep generalized, reusable pane infrastructure and any still-valid source-range pane strategy seams.
- Refactor duplicated or awkward controller transitions introduced by the earlier phases.

### Success Criteria

#### Automated Verification:

- [ ] Unit tests cover descendant invalidation when a left pane changes.
- [ ] Unit tests cover active-pane and viewport normalization after descendant closure.
- [ ] No tests remain that assert the obsolete structural-split product behavior.
- [ ] Updated integration/e2e tests cover left-pane mutation closing right descendants.
- [ ] Targeted tests pass: `pnpm exec vitest run tests/unit/renderer/app tests/unit/renderer/components tests/unit/renderer/output`
- [ ] Full local quality gate passes: `pnpm check`
- [ ] Full test suite passes: `pnpm test`

#### Manual Verification:

- [ ] Open a prettified child pane, then modify or replace the content represented by a pane to its left.
- [ ] Every pane to the right closes immediately and predictably.
- [ ] Navigation, focus, and toolbar behavior remain stable after invalidation.
- [ ] Agent-driven Playwright inspection confirms descendants are removed from the mounted pane chain after invalidation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Prettify & Replace

Status: Completed.

### Overview

Implement the secondary workflow that replaces the root document with the extracted/prettified fragment.

### Changes Required

#### 1. Replace-through-input flow

**Files**:

- [src/renderer/app/useAppController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)
- [src/renderer/app/usePrettifierFlow.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts)
- [src/renderer/state/uiStore.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/state/uiStore.ts)

**Changes**:

- Implement `Prettify & Replace` by replacing the input document with the extracted prettified fragment.
- Let the normal input->output flow produce the visible output state.
- Do not add a second “replace only output” state path.
- Reset panes as part of the same root-content mutation rules.

#### 2. Output menu/action completion

**Files**:

- [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- context-menu helper(s)
- relevant tests

**Changes**:

- Fully enable the `Prettify & Replace` menu action.
- Keep enablement/disablement rules aligned with the actual candidate state.
- Keep user-visible action names as:
  - `Prettify & Replace`
  - `Prettify in Pane`

### Success Criteria

#### Automated Verification:

- [ ] Unit tests cover replace-through-input behavior.
- [ ] Unit tests cover root output recomputation and pane reset rules after replace.
- [ ] Electron integration/e2e tests cover right-click -> `Prettify & Replace` -> output updates and panes close.
- [ ] Targeted tests pass: `pnpm exec vitest run tests/unit/renderer/app tests/unit/renderer/components tests/unit/renderer/prettifier`
- [ ] Full local quality gate passes: `pnpm check`
- [ ] Full test suite passes: `pnpm test`

#### Manual Verification:

- [ ] Use `Prettify & Replace` on an embedded candidate in output mode.
- [ ] The input becomes the extracted prettified fragment.
- [ ] Output updates from the normal pipeline rather than a shadow rewrite path.
- [ ] All panes to the right are closed.
- [ ] Agent-driven Playwright inspection confirms the app state after replace matches a normal root-document change.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Hardening, Regression Coverage, And Documentation Sync

### Overview

Finish the feature with broad edge-case coverage, regression cleanup, and documentation updates.

### Changes Required

#### 1. Edge-case and regression coverage

**Files**:

- renderer unit tests
- e2e tests

**Changes**:

- Add coverage for:
  - unsupported embedded content,
  - malformed extracted content,
  - multiple non-nested candidates,
  - nested candidate preference,
  - right-click with no valid candidate,
  - highlight persistence/clear rules across output invalidation,
  - pane navigation after repeated pane opens and resets.

#### 2. Documentation updates

**Files**:

- [docs/ui-spec.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md)
- [docs/architecture.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
- [docs/design-style.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/design-style.md)
- [docs/learnings.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)

**Changes**:

- Update product behavior docs from structural split panes to embedded-content exploration.
- Document the generalized pane platform separately from the current product behavior.
- Add learnings that prevent regressions back to one-off same-source pane assumptions.

### Success Criteria

#### Automated Verification:

- [ ] All new and updated unit tests pass.
- [ ] All updated Electron e2e tests pass.
- [ ] Full local quality gate passes: `pnpm check`
- [ ] Full test suite passes: `pnpm test`

#### Manual Verification:

- [ ] Run a final end-to-end walkthrough covering highlight, `Prettify in Pane`, descendant invalidation, and `Prettify & Replace`.
- [ ] Run a final agent-driven Playwright verification pass against the Electron app.
- [ ] Verify the updated docs accurately describe the final product behavior and the retained pane-strip platform.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the feature complete.

## Testing Strategy

### Unit Tests

- Embedded candidate detection and deterministic candidate ordering.
- Output-editor `Ctrl+click` highlight behavior.
- Output-editor context menu action enablement.
- Generalized pane descriptor and pane-chain mutation logic.
- Descendant invalidation after upstream content changes.
- Replace-through-input state flow.

### Integration / Electron E2E Tests

- Output-mode embedded highlight without pane creation.
- Right-click `Prettify in Pane` opens an independent prettified pane.
- Repeated pane opens preserve pane-strip navigation and focus behavior.
- Upstream pane/root changes close dependent panes to the right.
- `Prettify & Replace` rewrites root content and resets panes.

### Manual Testing Steps

1. Paste a JSON fixture containing an escaped GraphQL query string and verify the primary workflow end to end.
2. Paste a second fixture in another supported host format that contains embedded structured content and verify extraction still works.
3. Verify nested candidate selection chooses the outermost containing candidate.
4. Verify `Ctrl+click` highlights only and never opens a pane.
5. Verify `Prettify in Pane` preserves the pane-strip metaphor and output-pane tooling.
6. Verify `Prettify & Replace` rewrites root content and closes descendants.
7. Verify each completed phase with an agent-driven Playwright Electron session before phase sign-off.

## Performance Considerations

- Detection must run only on explicit user actions (`Ctrl+click`, context-menu invocation, or explicit action execution), not on every cursor move.
- Pane generalization must not regress the existing pane-strip viewport animation or focus behavior.
- Independent pane content must keep Monaco model/view-state ownership explicit so repeated pane opens do not leak models or collapse editor performance.
- Root-content replacement should reuse the current input/output pipeline rather than duplicating expensive prettify logic.

## Migration Notes

- This plan introduces a new numbered spec rather than rewriting history, but it supersedes the user-facing product behavior described in [0017](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md).
- Historical split-pane specs remain useful as implementation references for pane-strip layout, viewport snapping, focus management, and stack-pop behavior.
- During implementation, obsolete product docs and tests that still describe `Ctrl+click => open structural pane` must be updated or removed.

## References

- Historical pane-strip behavior: [0016](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0016-output-structural-split-pane-stage-one.md)
- Historical recursive pane-strip behavior: [0017](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md)
- Output editor options: [src/renderer/output/outputEditorConfig.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts#L10)
- Current `Ctrl+click` split behavior: [src/renderer/components/OutputEditor.tsx](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx#L43)
- Current pane domain model: [src/renderer/app/outputPaneDomain.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts#L5)
- Current pane controller view-model construction: [src/renderer/app/useOutputPaneController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts#L122)
- Current whole-document prettifier flow: [src/renderer/app/usePrettifierFlow.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts#L95)
