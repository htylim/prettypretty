# 0016 Output Structural Split Pane Stage One

## 1. Current State

- Output mode currently renders one read-only Monaco editor through [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx).
- The editor already supports Monaco-backed folding, inline fold controls, and a modifier-click fold gesture wired through [`src/renderer/output/indentBlockFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/indentBlockFolding.ts) plus [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts).
- [`src/renderer/components/EditorShell.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx) and [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts) assume there is exactly one output editor instance.
- Toolbar actions (`Expand`, `Collapse`, `Copy`, `Save`) are also wired around that single-output-editor assumption through [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx).
- There is no concept of:
  - a structural selection that resolves the smallest enclosing foldable block,
  - a derived read-only pane created from a parent pane,
  - a non-native “copied to split pane” highlight in the source pane,
  - descendant invalidation when an upstream pane is reselected.
- [`docs/specs/todo.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/todo.md) already captured this feature direction informally. This spec formalizes that idea into a stage-one scope that is implementation-ready and leaves a clean seam for later multi-pane expansion.

## 2. Desired End State

- In output mode, literal `Ctrl+click` on pane `A` resolves the smallest enclosing Monaco foldable block for the clicked line and opens a second pane `B`.
- Stage one supports exactly one derived pane:
  - initial state: `A`
  - after `Ctrl+click` on `A`: `A | B`
  - after another `Ctrl+click` on `A`: `B` is replaced with the new source view
- The layout is a `50/50` split between `A` and `B`.
- Pane `B` shows the selected block as a read-only view onto the same Monaco source model used by `A`.
- Pane `B` always opens expanded, even if the source block in `A` was folded.
- Pane `A` shows the extracted block with a subtle custom highlight that is visually distinct from native text selection.
- The custom highlight is source-of-truth UI only:
  - it does not move the cursor,
  - it does not create a normal browser/Monaco text selection,
  - it does not alter copied/saved output text.
- If the selected block in `A` was folded, `Ctrl+click` on that folded start line still resolves that block and `B` shows the full unfolded block content.
- Pane `B` is closable from a toolbar button placed immediately to the right of the fallback control. The button should read as a “close/pop split” affordance, using a leftward/rewind-like icon plus the label `Split`.
- When the split is closed, pane `B` disappears and the custom highlight in `A` is cleared.

Stage-one interaction example:

```text
A only
Ctrl+click on nested object in A
A | B
Ctrl+click somewhere else in A
A | B (same layout, B replaced with new extracted block)
Click toolbar Split button
A only
```

Future seam that must influence stage-one architecture but is not implemented now:

- Later scopes will allow `A -> B -> C -> ...` by repeating the same gesture on derived panes.
- When an upstream pane is reselected, all of its descendants must be discarded.
- Later scopes should extend the pane strip horizontally instead of shrinking second-generation-and-beyond panes.
- Stage one must not hardcode a dead-end `secondaryOutputText` / `secondarySelection` state model that would force a rewrite for that later chain behavior.

## 3. Patterns To Follow

- Keep [`src/renderer/App.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/App.tsx) composition-only. Pane-chain orchestration belongs in controller/domain layers, not in the top-level render shell.
- Keep Monaco folding and fold-region resolution centralized in [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts). Do not introduce a second ad hoc way to infer block boundaries.
- Resolve structural selection from Monaco model ranges, not visible text or DOM text. Folded source must still resolve the full underlying region.
- Reuse the existing read-only output editor primitive. Add a pane-strip wrapper around it instead of cloning editor setup code for the derived pane.
- Render source highlights with Monaco decorations. Do not reuse native text selection styling and do not inject marker text into the model.
- Keep pane-specific view state isolated per pane instance. Do not keep a single global `documentId -> viewState` cache once multiple panes can show related or even identical text.
- Keep a single Monaco source model per root output document when multiple panes must preserve original line numbers. Derived panes should filter visibility, not fork content.
- Follow the current disposable-registration pattern for Monaco event wiring.
- Preserve current output-view behavior unless this spec explicitly changes it.

## 4. Deliverables

### Architecture decisions

- Introduce a pane-chain domain seam for derived panes. Stage one only renders one derived pane, but the state model must already represent “a pane derived from a parent pane” rather than a special-case secondary pane.
- Preferred shape:
  - root pane `A` stays implicit and is backed by the current `outputText`
  - derived panes are represented as ordered links from parent pane to child pane
  - each link stores:
    - `parentPaneId`
    - `paneId`
    - source model range in the shared root model
