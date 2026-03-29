# 0019 Renderer Document Session And Pane Runtime Boundaries

Reference note: any code shapes, constants, hook names, or type names in this spec are intent-only. They clarify the target architecture; they are not copy-paste implementation source.

## Working Rule

Every change in this scope must be measured with one question:

`Does this reduce the number of places you must read to explain one behavior?`

That rule is the primary acceptance lens for this work.

- A change is good when one behavior has one primary owner and, at most, one focused runtime adapter.
- A change is bad when it moves code around but leaves the same behavior spread across controller, component, store, refs, and Monaco runtime helpers.
- A change is bad when it adds another source of truth for renderer-visible state.
- A change is bad when it duplicates a state transition in two modules just to make one slice easier.
- A change is out of scope if it adds new user-visible behavior. This spec is refactor-only.

Review rule for every slice:

- Name the behavior being changed.
- Name its primary owner module.
- Name the single runtime adapter, if one exists.
- If explaining the behavior still requires reading more files than before, the slice is not done.

Examples of the target standard:

- `open/drop/paste ingest`
  - primary owner: `documentSessionDomain`
  - runtime adapter: `usePrettifierRuntime`
- `fallback confirmation / agent selection / cancel`
  - primary owner: `documentSessionDomain`
  - runtime adapter: `useFallbackModalRuntime`
- `open child pane / replace child / pop split / viewport step`
  - primary owner: `outputPaneDomain`
  - runtime adapter: `useOutputPaneViewportRuntime`
- `output editor model lifecycle / hidden areas / fold controls`
  - primary owner: `useOutputEditorRuntime`
  - runtime adapter: Monaco itself

## 1. Current State

