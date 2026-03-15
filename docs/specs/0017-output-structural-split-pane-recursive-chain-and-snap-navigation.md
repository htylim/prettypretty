# 0017 Output Structural Split Pane Recursive Chain And Snap Navigation

Reference note: any code shapes, constants, hook names, or type names in this spec are intent-only. They clarify the target architecture; they are not copy-paste implementation source.

## 1. Current State

- [`docs/specs/0016-output-structural-split-pane-stage-one.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0016-output-structural-split-pane-stage-one.md) formalized the current stage-one output split behavior.
- Current output behavior is:
  - `A`
  - `Ctrl+click` on `A` opens `B`
  - later `Ctrl+click` on `A` replaces `B`
  - `Ctrl+click` on `B` does nothing
- Current controller/domain code already uses a chain-capable data model in [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts), but current UI behavior is still stage-one because only the root pane enables split selection.
- [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) already mounts panes in a horizontal strip and keeps overflow possible, but it does not yet define the recursive interaction model, pane-step viewport navigation, or hidden-scrollbar UX required for this feature.
- [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx) exposes only the stage-one split close action.
- [`src/renderer/app/useKeyboardShortcuts.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useKeyboardShortcuts.ts) has no split-navigation shortcuts yet.
- The current state is therefore structurally close to the desired feature, but incomplete in the three places that matter most:
  - recursive split creation from derived panes,
  - viewport navigation across a mounted pane chain,
  - focus/toolbar routing that follows pane navigation instead of only click focus.

## 2. Desired End State

- Output mode supports a recursive structural pane chain:
  - `A`
  - `Ctrl+click` in `A` -> `A | B`
  - `Ctrl+click` in `B` -> chain becomes `A B C`, viewport animates to show `B | C`
  - `Ctrl+click` in `C` -> chain becomes `A B C D`, viewport animates to show `C | D`
- The full chain remains mounted. Off-screen panes do not disappear; they sit outside the current viewport and remain reachable by viewport navigation.
- Split creation rules:
  - `Ctrl+click` on any pane opens or replaces that pane's direct child.
  - Opening/replacing a child always drops all descendants to the right of that child before applying the new selection.
  - Example:
    - `A B C D`
    - `Ctrl+click` on `B`
    - result: `A B C`
    - `C` is replaced from `B`'s new selection, and prior `D` is discarded
- Derived-pane selection rules:
  - every pane is a filtered read-only view over the same root output model,
  - a pane may split again only when the clicked foldable block is strictly smaller than that pane's own visible source range,
  - if the smallest resolved foldable block equals the pane's full visible range, the gesture is a no-op.
- Viewport rules:
  - with one pane, width is `100%`,
  - once any derived pane exists, every pane uses a fixed width equal to half of the visible output viewport,
  - adding more panes does not shrink existing panes below that `50%` width,
  - the viewport always snaps to whole-pane positions,
  - app-driven moves animate between pane positions instead of jumping.
- Viewport progression example:

```text
A
A | B
B | C   (A still mounted off-screen to the left)
C | D   (A and B still mounted off-screen to the left)
```

- Users can navigate the mounted chain without a visible outer scrollbar:
  - toolbar buttons inside a `Splits` control group,
  - `Ctrl+Left` and `Ctrl+Right`,
  - `Ctrl+Wheel`,
  - `Ctrl+trackpad scroll` / horizontal gesture equivalents.
- Scrollbar UX rules:
  - the pane-strip scrollbar UI must not be visible,
  - pane-local Monaco scrollbars remain as Monaco defines them,
  - the outer strip reacts only to split-system `Ctrl+...` gestures and programmatic navigation,
  - normal editor wheel/scroll behavior must remain untouched when the split modifier is not active.
- Close rules:
  - the split chain is a stack,
  - the close action always removes the rightmost derived pane,
  - the toolbar close action and `Escape` both pop that stack,
  - closing animates the viewport so the new rightmost visible pair is shown.
- Focus rules:
  - `Expand`, `Collapse`, and find continue targeting the active visible pane,
  - pane navigation moves active focus with the viewport,
  - when navigating right, focus moves to the new right-side pane,
  - when navigating left, focus moves to the new left-side pane,
  - when a pane is popped, focus moves to the new rightmost visible pane.
- Gesture consistency rule:
  - keep the existing literal `Ctrl+click` split gesture semantics exactly as implemented now,
  - any new split-system gesture in this scope follows that same literal `Ctrl` modifier convention.
- Pane chrome rule:
  - panes remain visually bare,
  - no headers, breadcrumbs, titles, or per-pane chrome are added in this scope.