- Add focused helpers for split-pane domain logic, either in [`src/renderer/app/appDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/appDomain.ts) or a dedicated split-pane domain module. Do not spread chain mutation rules inline across React components.
- Add a Monaco-backed structural-selection module such as [`src/renderer/output/structuralSplitSelection.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts) to own:
  - resolving the smallest enclosing foldable block for a clicked line,
  - returning the full source range for that block.
- Extend [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts) so the shared folding adapter can return the resolved fold range, not only the fold-start line.
- Add a shared view-range helper such as [`src/renderer/output/outputViewRange.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputViewRange.ts) to apply pane-local hidden areas for derived views over the shared source model.
- Add an output-only highlight module such as [`src/renderer/output/splitSelectionDecorations.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/splitSelectionDecorations.ts) to own Monaco decorations for the custom “copied to split pane” highlight.
- Add a wrapper component such as [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) to render pane `A` plus optional pane `B`.
- Refactor [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) so one output editor instance can be mounted multiple times safely with:
  - one shared Monaco model path per root output document,
  - pane-instance-specific view-state keys,
  - optional pane-local view-range input,
  - optional source-highlight decoration input,
  - optional split-selection gesture registration,
  - focus reporting so controller logic knows which visible output pane is active.
- Refactor controller state so it can:
  - open or replace the child pane of a parent pane,
  - drop descendants when an upstream pane is reselected,
  - close the rightmost derived pane,
  - clear the whole pane chain when the root output document changes or output mode exits.

### Interaction decisions

- Stage one split selection is output-only. Input mode does not gain split behavior.
- The stage-one gesture is literal `Ctrl+click` on every platform. This intentionally overrides the current cross-platform “primary modifier” pattern for this feature only and is temporary by product direction.
- Block resolution rules:
  - clicking a folded fold-start line selects that folded block,
  - clicking inside an unfolded block selects the smallest enclosing foldable block for that line,
  - clicking a line with no enclosing foldable block is a no-op.
- Source-view rules:
  - resolve the exact Monaco model range for the selected fold region,
  - preserve indentation and line breaks from the shared root model,
  - do not insert wrapper text or breadcrumbs,
  - do not normalize indentation for stage one.
- Derived-pane rules:
  - pane `B` is read-only,
  - pane `B` uses the same syntax detection, theme, minimap, line numbers, and inline fold controls as pane `A`,
  - pane `B` keeps original source line numbers instead of renumbering from `1`,
  - pane `B` does not open further panes in stage one,
  - pane `B` starts expanded regardless of the source pane fold state.
- Update rules:
  - if `B` is open and `A` receives another valid `Ctrl+click`, replace `B` with the new source view,
  - if the newly selected block is identical to the current one, treat it as a no-op rather than tearing down and recreating pane state,
  - if the root output document changes, clear pane `B` and clear the highlight in `A`,
  - if pane mode switches away from output, clear pane `B` and clear the highlight in `A`,
  - reset/new-window flows must also clear split-pane state.
- Fold interaction conflict resolution:
  - in output panes, `Ctrl+click` is reserved for split selection in this scope,
  - output-pane modifier-click fold toggling is removed in this scope,
  - output folding remains available via inline fold controls and toolbar actions,
  - input-pane modifier-click folding remains unchanged.
- Active-pane toolbar routing:
  - `Expand`, `Collapse`, and output-mode find actions must target the last-focused visible output pane,
  - when split first opens or is replaced, pane `B` becomes the active pane immediately,
  - `Save` and `Copy` keep their existing meaning and continue to operate on the full root output text, not the derived pane text.
- Close-split toolbar action:
  - add the button immediately after the fallback dropdown/control in the toolbar,
  - keep it visible but disabled when no derived pane is open,
  - clicking it removes the rightmost derived pane; in stage one that means closing `B`.

### Design decisions

- Output split layout:
  - two equal-width panes (`50/50`) inside the existing editor shell height,
  - visible separator between panes using existing border/surface tokens,
  - no modal/overlay treatment; this is a persistent side-by-side layout until closed.
- Pane-strip seam:
  - implement the container as an ordered horizontal pane strip so later scopes can extend it,
  - do not implement second-generation horizontal overflow behavior yet,
  - do not hardcode CSS that makes extension to a scrollable pane strip difficult.
- Highlight treatment in the source pane:
  - subtle fill or line-background treatment using tokenized colors,
  - visually distinct from native Monaco selection and search match styling,
  - folded regions must still show a clear highlighted fold-start line when selected,
  - no animated pulse or attention-grabbing treatment.