- Renderer modularity is weaker than the top-level repo structure suggests.
- The project already has good process boundaries across `main`, `preload`, `shared`, and `renderer`.
- The main structural risk is inside the renderer, exactly where the current analysis called it out:
  - [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)
  - [`src/renderer/app/usePrettifierFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts)
  - [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
- Renderer-visible state is fragmented across:
  - [`src/renderer/state/uiStore.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/state/uiStore.ts)
  - hook-local `useState`
  - mutable refs
  - preference-local state in [`src/renderer/app/usePreferencesFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePreferencesFlow.ts)
  - Monaco-owned runtime state
- The pane platform is partially landed:
  - [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts) is already a solid pure domain seam
  - current split-pane controls and current split-pane behavior must be preserved
  - split-pane logic stays in the codebase for future reuse
  - this spec does not implement new split-pane behavior
  - but viewport movement, focus timing, wheel handling, editor-handle registration, and Monaco lifecycle are still spread across controller hooks and components
- Current implementation violates the behavior-explanation rule in several places:
  - to explain `switch to output`, you currently need to read controller, store, prettifier flow, and preference flow
  - to explain `navigate split viewport`, you currently need to read pane controller, pane strip, keyboard shortcuts, and mouse shortcuts
  - to explain `collapse active output pane`, you currently need to read app controller, pane handle registry logic, and output-editor special-case view-range behavior
- [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) currently owns too much runtime behavior:
  - transform-driven viewport motion
  - resize handling
  - wheel thresholding
  - focus-after-animation timing
  - pane handle registry
- [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) currently owns too much runtime behavior:
  - model reference lifetime
  - view-state restore/save
  - hidden-area sync
  - fold action behavior for filtered panes
  - focus queueing
  - inline fold control registration
- Current pane runtime concerns are mixed together regardless of whether future pane features are expanded later.

## 2. Desired End State

- The renderer has one window-local source of truth for renderer-visible document session state.
- Every important behavior has one obvious home.
- `App.tsx` remains composition-only.
- `useAppController` becomes a thin composition/controller seam, not the place where behavior is invented.
- Components render view state and forward UI events. They do not own business rules, pane mutation rules, or async workflow state machines.
- Current split-pane UI controls and current split-pane behavior remain intact.
- No new pane behavior is added in this scope.
- Split-pane logic remains available for future reuse behind clearer ownership boundaries.

Behavior ownership in the desired end state:

- `document session state`
  - primary owner: `documentSessionDomain`
  - responsibilities:
    - input text
    - pane mode
    - ingest notice
    - current preferences as seen by the renderer
    - root output text
    - output formatting state
    - fallback modal state
    - fallback wait state
    - pane chain state
- `prettifier and fallback runtime`
  - primary owner: `usePrettifierRuntime`
  - responsibilities:
    - local prettifier execution
    - IPC fallback execution
    - cancel
    - progress subscription
    - dispatching domain actions
- `preferences runtime`
  - primary owner: `usePreferencesRuntime`
  - responsibilities:
    - hydration
    - optimistic persistence
    - rollback on failure
    - dispatching domain actions
- `pane chain rules`
  - primary owner: `outputPaneDomain`
  - responsibilities:
    - open/replace child
    - invalidate descendants
    - pop rightmost pane
    - active pane updates
    - viewport index math
- `pane viewport runtime`
  - primary owner: `useOutputPaneViewportRuntime`
  - responsibilities:
    - actual scroll container measurement
    - scroll target alignment
    - wheel thresholding
    - focus-after-scroll timing
    - leaving normal editor scrolling alone
- `Monaco output runtime`
  - primary owner: `useOutputEditorRuntime`
  - responsibilities:
    - model retain/release
    - view-state cache integration
    - hidden-area application
    - fold-control registration
    - editor imperative handle behavior

Expected result of that ownership model:

- To explain ingest behavior, a reader only needs the document-session domain and the prettifier runtime.
- To explain split navigation, a reader only needs the output-pane domain and the pane-viewport runtime.
- To explain output-editor behavior, a reader only needs the output-editor runtime and Monaco helpers.
- No behavior should require reading controller + view component + store + unrelated hook just to find the real state transition.

## 3. Patterns To Follow

- Keep [`src/renderer/App.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/App.tsx) composition-only.
- Keep `src/shared` pure and cross-process.
- Keep renderer free of direct Electron and Node APIs.
- Follow the existing pure-domain style already present in [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts).
- Keep explicit request-id and stale-response guards in async renderer flows.
- Keep content state and viewport state separate.
- Keep active-pane routing through named runtime seams. Do not query DOM state ad hoc.
- Prefer selectors over duplicated derived booleans in multiple modules.
- Prefer reducers/domain transitions over ad hoc scattered setter calls when a behavior spans more than one field.
- Do not add a new state library for this work.
- Do not keep `uiStore` and `DocumentSessionState` as long-lived parallel truth.
- Preserve current split-pane controls and current split-pane behavior.
- Do not add recursive panes, new split gestures, new toolbar semantics, or any other new pane behavior in this scope.
- If a slice reveals ambiguity, stop and ask before continuing. Do not guess architecture inside implementation.

## 4. Deliverables

### Architecture decisions

- Add a renderer window-local `DocumentSessionState` domain as the single source of truth for renderer-visible state.
- Place the new session domain under `src/renderer/app/session/` so the boundary is explicit and future session-related modules stay co-located.
- Keep pure state transitions separate from runtime hooks.
- `useAppController` must only:
  - compose runtime hooks
  - expose view-model data
  - adapt imperative UI callbacks
  - avoid owning business rules directly