## 3. Patterns To Follow

- Keep [`src/renderer/App.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/App.tsx) composition-only.
- Keep pure pane-chain mutation logic in [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts) or a tightly related output-pane domain module. Do not spread descendant-truncation or viewport-step math across React components.
- Keep Monaco fold-range resolution centralized in [`src/renderer/editor/monacoFolding.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/editor/monacoFolding.ts) plus [`src/renderer/output/structuralSplitSelection.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts). Do not add DOM-text or indentation-only range inference.
- Keep derived panes as filtered views over the shared root Monaco model through [`src/renderer/output/outputViewRange.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/outputViewRange.ts). Do not fork derived Monaco models just to support recursion.
- Keep per-pane Monaco state isolated by pane instance identity. Off-screen panes must preserve fold/search/view state when the viewport moves away and back.
- Keep active-pane routing through controller-managed output-editor handles instead of querying DOM state ad hoc.
- Prefer a focused viewport hook or controller seam for scroll measurement, smooth scrolling, wheel-thresholding, and focus handoff. Do not push DOM scroll orchestration into unrelated layout components.
- Use actual scroll position for the pane strip. Do not fake viewport movement with CSS transforms, opacity swaps, or remount/reorder tricks.
- Let Monaco consume keys first when appropriate. Global split shortcuts that can conflict with Monaco, especially `Escape`, must bail out when `event.defaultPrevented` is already true.

## 4. Deliverables

### Architecture decisions

- Extend the stage-one split architecture instead of replacing it.
- Keep the existing parent-child chain model and make it the single source of truth for recursive split content.
- Add explicit viewport state for the pane strip. Preferred shape:
  - content chain state remains separate from viewport state,
  - viewport state is pane-index-based, not pixel-based,
  - store the left visible pane index for the two-pane viewport,
  - derive scroll targets from `leftVisiblePaneIndex * paneWidth`.
- Keep content and viewport concerns separate:
  - chain mutations decide which panes exist,
  - viewport state decides which adjacent pair is currently framed,
  - smooth scrolling is only the rendering mechanism for that viewport state.
- Extend [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts) so it owns:
  - recursive child open/replace behavior,
  - descendant truncation,
  - rightmost-pop behavior,
  - active-pane tracking,
  - viewport start-index state,
  - toolbar/button/shortcut navigation callbacks,
  - focus target decisions after split navigation.
- Add focused pure helpers for viewport math, either in [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts) or a dedicated sibling domain module. Required helpers include:
  - clamp viewport start index,
  - compute the viewport start index that should show a pane and its direct child,
  - compute next viewport start index for left/right moves,
  - compute enable/disable rules for left/right navigation actions.