- Toolbar split button treatment:
  - use the shared `.btn` button pattern,
  - icon may vary, but the intent must read as “close/pop the split pane to the left”,
  - label text is `Split`.

### State-model decisions

- Do not add one-off fields such as `secondaryOutputText`, `secondaryOutputDocumentId`, or `secondarySelectionRange`.
- Track derived panes as a chain, even though stage one caps the rendered chain length to one.
- Track active output pane id separately from pane content so fold/find routing stays deterministic.
- The parent pane owns the outgoing highlight that points to its child pane.
- Pane instance identity must be stable across focus changes and independent from shared source document identity. This prevents multiple visible editors from accidentally sharing view state.

### Component decisions

- [`src/renderer/components/EditorShell.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx) should render the output pane strip instead of a single output-editor container when in output mode.
- [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx) should receive:
  - whether a derived pane is open,
  - a close-split callback.
- [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts) should own:
  - pane-chain state transitions,
  - active output pane tracking,
  - clearing split state on root output invalidation,
  - routing toolbar fold/find actions to the active visible output pane.
- [`src/renderer/state/uiStore.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/state/uiStore.ts) may hold split-pane state if the implementation keeps it renderer-window-local and cleanly resettable. If state remains local to the controller instead, keep the mutation rules isolated behind named helpers.

### Tests decisions

- Extend [`tests/unit/renderer/editor/monacoFolding.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/editor/monacoFolding.test.ts) to cover smallest-enclosing fold-range resolution, including nested regions.
- Add unit coverage for the structural-selection module, for example in [`tests/unit/renderer/output/structuralSplitSelection.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/structuralSplitSelection.test.ts):
  - nested fold resolution returns the smallest enclosing range,
  - folded start-line clicks resolve the folded block itself,
  - non-foldable lines return no selection.
- Add unit coverage for split-selection decorations, for example in [`tests/unit/renderer/output/splitSelectionDecorations.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/splitSelectionDecorations.test.ts):
  - decoration applies when a child pane exists,
  - decoration clears when the child pane closes,
  - decoration uses a non-selection class.
- Update [`tests/unit/renderer/components/OutputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputEditor.test.tsx) to cover:
  - shared source-model pathing with pane-local view ranges,
  - pane-instance view-state keying,
  - optional split gesture registration only where enabled,
  - highlight decoration registration/disposal,
  - focus reporting.
- Add unit coverage for the pane strip component, for example in [`tests/unit/renderer/components/OutputPaneStrip.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputPaneStrip.test.tsx):
  - one-pane render,
  - two-pane render,
  - `50/50` layout contract,
  - replacing pane `B`,
  - closing pane `B`.
- Update [`tests/unit/renderer/components/Toolbar.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/Toolbar.test.tsx) to cover the split button presence, enable/disable rules, and placement after the fallback control.
- Update [`tests/unit/renderer/components/EditorShell.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/EditorShell.test.tsx) to cover output-mode pane-strip rendering.
- Update [`tests/unit/renderer/app/useAppController.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useAppController.test.ts) to cover:
  - opening/replacing the derived pane,
  - closing the derived pane,
  - clearing split state on output invalidation,
  - routing fold/find actions to the focused output pane,
  - keeping save/copy bound to root output text.
- Add or extend Electron E2E coverage with:
  - `Ctrl+click` on an unfolded nested line opens `B` with the smallest enclosing block,
  - `Ctrl+click` on a folded line opens `B` with that block expanded,
  - pane `B` preserves original source line numbers for the visible block,
  - a second `Ctrl+click` on `A` replaces `B`,
  - the toolbar split button closes `B`,
  - the source highlight appears in `A` and is not a native text selection,
  - output `Expand` / `Collapse` target the focused pane while `Save` / `Copy` remain root-output actions.

### Documentation decisions

- This spec is the stage-one source of truth for split-pane behavior.
- On implementation, update:
  - [`docs/ui-spec.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md)
  - [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
  - [`docs/design-style.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/design-style.md)
  - [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)
- Those updates must document both stage-one behavior and the chain-based seam for later multi-pane work.

### Code-quality decisions

- Do not compute extracted ranges from DOM text or visible editor lines.
- Do not reuse native selection to show the source highlight.
- Do not let multiple visible output editors share the same view-state cache key.
- Do not bind split-pane state to transient component-local booleans with unnamed reset rules.
- Do not make `Save` / `Copy` semantics ambiguous when a derived pane is open.
- Do not reintroduce output-pane modifier-click fold toggling through a competing gesture in this scope.