- Retire [`src/renderer/state/uiStore.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/state/uiStore.ts) as a source of truth in this scope.
- Keep `outputPaneDomain.ts` as the canonical owner of pane-chain rules and expand it only where that keeps pane behavior more centralized, not less.
- Keep existing split-pane logic and controls. Reorganize them; do not delete them.
- Create dedicated runtime seams rather than hiding more logic inside components.

### Data model decisions

- `DocumentSessionState` must own renderer-visible state in grouped subtrees.
- Preferred shape:
  - `preferences`
    - `themeMode`
    - `indentSize`
    - `fallbackAgentId`
    - `fallbackAgentOptions`
    - `fallbackWarningLineThreshold`
  - `editor`
    - `paneMode`
    - `inputText`
    - `ingestNotice`
  - `output`
    - `rootText`
    - `formatting`
    - `fallbackWaitState`
    - `fallbackModalState`
    - `paneChain`
- Do not keep derived values such as `hasContent`, `isOutputMode`, `visibleOutputPanePosition`, or `hasDerivedOutputPane` in state. Expose them through selectors.
- Keep request ids, cancellation refs, editor handles, and Monaco instances out of `DocumentSessionState`. Those are runtime-only concerns.
- Keep one formatting source of truth for output:
  - whether current root output is prettified
  - what indent size that output currently reflects
  - what input it was last derived from
- Keep pane-chain state as a nested domain value, not as loose top-level booleans or ad hoc arrays.

### Runtime seam decisions

- Add `usePreferencesRuntime` to replace preference-local state ownership in [`src/renderer/app/usePreferencesFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePreferencesFlow.ts).
- Add `usePrettifierRuntime` to replace the current mixed state/runtime role of [`src/renderer/app/usePrettifierFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts).
- Add `useFallbackModalRuntime` for promise resolver refs and modal settlement. Modal visibility and prompt kind must remain in `DocumentSessionState`.
- Add `useOutputPaneEditorRegistry` for imperative output-editor handle ownership and active-pane lookup.
- Add `useOutputPaneViewportRuntime` for scroll container behavior, wheel thresholds, and focus alignment after viewport changes.
- Add `useOutputEditorRuntime` for Monaco-specific output editor lifecycle and imperative handle behavior.
- Runtime seams may use refs. Domain modules may not.

### Component decisions

- [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx) stays view-only.
- [`src/renderer/components/EditorShell.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx) may still own shell-level DOM ingest events, but not session business rules.
- [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx) must stop owning pane navigation policy and transform-based viewport state.
- [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx) must stop being the place where Monaco lifecycle decisions are spread across effects.
- Components may call a dedicated runtime hook, but the behavior must then live in that hook/module, not inline across multiple `useEffect` blocks in the component.

### Delivery slice decisions

Each slice below is intentionally small, fully tested, and must not break current behavior. No slice is allowed to widen the number of files needed to explain a behavior.

#### Slice 1: Introduce document session state and selectors

- Add:
  - `src/renderer/app/session/documentSessionDomain.ts`
  - `src/renderer/app/session/documentSessionSelectors.ts`
  - `src/renderer/app/session/useDocumentSession.ts`
- Move into `DocumentSessionState`:
  - `paneMode`
  - `themeMode`
  - `indentSize`
  - `inputText`
  - `ingestNotice`
- Remove `uiStore` from the active renderer path in this same slice.
- Keep public behavior unchanged.
- Keep `useAppController` return shape unchanged unless a mechanical rename clearly improves readability and all consumers/tests are updated in the same slice.
- Required tests:
  - unit tests for the new session domain and selectors
  - updated `useAppController` tests
  - removal or replacement of `uiStore` tests
- No E2E is required if behavior remains unchanged.

#### Slice 2: Move preferences into the document session runtime

- Replace preference-local state ownership in [`src/renderer/app/usePreferencesFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePreferencesFlow.ts) with dispatches into `DocumentSessionState`.
- `fallbackAgentId`, `fallbackAgentOptions`, and `fallbackWarningLineThreshold` must live in session state after this slice.
- Keep optimistic persistence and rollback behavior unchanged.
- Required tests:
  - unit tests for preference hydration and persistence dispatch behavior
  - updated `useAppController` tests
- No E2E is required if behavior remains unchanged.

#### Slice 3: Move prettifier and fallback state transitions into domain + runtime seams

- Extract pure decision helpers from the current [`src/renderer/app/usePrettifierFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts) logic into domain modules under `src/renderer/app/session/` or a tightly related `src/renderer/app/prettifier/` seam.
- Move into session state:
  - root output text
  - output formatting state
  - fallback wait state
  - fallback modal state
  - last-prettified input tracking