- Extend [`src/renderer/output/structuralSplitSelection.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts) so selection can be constrained by pane context:
  - root pane may resolve any foldable block,
  - derived pane may resolve only foldable blocks strictly inside its own `viewRange`,
  - if the best resolved range equals the pane's `viewRange`, return no selection.
- Extend [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) so every output pane can:
  - register split selection,
  - expose programmatic focus in its handle,
  - preserve pane-local view state when off-screen,
  - keep source highlight behavior unchanged.
- Keep all panes mounted in [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx). Do not unmount off-screen panes just because the viewport moved.
- Add a focused scroll/gesture seam for the pane strip. Preferred responsibilities:
  - measure viewport width,
  - derive pane width,
  - hide the native scrollbar UI,
  - smooth-scroll to the controlled pane-start index,
  - intercept split-modifier wheel/gesture input,
  - leave normal Monaco/editor scrolling untouched.

### Interaction decisions

- Recursive `Ctrl+click` behavior:
  - enabled on the root pane and all derived panes,
  - resolves the smallest enclosing Monaco foldable block for the clicked line,
  - if no foldable block exists, do nothing,
  - if the resolved block equals the pane's full visible range, do nothing,
  - if the resolved block matches the existing child selection exactly, keep that child and only truncate descendants to the right if any exist.
- Parent-child update rule:
  - `Ctrl+click` affects only the clicked pane's direct child,
  - descendants to the right are discarded,
  - ancestors to the left remain untouched.
- Viewport targeting on split selection:
  - after opening/replacing a child, animate the viewport to the parent-child pair for that interaction,
  - examples:
    - `A` -> open `B` -> show `A | B`
    - `A B` and split `B` -> show `B | C`
    - `A B C D` and split `B` -> truncate to `A B C` and show `B | C`
- Viewport navigation rules:
  - the viewport steps exactly one pane at a time,
  - left navigation decrements the left visible pane index by `1`,
  - right navigation increments it by `1`,
  - clamp to the legal range `0 .. paneCount - 2`,
  - if fewer than three panes exist, left/right navigation is disabled because there is no alternate snapped position.
- Toolbar split controls:
  - replace the standalone stage-one split button with a compact `Splits` toolbar group,
  - group contents are:
    - static text label `Splits`,
    - pop-rightmost-split button,
    - viewport-left button,
    - viewport-right button.
- Close action rules:
  - pop button and `Escape` always remove the rightmost derived pane,
  - after pop, animate the viewport so the new rightmost visible pair is shown,
  - if no derived pane exists, pop is disabled and `Escape` is a no-op.
- Keyboard shortcut rules:
  - keep existing pane-mode/save/copy/find shortcuts unchanged,
  - add literal `Ctrl+Left` and `Ctrl+Right` for pane-strip navigation in output mode,
  - add `Escape` for split pop in output mode only,
  - `Escape` must run only when Monaco and other focused widgets did not already consume the event.
- Wheel/trackpad split navigation rules:
  - the pane strip must react only when the literal split modifier (`Ctrl`) is held,
  - with that modifier held, convert wheel/trackpad movement into pane-step navigation instead of raw pixel scrolling,
  - prefer horizontal delta when present,
  - use vertical delta as a fallback so a standard mouse wheel can still navigate splits,
  - threshold accumulated delta so one small twitch does not accidentally change panes,
  - allow larger sustained gestures to traverse multiple pane steps through repeated threshold crossings,
  - prevent default browser/editor zoom or scroll behavior for those intercepted modified gestures.
- Focus rules after navigation:
  - navigation right makes the new right-side pane active and focused,
  - navigation left makes the new left-side pane active and focused,
  - pop focuses the new rightmost visible pane,
  - split-open focuses the new child pane,
  - click focus inside a pane still retargets active-pane routing normally afterward.
- Toolbar routing rules remain:
  - `Expand`, `Collapse`, and find target the active visible pane,
  - `Save` and `Copy` remain rooted to the full root output text.

### Design decisions

- Pane geometry:
  - unsplit state uses one full-width pane,
  - split state uses equal-width panes at `50%` of the visible output viewport,
  - every pane in a split chain uses that same width,
  - the pane strip viewport therefore shows two panes at a time in split mode.
- Pane-strip scrolling:
  - keep a real horizontal scroll container,
  - hide the native scrollbar UI cross-browser,
  - switch scroll snapping from loose/proximity behavior to strict whole-pane snapping,
  - app-driven scrolls must be smooth and short, not instant.
- Animation rules:
  - use actual scroll-position animation, not fake transforms,
  - keep timing configurable by a small local constant so tuning does not require wide refactors,
  - target a fast, native-feeling motion rather than theatrical motion.
- Pane chrome:
  - no pane header,
  - no index chip,
  - no breadcrumb,
  - no special border treatment beyond the existing separator line between panes.
- Split toolbar group:
  - keep the existing toolbar visual language,
  - group belongs immediately after the fallback control,
  - static `Splits` label is non-interactive,
  - buttons use the shared `.btn` contract and normal disabled-state treatment,
  - use clear directional icons so pop/left/right read distinctly at a glance.

### State-model decisions

- Do not regress to special-case `secondaryPane*` fields.
- Keep derived panes as an ordered parent-child chain from the root model.
- Add explicit viewport state. Minimum state requirements:
  - `activePaneId`,
  - ordered `derivedPanes`,
  - `nextDerivedPaneViewStateId`,
  - `leftVisiblePaneIndex` for split-mode viewport framing.
- Keep `leftVisiblePaneIndex` deterministic and controller-owned.
- Do not make raw `scrollLeft` the primary source of truth for pane navigation.
- Keep all pane instances stable across viewport moves. Scrolling the strip must not regenerate pane ids or view-state keys.
- Each pane continues owning the highlight that points to its direct child.
- Off-screen panes remain part of state and rendering so returning to them preserves fold/search/view state.

### Component decisions

- [`src/renderer/components/EditorShell.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx) continues rendering the pane strip in output mode, but now the strip must support recursive panes and navigation callbacks.
- [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) should:
  - render every pane in order,
  - apply the fixed split-mode pane width,
  - hide the native scrollbar UI,
  - own the scroll container ref,
  - animate to the controlled viewport target,
  - intercept split-modifier wheel/gesture input only,
  - preserve ordinary editor interactions otherwise.
- [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) should:
  - accept split selection on derived panes too,
  - receive pane context needed to reject same-range child creation,
  - expose `focus` or equivalent on its imperative handle,
  - continue exposing collapse/expand/find methods.