Reference note for implementation agents: any code examples or type shapes in this spec are intent-only. They are not copy-paste implementation source.

## 5. Acceptance Criteria

- [ ] In output mode, literal `Ctrl+click` on pane `A` resolves the smallest enclosing foldable block and opens pane `B`.
- [ ] `Ctrl+click` on a folded fold-start line opens that exact folded block in pane `B`, expanded.
- [ ] `Ctrl+click` on a line with no enclosing foldable block is a no-op.
- [ ] Stage one renders at most two panes: `A` and optional `B`.
- [ ] When `B` is open, layout is `50/50`.
- [ ] Pane `B` shows the selected block as a read-only view over the shared source model.
- [ ] Pane `B` preserves the original source line numbers for the visible block.
- [ ] Pane `A` shows a custom subtle highlight for the block displayed in `B`.
- [ ] The custom highlight is visually distinct from native text selection.
- [ ] Repeating `Ctrl+click` on `A` replaces `B` instead of opening a third pane.
- [ ] The toolbar split button closes `B` and clears the highlight in `A`.
- [ ] Output-pane `Ctrl+click` no longer toggles folds in this scope.
- [ ] Output inline fold controls and toolbar fold actions still work.
- [ ] Output `Expand`, `Collapse`, and find target the focused visible output pane.
- [ ] `Save` and `Copy` still operate on the full root output text.
- [ ] Split-pane state clears when output mode exits, the root output document changes, or the window resets.
- [ ] Stage-one state and layout seams do not hardcode a special-case secondary-pane model that blocks later chain expansion.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## 6. File Summary

- New: [`docs/specs/0016-output-structural-split-pane-stage-one.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0016-output-structural-split-pane-stage-one.md)
- New: [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx)
- New: [`src/renderer/output/structuralSplitSelection.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts)
- New: [`src/renderer/output/splitSelectionDecorations.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/splitSelectionDecorations.ts)
- Modify: [`src/renderer/components/EditorShell.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx)
- Modify: [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- Modify: [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx)
- Modify: [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)
- Modify: [`src/renderer/app/appDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/appDomain.ts) or new split-pane domain module
- Modify: [`src/renderer/state/uiStore.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/state/uiStore.ts) if split-pane state is store-owned
- Modify: [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts)
- Modify: [`src/renderer/output/indentBlockFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/indentBlockFolding.ts)
- Modify: [`src/renderer/styles/tailwind.css`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/styles/tailwind.css)
- New: [`tests/unit/renderer/components/OutputPaneStrip.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputPaneStrip.test.tsx)
- New: [`tests/unit/renderer/output/structuralSplitSelection.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/structuralSplitSelection.test.ts)
- New: [`tests/unit/renderer/output/splitSelectionDecorations.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/splitSelectionDecorations.test.ts)
- Modify: [`tests/unit/renderer/editor/monacoFolding.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/editor/monacoFolding.test.ts)
- Modify: [`tests/unit/renderer/components/OutputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputEditor.test.tsx)
- Modify: [`tests/unit/renderer/components/Toolbar.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/Toolbar.test.tsx)
- Modify: [`tests/unit/renderer/components/EditorShell.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/EditorShell.test.tsx)
- Modify: [`tests/unit/renderer/app/useAppController.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useAppController.test.ts)
- Modify: [`tests/e2e/app-smoke.spec.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/e2e/app-smoke.spec.ts) or a dedicated split-pane E2E spec
- On implementation modify: [`docs/ui-spec.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md)
- On implementation modify: [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
- On implementation modify: [`docs/design-style.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/design-style.md)
- On implementation modify: [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)

## 7. Open Questions / Resolved Decisions

- Resolved: stage-one split selection uses literal `Ctrl+click` on every platform as a temporary testing gesture.
- Resolved: selection always targets the smallest enclosing foldable block.
- Resolved: clicking a folded line means selecting that folded block; the derived pane opens it expanded.
- Resolved: stage-one layout is a `50/50` two-pane split.
- Resolved: stage one supports only one derived pane, but the architecture must model parent-child pane derivation so later `A -> B -> C` expansion does not require a state-model rewrite.
- Resolved: later multi-pane scopes should extend the pane strip horizontally instead of shrinking second-generation-and-beyond panes, but that behavior is out of scope here.
- Resolved: in output panes, `Ctrl+click` is repurposed from fold toggling to split selection for this scope; input-pane modifier-click folding remains unchanged.
- Resolved: `Save` and `Copy` remain root-output actions, while fold/find actions target the focused visible output pane.
- Open question: none.