- Keep IPC, cancel, and progress subscription in `usePrettifierRuntime`.
- Keep modal resolver refs in `useFallbackModalRuntime`.
- Required tests:
  - new pure domain tests for local success, passthrough, fallback prompt selection, cancel, reset, and reindent behavior
  - updated runtime-hook tests for IPC and progress behavior
  - updated `useAppController` tests
- No E2E is required if behavior remains unchanged.

#### Slice 4: Move pane-chain state under the document session and shrink the pane controller

- Move pane-chain ownership into `DocumentSessionState`.
- Reduce [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts) so it no longer owns application state directly.
- Keep pane-chain mutation rules in [`src/renderer/app/outputPaneDomain.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts).
- Keep imperative output-editor handle ownership in a dedicated runtime seam, not in the pure domain.
- Required tests:
  - updated output-pane domain tests
  - updated pane-runtime/controller tests
  - updated app-controller tests for active-pane routing
- No E2E is required if behavior remains unchanged.

#### Slice 5: Extract pane viewport runtime without changing split-pane behavior

- Add `useOutputPaneViewportRuntime`.
- Move out of [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx):
  - viewport measurement
  - scroll target math based on pane width
  - wheel thresholding
  - focus-after-viewport-settle timing
  - movement coordination
- Keep current split-pane behavior functionally unchanged in this slice.
- Keep the current movement mechanism unless changing it is strictly necessary to improve ownership and can be done without changing behavior. This spec does not require an actual-scroll rewrite.
- Required tests:
  - new viewport-runtime unit tests
  - updated `OutputPaneStrip` tests
  - updated keyboard/mouse navigation tests if callback timing changes
- Run `pnpm test:e2e` only if this slice changes visible behavior.

#### Slice 6: Extract Monaco output-editor runtime

- Add `useOutputEditorRuntime`.
- Move out of [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx):
  - model retain/release
  - view-state restore/save coordination
  - hidden-area application lifecycle
  - focus queueing
  - inline fold-control registration
  - range-aware collapse/expand behavior
- Keep public `OutputEditorHandle` behavior unchanged.
- Required tests:
  - new output-editor-runtime unit tests
  - updated `OutputEditor` tests
  - updated Monaco runtime helper tests where ownership shifts
- Run `pnpm test:e2e` only if this slice changes visible behavior.

### Tests decisions

- Every new renderer module added in this scope must have a unit test file.
- Every slice must keep existing relevant tests green while preserving current behavior.
- Required gate for every slice: `pnpm check`.
- Required gate for slices that change visible Electron/runtime behavior: `pnpm test:e2e`.
- Do not defer test migration to a later slice. If ownership moves in a slice, tests move in that slice too.
- Tests must verify ownership-sensitive behavior, not only final visible output.
- Add explicit tests for the behavior-explanation rule where possible by testing pure domains directly instead of only through top-level hooks.

### Code quality decisions

- Reject any slice that increases the size or branching density of `useAppController`.
- Reject any slice that introduces a second long-lived truth for the same renderer-visible field.
- Reject any slice that pushes more control logic down into `OutputPaneStrip` or `OutputEditor`.
- Reject any slice that moves pane or fallback rules into generic utility modules where ownership becomes harder to infer.
- Reject any slice that makes behavior explanation depend on reading both a domain module and a duplicated fallback path elsewhere.
- Prefer named actions and selectors over free-form setter calls across multiple modules.
- Keep functions small and explicit.
- Add concise comments only where async invariants or ownership boundaries are not obvious.

### Documentation decisions

- [`0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md) is retained as a historical/future reference only. It is not an implementation target in this scope.
- This spec is refactor-only.
- This spec is the architecture source of truth for reorganizing renderer ownership while preserving current behavior, including current split-pane controls and current split-pane behavior.
- Update these docs in the implementation slices that change their subject matter:
  - [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
  - [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)
- Keep docs current slice by slice. Do not wait for the full program to finish before documenting new ownership boundaries.

## 5. Acceptance Criteria

- [ ] The working rule appears in the implementation plan and is explicitly checked in every slice review:
  - `Does this reduce the number of places you must read to explain one behavior?`
- [ ] This scope adds no new user-visible behavior.
- [ ] Renderer-visible document state has one source of truth after Slice 1 and does not regress into parallel ownership later.
- [ ] `useAppController` is a thin composition/controller seam and no longer owns fallback modal resolution logic, prettifier decision branches, pane mutation rules, or viewport timing logic.
- [ ] `OutputPaneStrip` no longer owns transform-based viewport state or pane navigation policy.
- [ ] `OutputEditor` no longer owns spread-out Monaco lifecycle decisions inline across multiple unrelated effects.
- [ ] Pane-chain rules remain centralized in `outputPaneDomain`.
- [ ] Preference hydration/persistence, prettifier/fallback runtime, pane viewport runtime, and Monaco output runtime each have a clearly named owner module.
- [ ] All slices preserve current user-visible behavior, including current split-pane controls and current split-pane behavior.
- [ ] Every new renderer module/component added in this scope has a unit test file.
- [ ] `pnpm check` passes in every slice.
- [ ] `pnpm test:e2e` passes for every slice that changes visible Electron/runtime behavior.
- [ ] No slice is considered done while the answer to the working-rule question is still “no”.

## 6. File Summary

Expected new files:

- `src/renderer/app/session/documentSessionDomain.ts`
- `src/renderer/app/session/documentSessionSelectors.ts`
- `src/renderer/app/session/useDocumentSession.ts`
- `src/renderer/app/session/usePreferencesRuntime.ts`
- `src/renderer/app/session/usePrettifierRuntime.ts`
- `src/renderer/app/session/useFallbackModalRuntime.ts`
- `src/renderer/app/output/useOutputPaneEditorRegistry.ts`
- `src/renderer/app/output/useOutputPaneViewportRuntime.ts`
- `src/renderer/output/useOutputEditorRuntime.ts`
- corresponding unit test files under `tests/unit/renderer/...`

Expected heavily modified files:

- [`src/renderer/app/useAppController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useAppController.ts)
- [`src/renderer/app/usePrettifierFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePrettifierFlow.ts) or its replacement
- [`src/renderer/app/usePreferencesFlow.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/usePreferencesFlow.ts) or its replacement
- [`src/renderer/app/useOutputPaneController.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts)
- [`src/renderer/components/OutputPaneStrip.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputPaneStrip.tsx)
- [`src/renderer/components/OutputEditor.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/OutputEditor.tsx)
- [`src/renderer/components/EditorShell.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/EditorShell.tsx)
- [`src/renderer/components/Toolbar.tsx`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/Toolbar.tsx)
- [`docs/architecture.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/architecture.md)
- [`docs/learnings.md`](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)

Expected removed file:

- [`src/renderer/state/uiStore.ts`](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/state/uiStore.ts)
  - remove only after Slice 1 fully migrates its owned state

## 7. Open Questions / Resolved Decisions

### Resolved decisions

- No new state library will be introduced.
- `uiStore` will be retired rather than wrapped.
- `0017` is not an implementation target for this work.
- This spec is refactor-only.
- Current split-pane controls and current split-pane behavior stay in place.
- Split-pane logic stays in the codebase and is reorganized, not removed.
- This spec governs renderer modularization only.
- The working-rule question is a mandatory review criterion, not a suggestion.

### Open questions

- None at spec-writing time.
- If implementation reveals a real ambiguity about ownership or slice boundaries, stop and ask before proceeding.
