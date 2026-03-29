# Code Structure Analysis

## Score

- Modularity confidence: `8/10`

## Strengths

- Clear runtime boundaries: `src/main`, `src/preload`, `src/shared`, `src/renderer`
- Typed IPC and shared contracts
- No direct `renderer -> main` imports
- Shared local prettifier logic reused across processes
- Strong unit-test coverage and source-to-test pairing discipline

## Main Weak Points

### Renderer orchestration is too centralized

Most renderer behavior converges on a small set of files:

- `src/renderer/app/useAppController.ts`
- `src/renderer/app/usePrettifierFlow.ts`
- `src/renderer/app/useOutputPaneController.ts`

The folder structure is clean, but these files still carry a disproportionate amount of control flow.

### Renderer state ownership is fragmented

Important state is split across:

- Zustand store state
- hook-local state
- mutable refs
- persisted preferences
- Monaco runtime state

That makes renderer behavior harder to reason about than the top-level architecture suggests.

### Monaco complexity shapes the renderer too much

`OutputEditor`, `OutputPaneStrip`, and `src/renderer/output/*` contain significant focus, view-state, folding, and model-lifecycle logic. Monaco is not a thin editor dependency here; it is a major architectural force inside the renderer.

### Some components still carry control logic

`EditorShell`, `OutputPaneStrip`, and `OutputEditor` are not just presentational components. They also participate in ingest, focus, viewport, and interaction orchestration.

## Bottom Line

The project is well structured at the process and module-boundary level.

The main architectural risk is inside the renderer, where a few large orchestration modules and Monaco-heavy runtime behavior carry most of the system complexity.
