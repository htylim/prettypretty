# Architecture

## Repository Layout

- `src/main`
  - Electron main-process runtime
  - window lifecycle
  - menus
  - IPC handlers
  - preferences persistence
  - fallback process execution
- `src/preload`
  - typed bridge exposed as `window.prettypretty`
  - no product logic
- `src/shared`
  - cross-process contracts and pure shared logic
  - no React imports
  - no Electron/Node runtime ownership
- `src/renderer`
  - React UI
  - renderer state and controller hooks
  - Monaco integration

## Main Modules

### Main Process

- `src/main/index.ts`
  - composition root
  - bootstraps services
  - registers IPC
  - opens windows
- `src/main/ipc/index.ts`
  - IPC boundary
  - payload validation
  - file/dialog/clipboard bridging
- `src/main/preferences/*`
  - main-process source of truth for persisted settings
- `src/main/prettifier/*`
  - local/fallback prettifier runtime
  - fallback process management
- `src/main/windows/*`
  - document window and log window creation

### Renderer

- `src/renderer/App.tsx`
  - composition only
- `src/renderer/app/useAppController.ts`
  - top-level renderer orchestration
- `src/renderer/app/usePrettifierFlow.ts`
  - ingest, local prettify, fallback orchestration, cancel/progress handling
- `src/renderer/app/usePreferencesFlow.ts`
  - preferences hydration and optimistic persistence
- `src/renderer/app/useOutputPaneController.ts`
  - output-pane state, focus, and viewport management
- `src/renderer/state/uiStore.ts`
  - lightweight renderer UI store
- `src/renderer/components/*`
  - view components
- `src/renderer/output/*`
  - Monaco runtime helpers for output mode

## Core Runtime Flows

### Startup

1. Main bootstraps logging, preferences, IPC handlers, and menu wiring.
2. Main creates a document window and passes initial theme data through preload.
3. Renderer reads the preload bridge, seeds theme state, and mounts `App` or `LogWindowApp`.

### Prettify Flow

1. Renderer ingests text from open, drop, paste, or output-mode switch.
2. Renderer runs the shared local parser first.
3. If local parsing succeeds, renderer updates output immediately.
4. If local parsing fails and fallback is allowed, renderer calls main over IPC.
5. Main executes the configured fallback agent and streams progress back by request id.
6. Renderer shows a wait screen, supports cancel, and applies the final result or passthrough.

### Preferences Flow

1. Main owns persisted preferences.
2. Renderer hydrates preferences through preload IPC.
3. Renderer uses optimistic updates for theme, indent size, and fallback agent selection.
4. Main validates and persists the final value.

## Where To Work

- New UI behavior
  - start in `src/renderer/app/*`
  - wire view changes in `src/renderer/components/*`
- New persisted preference
  - update `src/shared/preferences.ts`
  - update main preferences types/service/store
  - expose through preload
  - wire renderer hydration and persistence
- New IPC capability
  - define/update the contract in `src/shared/*`
  - implement main handler
  - expose preload bridge
  - consume from renderer
- Prettifier or fallback behavior
  - local/shared parsing lives in `src/shared/localPrettifier.ts`
  - main runtime behavior lives in `src/main/prettifier/*`
  - renderer orchestration lives in `src/renderer/app/usePrettifierFlow.ts`
- Monaco output behavior
  - start in `src/renderer/output/*` and `src/renderer/components/OutputEditor.tsx`

## Complexity Hotspots

These files carry the most behavioral density. Read them carefully before changing related features.

- `src/renderer/app/useAppController.ts`
- `src/renderer/app/usePrettifierFlow.ts`
- `src/renderer/app/useOutputPaneController.ts`
- `src/renderer/components/OutputPaneStrip.tsx`
- `src/renderer/components/OutputEditor.tsx`

## Rules That Matter

- Keep `src/shared` pure and cross-process.
- Keep renderer free of direct Electron and Node APIs.
- Validate renderer-originated payloads at the main-process boundary.
- Keep `App.tsx` thin.
- Put reusable logic in pure helpers when possible; do not bury it in components.

## Related Docs

- `docs/ui-spec.md`
  - current product behavior
- `docs/design-style.md`
  - visual rules
- `docs/engineering-guidelines.md`
  - implementation and verification expectations
- `docs/specs/`
  - implementation plans and historical context, not the source of truth for current architecture
