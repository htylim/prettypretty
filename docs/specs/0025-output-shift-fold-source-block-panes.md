# 0025 Output Shift Fold Source-Block Panes

This spec defines a new output-only fold-control mode. It extends the existing inline fold controls with `Shift`-driven pane extraction for foldable source blocks.

This document is product and architecture guidance for a future implementation. It is not an implementation plan, and any unclear point discovered during implementation must be clarified before code is written.

## 1. Current State

Output mode already has two related systems:

- inline fold controls in [`src/renderer/output/inlineFoldControls.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/inlineFoldControls.ts)
- stacked output panes in [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts) and [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)

Current behavior:

- the default inline fold button toggles collapse/expand for the clicked fold start
- holding literal `Ctrl` changes the same button to direct-child fold expansion/collapse
- right-click `Prettify...` can open a derived pane to the right of the clicked pane
- pane chaining is linear: every pane depends on the pane to its left, and any change on the left invalidates everything to the right

Current limitations:

- there is no inline action that opens the clicked structural block in its own pane
- fold controls do not expose pane state, so the user cannot tell whether a block is already being shown to the right
- there is no visual source highlight that links a pane to the block it came from
- current pane content modeling covers root text, independent derived text, and source-range viewport behavior, but not “show this fold body as a rebased extracted pane while keeping original displayed line numbers”

Why this spec is needed:

- the existing pane UI is already the right metaphor for “show me this substructure next to its parent”
- forcing this behavior through ad hoc view code would mix Monaco widget logic, pane-state ownership, and source-block presentation concerns
- this feature must work recursively in panes, not just at the root output

## 2. Desired End State

### User-visible behavior

In output mode only:

- holding `Shift` changes inline fold controls from fold behavior to pane behavior
- holding `Ctrl` and `Shift` together cancels both modifier modes
- in the combined `Ctrl` + `Shift` state, controls fall back to the normal self fold UI and normal self fold action

When `Shift` is held:

- a fold start that is not currently shown in that pane’s direct child renders a `↗` action
- clicking `↗` opens that fold body in the pane immediately to the right
- a fold start whose fold body is already shown in that pane’s direct child renders a `↙` action
- clicking `↙` closes that child pane and all descendants to its right

### What counts as “the block”

The extracted pane must show the same logical block body that would be hidden by the normal collapse action.

Example:

- if a fold start is on line `40`
- and collapsing that fold hides lines `41-85`
- then `Shift` + click on line `40` opens a pane that shows lines `41-85`
- line `40` itself is not shown in the extracted pane

This source-block boundary must come from the same Monaco folding data already used by the fold controls. Do not introduce language-specific slicing heuristics for this behavior.

### Pane behavior

- the new pane uses the existing stacked pane chain and direct-child replacement rules
- `Shift` extraction and `Prettify...` are two producers for the same derived-pane slot
- opening one replaces the other when they target the same parent pane
- the same rules apply recursively inside derived panes

Examples:

- if a pane already has a `Prettify...` child and the user clicks `↗` in that pane, the prettify child closes and the extracted-block child opens
- if a pane already has an extracted-block child and the user runs `Prettify...`, the extracted-block child closes and the prettify child opens
- if a user opens an extracted block in pane 1, then opens another extracted block inside pane 2, pane 3 opens normally as the next child in the chain

### Extracted pane presentation

The extracted pane must:

- show the exact body text of the block
- preserve internal relative indentation and blank lines
- rebase common leading indentation so the extracted block starts visually at indentation level `0`
- keep displayed line numbers aligned with the source lines shown in the parent pane

This means:

- the pane text is a rebased excerpt, not the entire parent document clipped by viewport alone
- the displayed line numbers are source-linked, not renumbered from `1`

For the example above:

- the pane text starts with the source content from line `41`
- the first displayed line number in the pane is `41`

### Source highlight

When a block is open as that pane’s direct child:

- the source block body in the parent pane is rendered with a subtle background highlight
- the highlight covers the extracted body lines, not the fold-start header line
- the highlight remains visible even when `Shift` is not currently held
- the highlight must be visually soft, closer to Monaco’s light folded-line treatment than to a normal selection fill

The highlight disappears when:

- the matching extracted pane is closed
- the parent pane opens different child content
- the parent pane changes in any way that invalidates descendants

### Scope boundaries

- this feature is output-only
- this feature is not limited to JSON; it must work anywhere the output editor already has fold regions
- no combined `Ctrl` + `Shift` action is part of this spec

## 3. Patterns To Follow

Implementation must follow the current ownership boundaries already present in the codebase.

### Document session and pane chain ownership

Use [`src/renderer/app/session/useDocumentSession.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/session/useDocumentSession.ts) and [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts) as the source of truth for renderer-visible pane state.

Required pattern:

