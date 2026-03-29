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

## Monaco

- Use shared Monaco runtime helpers instead of duplicating setup logic.
- Keep input/output editor options aligned unless there is a documented reason not to.
- Treat Monaco integration as a real subsystem; changes there usually affect focus, view state, folding, and tests together.
- Keep Monaco runtime ownership in focused runtime seams, not spread across view components and controller hooks.
- Keep viewport movement/focus timing and editor lifecycle/folding as separate seams; they change for different reasons and should not be explained from one giant component.

## Preferences and IPC

- Main owns persisted preferences.
- Renderer should use optimistic updates only with proper sequencing and rollback rules.
- Validate IPC payloads at the main-process boundary, including primitive string payloads.

## Prettifier and Fallback

- Run the local parser first.
- Execute fallback agents only in the main process.
- Enforce timeout, output-size limits, and process cleanup for fallback runs.
- Correlate fallback progress and completion by request id.
- For pane-targeted prettify flows, only enable the action for semantic string scalars that can be decoded to a concrete string value. If decoding is ambiguous or would no-op, keep the action disabled.
- Keep pane-targeted prettify orchestration shared with root-output prettify so fallback prompts, wait state, and stale-response guards stay consistent.
- Treat YAML plain scalars conservatively. Support quoted and block scalars directly, but keep ambiguous plain scalars disabled unless the adapter can prove they are semantic strings.
- Use a syntax-aware parser for JavaScript/TypeScript target resolution so plain template literals can be distinguished from interpolated ones without string slicing heuristics.
- For GraphQL, a lightweight token scan is enough when it only claims string values and block strings; keep labels tied to direct `name: value` pairs and leave other regions generic or disabled.
- For XML, a raw-text structural scan is enough when it only claims quoted attribute values plus direct text or CDATA payloads, and it must bail out on malformed nesting instead of guessing.
- For SQL, a lightweight scanner is enough when it only claims single-quoted string literals; keep label derivation conservative and bail out on malformed strings or comments.

## Testing and Docs

- Every renderer module/component needs a unit test pair.
- `pnpm check` is the baseline local gate.
- Run `pnpm test:e2e` when behavior depends on Electron runtime, windows, menus, or preload.
- Keep onboarding docs concise and current; move history and deep implementation detail out of the main docs.
- When drafting a new spec, treat current code and current docs as the source of truth. Historical spec files are archival context only and must not drive new architecture decisions unless explicitly requested.
