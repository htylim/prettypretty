# Learnings

These are the durable patterns worth keeping in mind when changing the codebase.

## Architecture

- Keep the `main` / `preload` / `shared` / `renderer` boundaries clean.
- Put IPC contracts and shared types in `src/shared`.
- Keep `src/shared` free of React, Electron runtime ownership, and Node-only behavior.

## Renderer

- Keep `App.tsx` composition-only.
- Keep one window-local document session as the source of truth for renderer-visible state.
- Put orchestration in focused controller hooks, not in view components.
- Be explicit about request ids, cancellation, and stale-response guards in async renderer flows.
- Avoid spreading the same state transition logic across multiple handlers.
- Measure renderer refactors with one question: does this reduce the number of places you must read to explain one behavior?
- Split pure decision logic from runtime hooks that own IPC, DOM timing, or imperative handles.
- Keep view components as thin render/adapter seams when a behavior needs DOM or Monaco runtime bookkeeping.
- Do not keep separate renderer "domain" modules that only hold inert view-model types. If the behavior owner is a controller hook, keep the small state shape there.

## Monaco

- Use shared Monaco runtime helpers instead of duplicating setup logic.
- Keep input/output editor options aligned unless there is a documented reason not to.
- Treat Monaco integration as a real subsystem; changes there usually affect focus, view state, folding, and tests together.
- Keep Monaco runtime ownership in focused runtime seams, not spread across view components and controller hooks.
- Reject obviously oversized ingest payloads before they touch session state. Once Monaco-backed state mutates, "pretend nothing happened" recovery gets harder and leakier.
- Keep Monaco ingest metrics and readable-prefix recovery on one shared scanner so newline handling and limit boundaries cannot drift between rejection and recovery paths.
- Keep viewport movement/focus timing and editor lifecycle/folding as separate seams; they change for different reasons and should not be explained from one giant component.
- Custom overlay menus need explicit backdrop `contextmenu` dismissal. Left-click-only close handling leaves stale overlays over Monaco surfaces.
- If a pane shows rebased source excerpts instead of a full shared model, treat line-number presentation as explicit pane metadata. Do not fake source-linked numbering with ad hoc DOM patches.
- Fold-driven pane extraction needs its own pane-content kind. Reusing viewport-only source-range panes for copied excerpts mixes identity, rendering, and replacement semantics.
- Keep related icon glyphs defined through one shared pattern inside a module. Mixing ad hoc SVG literals with partial constants makes visual regressions harder to review.

## Preferences and IPC

- Main owns persisted preferences.
- Renderer should use optimistic updates only with proper sequencing and rollback rules.
- Validate IPC payloads at the main-process boundary, including primitive string payloads.
- For startup file-open flows, keep the file payload window-scoped in main and let each renderer consume it once over preload IPC. Main-process push events race the renderer mount path too easily.
- Do not block initial `root.render(...)` on preload IPC. Mount first, then resolve startup payloads from a focused bootstrap seam so IPC failures degrade to an empty window instead of a blank renderer.
- If main accepts second-instance launches before startup wiring is ready, queue them explicitly. Relying on late-assigned callbacks drops early no-arg launches.

## Prettifier and Fallback