- [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx) should receive:
  - whether split pop is enabled,
  - whether left navigation is enabled,
  - whether right navigation is enabled,
  - callbacks for pop/left/right.
- [`src/renderer/app/useKeyboardShortcuts.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useKeyboardShortcuts.ts) should receive split navigation callbacks and gate them to output mode.
- [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts) remains the orchestration seam for output-pane behavior and should not leak these transitions into `App.tsx`.

### Tests decisions

- Extend pure domain coverage for recursive pane behavior in [`tests/unit/renderer/app/outputPaneDomain.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/outputPaneDomain.test.ts):
  - open child from root,
  - open grandchild from derived pane,
  - reselect upstream pane and truncate descendants,
  - identical reselection trims descendants without remounting the identical child,
  - viewport start index math for open/pop/left/right.
- Extend [`tests/unit/renderer/output/structuralSplitSelection.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/structuralSplitSelection.test.ts):
  - derived-pane selection returns nested child blocks,
  - derived-pane selection rejects a block equal to the pane's own full range,
  - lines with no deeper nested foldable block remain a no-op.
- Extend [`tests/unit/renderer/components/OutputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputEditor.test.tsx):
  - split-selection registration exists on derived panes in this scope,
  - derived-pane selection no-ops when selection equals pane range,
  - imperative focus handle is exposed,
  - off-screen/mounted pane updates do not lose view-state keys.
- Extend [`tests/unit/renderer/components/OutputPaneStrip.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputPaneStrip.test.tsx):
  - multi-pane strip keeps all panes mounted,
  - split mode keeps each pane at `50%` basis,
  - viewport target index controls scroll target,
  - scrollbar-hiding class/attributes are present,
  - left/right enablement can be derived from pane count and viewport index.
- Extend [`tests/unit/renderer/components/Toolbar.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/Toolbar.test.tsx):
  - `Splits` group renders after the fallback control,
  - pop/left/right buttons enable/disable correctly,
  - pop callback remains distinct from left/right navigation callbacks.
- Extend [`tests/unit/renderer/app/useKeyboardShortcuts.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useKeyboardShortcuts.test.ts):
  - `Ctrl+Left` and `Ctrl+Right` route to split navigation only in output mode,
  - `Escape` pops only in output mode with an open split chain,
  - default-prevented `Escape` does not pop.
- Extend [`tests/unit/renderer/app/useAppController.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useAppController.test.ts) and/or [`tests/unit/renderer/app/useOutputPaneController.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useOutputPaneController.test.ts) if a new focused hook is added:
  - split-open retargets active pane and viewport,
  - left/right navigation retargets active pane,
  - pop retargets active pane and viewport,
  - output invalidation clears chain and viewport state.
- Extend Electron E2E coverage, likely in [`tests/e2e/output-split-pane.spec.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/e2e/output-split-pane.spec.ts):
  - `Ctrl+click` on `A` opens `B`,
  - `Ctrl+click` on `B` opens `C` and viewport lands on `B | C`,
  - `Ctrl+click` on `C` opens `D` and viewport lands on `C | D`,
  - upstream reselection truncates descendants,
  - pop button closes the rightmost pane,
  - `Escape` closes the rightmost pane when Monaco did not consume it,
  - `Ctrl+Left` / `Ctrl+Right` move by exactly one pane,
  - off-screen panes remain mounted and preserve their highlights/fold states when navigated back to.
- Do not make animation tests brittle:
  - assert final snapped positions and active-pane outcomes,
  - do not assert exact frame timing or per-frame pixel values.

### Documentation decisions