- keep pane-chain transitions pure in the pane domain
- keep controller orchestration in [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
- do not store pane state inside Monaco runtime helpers or view components

### Monaco runtime ownership

Use [`src/renderer/components/useOutputEditorRuntime.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/useOutputEditorRuntime.ts) as the runtime seam for editor-local behavior.

Required pattern:

- keep Monaco widget registration, decorations, and line-number presentation in focused runtime code
- keep [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) as a thin adapter
- keep [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) render-only

### Folding source of truth

Use [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts) as the source of truth for fold-region discovery.

Required pattern:

- derive block boundaries from Monaco folding regions, not string scans
- keep fold-boundary resolution shared between the existing fold actions and the new pane extraction action
- do not duplicate “what is the fold body for this start line?” logic inside widgets and controllers

### Shared pane-producer behavior

Current pane producers already share one pane chain.

Required pattern:

- model `Shift` extraction and context-menu prettify as sibling producers of the same derived-pane slot
- keep replacement, descendant invalidation, and focus behavior shared
- do not create a second parallel pane system for extracted blocks

### Renderer testing expectations

Follow the existing renderer testing rules:

- every touched renderer module/component gets unit-test coverage
- this feature is user-visible and Electron-visible, so it requires e2e coverage

## 4. Deliverables

### Architecture Decisions

- Introduce an explicit source-block pane concept in the output pane domain instead of forcing this behavior through the existing independent-text pane shape.
- Keep source-block identity data serializable and controller-owned. Runtime code may discover fold regions, but pane state must store plain data only.
- Treat source-block extraction as a first-class pane producer alongside context-menu prettify, not as a special effect buried inside fold widgets.
- Keep source highlight ownership in the editor runtime, but derive its active ranges from pane state. Do not maintain a second mutable highlight store.
- Preserve the current pane-chain rule: direct child replacement trims all descendants before inserting replacement content.

### Design Decisions

- `Shift` remaps the inline fold controls to arrow affordances: `↗` for “open this block in the next pane” and `↙` for “close the pane showing this block”.
- `Ctrl` + `Shift` together cancel modifier-specific remapping and show the normal self fold control state.
- The new action is shown only for output fold controls. Input editor fold controls do not change.
- The extracted-source highlight must be subtle, always-on while active, and scoped to the extracted body lines only.
- Button labels, titles, and accessibility copy must describe pane behavior explicitly and not reuse collapse/expand wording.

### Data Model Decisions

- Extend the pane content model with a dedicated extracted-source variant. It must carry:
  - the extracted pane text
  - the extracted body range in the parent pane’s displayed coordinate space
  - the first displayed line number for the pane
  - enough identity to answer “is this parent pane’s direct child the block for this fold start?”
- Scope extracted-block equality to the parent pane plus extracted body range. Two identical ranges in different parent panes are not the same pane target.
- Keep line-number presentation metadata separate from fold-widget runtime state. The pane descriptor must expose enough data for the editor runtime to render source-linked line numbers without peeking into controller internals.
- Do not overload the current source-range viewport content with rebased extracted text semantics. This feature needs a distinct model because it combines copied text, source-linked numbering, and parent-range identity.

### Runtime Decisions

- Add shared helper(s) near the folding subsystem to resolve the body range for a fold start and to extract rebased pane text from that range.
- Update the output editor runtime so it can:
  - resolve the current modifier mode
  - ask whether a visible fold start is currently represented by the pane’s direct child
  - trigger open/close actions for extracted-source panes
  - render/remove source-range highlight decorations
  - render source-linked line numbers for extracted panes
- Keep modifier handling centralized. The fold controls must not independently invent precedence rules.
- If Monaco folding data is temporarily unavailable for a visible line, the control must degrade safely and avoid opening a malformed pane.

### Controller Decisions

- Add pane-controller API surface for opening and closing extracted-source panes by parent pane id and source-block descriptor.
- Keep focus behavior aligned with existing pane-opening behavior: opening a block focuses the new active pane after strip movement completes.
- Closing a `↙` pane action behaves like closing that child slot, which also removes all descendants to the right.
- Derive “this fold start is open in the direct child” from pane state. Do not persist a duplicate boolean map keyed by line number.

### Code Changes Decisions

- Refactor [`src/renderer/output/inlineFoldControls.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/inlineFoldControls.ts) so button rendering is driven by an explicit modifier mode and explicit action descriptors instead of hard-coded `Ctrl` branching.
- Extend [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts) with shared fold-body resolution helpers instead of teaching downstream modules to reinterpret fold starts.
- Extend [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts) so the pane domain understands extracted-source content identity, replacement, and equality.
- Extend [`src/renderer/components/useOutputEditorRuntime.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/useOutputEditorRuntime.ts) and [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) to support source-linked line numbering and block highlight decoration for extracted panes.
- Update [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts) and [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts) so pane-producing actions stay orchestrated in the controller layer.
- Keep [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) render-only except for prop wiring.

### Tests Decisions

- Add unit tests for fold-body resolution and rebased block extraction helpers.
- Add unit tests for inline fold-control modifier modes:
  - default self toggle
  - `Ctrl` child toggle
  - `Shift` extracted-pane open/close
  - `Ctrl` + `Shift` cancellation back to default behavior
- Add unit tests for extracted-source pane equality and replacement rules in the pane domain.
- Add unit tests for controller orchestration covering:
  - opening an extracted pane from the root output
  - replacing a `Prettify...` child with an extracted-source child
  - replacing an extracted-source child with a `Prettify...` child
  - recursively opening extracted panes inside derived panes
  - closing `↙` and trimming descendants
- Add unit tests for output-editor presentation:
  - source-linked line numbers in extracted panes
  - active source-block highlight decorations
  - highlight cleanup on replacement/invalidation
- Add or extend Electron e2e coverage for the visible user journey:
  - hold `Shift`, open a folded block into a pane
  - verify the source highlight
  - verify line numbers match the source pane
  - verify `Prettify...` and extracted-source panes replace each other
  - verify recursive pane stacking still works

### Documentation Decisions

When implementation lands, update the current-state docs to match the shipped behavior:

- [`README.md`](/Users/hernantylim/Dev/sandbox/prettypretty/README.md)
- [`docs/ui-spec.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md)
- [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
- [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)

## 5. Acceptance Criteria

- [ ] Output inline fold controls switch to pane actions while `Shift` is held.
- [ ] Holding `Ctrl` and `Shift` together cancels modifier-specific remapping and preserves the normal self fold action.
- [ ] Clicking `↗` opens the fold body, not the fold header line, in the parent pane’s direct child slot.
- [ ] Clicking `↙` closes that child pane and all descendants to its right.
- [ ] Extracted-source panes and `Prettify...` use the same direct-child replacement rule and replace each other predictably.
- [ ] The feature works from the root output pane and from derived panes recursively.
- [ ] Extracted-source pane text preserves the exact block body content while rebasing common leading indentation to zero.
- [ ] Extracted-source panes display source-linked line numbers that match the source pane instead of restarting at `1`.
- [ ] The source pane shows a subtle highlight for the active extracted block body while that block is open in the direct child pane.
- [ ] The source highlight is removed on close, replacement, or any left-pane invalidation that trims descendants.
- [ ] Existing default fold behavior and existing `Ctrl` child-fold behavior remain unchanged when `Shift` is not active.
- [ ] The feature works for any output language that already exposes Monaco fold regions.
- [ ] Every touched renderer module/component has corresponding unit-test coverage.
- [ ] Required quality gates for the implementation pass: `pnpm check`, `pnpm test`, and `pnpm test:e2e`.

## 6. File Summary

This spec expects implementation work in the following areas.

Likely modified files:

- [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts)
- [`src/renderer/output/inlineFoldControls.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/inlineFoldControls.ts)
- [`src/renderer/output/outputEditorConfig.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputEditorConfig.ts)
- [`src/renderer/components/useOutputEditorRuntime.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/useOutputEditorRuntime.ts)
- [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts)
- [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
- [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)

Likely new helper modules:

- a fold-body extraction helper near the Monaco folding subsystem
- an extracted-source pane presentation helper if line-number mapping and excerpt normalization need to stay separate from the pane domain

Expected test updates:

- [`tests/unit/renderer/output/inlineFoldControls.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/inlineFoldControls.test.ts)
- [`tests/unit/renderer/output/monacoEditorRuntime.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/monacoEditorRuntime.test.ts)
- [`tests/unit/renderer/app/outputPaneDomain.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/outputPaneDomain.test.ts)
- [`tests/unit/renderer/app/useAppController.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useAppController.test.ts)
- [`tests/unit/renderer/components/useOutputEditorRuntime.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/useOutputEditorRuntime.test.ts)
- [`tests/e2e/app-flows.spec.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/e2e/app-flows.spec.ts)

## 7. Open Questions / Resolved Decisions

### Resolved Decisions

- The feature is output-only.
- `Ctrl` + `Shift` together do nothing special and cancel modifier-specific remapping.
- The extracted pane shows the fold body that would be hidden by collapse, not the fold-start header line.
- Clicking `↙` closes the matching child pane and every descendant to the right.
- Button state is scoped to whether that exact block is shown in the direct child pane for that parent.
- Extracted blocks are shown with indentation rebased to zero.
- Extracted panes must still display the original source line numbers.
- The source block should be highlighted in the parent pane with a subtle, always-on visual cue while active.

### Non-Blocking Implementation Choice

The implementation plan may choose between:

- adding a dedicated extracted-source pane content type directly in the existing pane domain module
- or introducing a thin presentation helper around that new content type

What it may not do:

- hide this behavior inside view-only state
- duplicate pane identity state outside the pane domain
- rely on string heuristics instead of Monaco fold-region boundaries