- Run the local parser first.
- Execute fallback agents only in the main process.
- Enforce timeout, output-size limits, and process cleanup for fallback runs.
- Correlate fallback progress and completion by request id.
- Explicit fallback cancel should resolve the active prettify request to passthrough output; only stale/reset interruption should discard the response entirely.
- For pane-targeted prettify flows, only enable the action for semantic string scalars that can be decoded to a concrete string value. If decoding is ambiguous or would no-op, keep the action disabled.
- Keep pane-targeted prettify orchestration shared with root-output prettify so fallback prompts, wait state, and stale-response guards stay consistent.
- Keep pane-producing actions shared. `Prettify...` and fold-driven extracted-source panes should compete for the same direct-child slot instead of creating parallel pane state.
- Keep extracted-source pane identity anchored to the full fold range, not a derived body slice, so syntax highlighting, line-number mapping, parent highlighting, and persistent close-state controls all read from one source of truth.
- Keep extracted-source syntax coloring inherited from the source pane language. Fragment re-detection is unreliable because many valid fold excerpts are not standalone documents.
- Keep the output context-menu copy static when the action semantics do not change. Do not thread parser metadata through renderer state just to decorate one button label.
- When a local format is text-native instead of JSON-serializable, give it a dedicated shared formatter helper and keep renderer/main prettifier services as thin adapters.
- Unsupported-format absence is not malformed syntax. If shared local detection cannot justify a supported-format signal, return applied local `text` and skip fallback orchestration.
- Keep supported local format registration in one shared place so apply behavior and malformed-signal heuristics cannot drift apart.
- Keep indentation remapping in one shared helper when local formatters and renderer reindent flows need identical behavior.
- Do not blindly reindent every prettified output when the user changes `indentSize`. Renderer session state should track whether leading-whitespace remapping is semantics-safe for that format.
- Treat YAML plain scalars conservatively. Support quoted and block scalars directly, but keep ambiguous plain scalars disabled unless the adapter can prove they are semantic strings.
- Use a syntax-aware parser for JavaScript/TypeScript target resolution so plain template literals can be distinguished from interpolated ones without string slicing heuristics.
- For GraphQL, a lightweight token scan is enough when it only claims string values and block strings; keep key-hit targeting tied to direct `name: value` pairs and leave other regions generic or disabled.
- For GraphQL local formatting, use a formatter that preserves comments and block-string values. Raw AST print pipelines are not safe because they drop comments and can tempt follow-up indentation rewrites that change string payloads.
- For XML, a raw-text structural scan is enough when it only claims quoted attribute values plus direct text or CDATA payloads, and it must bail out on malformed nesting instead of guessing.
- For SQL, a lightweight scanner is enough when it only claims single-quoted string literals; keep key-hit targeting conservative and bail out on malformed strings or comments.
- If JSON-like input is prettified locally without a successful canonical parse, keep the formatter token-preserving. It may improve whitespace and layout, but it must not invent punctuation, quotes, braces, brackets, or values, and it must not delete incomplete trailing fragments.
- If local prettify semantics already know the output language, carry that override through renderer state instead of re-detecting from possibly invalid output text.
- When a new prettify run replaces visible output before the async response arrives, clear any previous output-language override in the same state transition so Monaco language and context targeting cannot lag behind the in-flight text.

## Testing and Docs

- Every renderer module/component needs a unit test pair.
- `pnpm check` is the baseline local gate.
- Run `pnpm test:e2e` when behavior depends on Electron runtime, windows, menus, or preload.
- If a change set is documentation-only, skip `pnpm check`, `pnpm test`, and `pnpm test:e2e`.
- Wrap direct `window` event dispatches in `act(...)` in renderer tests. Global listeners do not always inherit the testing-library helpers that component-bound events do.
- When an inline control’s meaning depends on arrow direction, lock the rendered SVG path in a unit test instead of only asserting state attributes.
- For Electron Playwright E2E, Playwright `use.headless` does not by itself hide `BrowserWindow` instances. Hidden-window runs need an app-level visibility contract in the main-process window factories.
- In the current E2E suite, document creation, relaunch, log-window, and reset flows all run correctly with hidden windows as long as the test is not asserting `BrowserWindow.isVisible() === true`.
- If Playwright test tags drive runtime behavior, resolve them from `testInfo.titlePath`, not only the leaf `testInfo.title`, so suite-level tagging and `--grep` selection stay aligned.
- Keep onboarding docs concise and current; move history and deep implementation detail out of the main docs.
- When drafting a new spec, treat current code and current docs as the source of truth. Historical spec files are archival context only and must not drive new architecture decisions unless explicitly requested.
- When an ingest guard needs a follow-up choice, store a typed prompt payload in session state instead of a raw message string so UI actions can resume the exact pending flow without reconstructing state from copy.