- This spec supersedes the stage-one behavior described in [`docs/specs/0016-output-structural-split-pane-stage-one.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0016-output-structural-split-pane-stage-one.md) for future implementation work.
- When implementation lands, update:
  - [`docs/ui-spec.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/ui-spec.md)
  - [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
  - [`docs/design-style.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/design-style.md)
  - [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)
- Those implementation-time updates must describe:
  - recursive pane creation,
  - hidden-scrollbar pane-strip behavior,
  - split toolbar group,
  - `Escape` / `Ctrl+Left` / `Ctrl+Right` / `Ctrl+Wheel` routing,
  - focus-following viewport navigation.

### Code-quality decisions

- Do not compute derived-pane selections from visible text, DOM text, or copied editor output.
- Do not allow the pane strip to steal ordinary non-modified wheel/scroll behavior from Monaco editors.
- Do not show a second visible scrollbar under Monaco editors for pane-strip navigation.
- Do not animate viewport changes by remounting panes or mutating pane order.
- Do not make split navigation pixel-based or free-pan by default; snapped pane-step movement is required.
- Do not use raw `scrollLeft` drift as the behavioral source of truth; keep pane-step state explicit.
- Do not let recursive pane growth change the semantic meaning of `Save` / `Copy`.
- Do not let `Escape` pop splits when a focused Monaco/widget interaction already consumed the key.

## 5. Acceptance Criteria

- [ ] In output mode, `Ctrl+click` on root pane `A` opens child pane `B`.
- [ ] In output mode, `Ctrl+click` on derived pane `B` opens child pane `C` when a deeper foldable block exists.
- [ ] Recursive splitting can continue pane-by-pane until no deeper nested foldable block exists.
- [ ] `Ctrl+click` on a line with no foldable block is a no-op.
- [ ] `Ctrl+click` on a block equal to the current pane's full visible range is a no-op.
- [ ] Opening/replacing a child truncates all descendants to its right and keeps ancestors to its left.
- [ ] The full pane chain remains mounted even when parts of it are outside the viewport.
- [ ] With one pane, the output viewport shows one full-width pane.
- [ ] With at least one derived pane, every pane uses `50%` of the visible output viewport width.
- [ ] Adding panes after the first split does not shrink existing panes below that split width.
- [ ] The pane-strip viewport snaps to whole-pane positions only.
- [ ] Split-open, split-pop, left-nav, and right-nav all animate the viewport instead of jumping instantly.
- [ ] After opening a child from pane `X`, the viewport lands on `X | child`.
- [ ] After popping the rightmost derived pane, the viewport lands on the new rightmost visible pair.
- [ ] The pane-strip scrollbar UI is hidden.
- [ ] Pane-local Monaco scroll behavior still works normally when the split modifier is not held.
- [ ] `Ctrl+Left` and `Ctrl+Right` move the viewport exactly one pane per invocation.
- [ ] `Ctrl+Wheel` / `Ctrl+trackpad scroll` can navigate the pane strip by pane steps without exposing a visible outer scrollbar.
- [ ] `Escape` pops the rightmost derived pane only when output mode is active, a derived pane exists, and Monaco did not already consume the key event.
- [ ] Active-pane routing follows viewport navigation so `Expand`, `Collapse`, and find target the pane that navigation moved focus to.
- [ ] Split-open focuses the new child pane.
- [ ] Pop focuses the new rightmost visible pane.
- [ ] `Save` and `Copy` still operate on the full root output text.
- [ ] Off-screen panes preserve their pane-local fold/view state when navigated away from and back to.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## 6. File Summary

- New spec:
  - [`docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md)
- Expected implementation files to modify:
  - [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
  - [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts)
  - [`src/renderer/app/useKeyboardShortcuts.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useKeyboardShortcuts.ts)
  - [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx)
  - [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx)
  - [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
  - [`src/renderer/output/structuralSplitSelection.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/output/structuralSplitSelection.ts)
  - [`src/renderer/styles/tailwind.css`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/styles/tailwind.css)
- Expected test files to modify:
  - [`tests/unit/renderer/app/outputPaneDomain.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/outputPaneDomain.test.ts)
  - [`tests/unit/renderer/app/useKeyboardShortcuts.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/app/useKeyboardShortcuts.test.ts)
  - [`tests/unit/renderer/components/Toolbar.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/Toolbar.test.tsx)
  - [`tests/unit/renderer/components/OutputPaneStrip.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputPaneStrip.test.tsx)
  - [`tests/unit/renderer/components/OutputEditor.test.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/components/OutputEditor.test.tsx)
  - [`tests/unit/renderer/output/structuralSplitSelection.test.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/renderer/output/structuralSplitSelection.test.ts)
  - [`tests/e2e/output-split-pane.spec.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/tests/e2e/output-split-pane.spec.ts)

## 7. Open Questions / Resolved Decisions

- Resolved: keep the existing literal `Ctrl+click` semantics exactly as the current split feature already uses.
- Resolved: pane navigation is whole-pane snapped, not free-panning.
- Resolved: pane navigation must animate actual scroll position.
- Resolved: the outer pane-strip scrollbar UI stays hidden.
- Resolved: the split system reacts only to explicit `Ctrl+...` split gestures, leaving normal editor scrolling alone.
- Resolved: `Escape` pops the rightmost derived pane, not the leftmost visible pane.
- Resolved: focus follows viewport navigation and pop/open actions.
- Resolved: panes stay visually bare in this scope.
- Open questions: none for this scope. If implementation exposes animation or gesture edge cases that the current rules do not cover, they should be resolved before coding rather than improvised during implementation.
