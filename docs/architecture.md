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
  - shared local formatter helpers and indentation remapping
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
- `src/renderer/app/session/*`
  - document-session source of truth for renderer-visible window state
  - selectors, pure session domains, and focused runtime seams
- `src/renderer/app/useAppController.ts`
  - top-level renderer composition seam
  - owns renderer output context-menu view state
- `src/renderer/app/usePrettifierFlow.ts`
  - session-backed prettifier orchestration
- `src/renderer/app/usePrettifierRequestFlow.ts`
  - shared renderer prettify-request orchestration, including fallback prompts and cancelation
- `src/renderer/app/usePreferencesFlow.ts`
  - preferences hydration and optimistic persistence
- `src/renderer/app/useOutputPaneController.ts`
  - session-backed output-pane orchestration plus runtime focus/handle coordination
  - owns shared derived-pane actions for context prettify and extracted-source panes
- `src/renderer/components/*`
  - view seams and focused renderer runtimes
- `src/renderer/output/*`
  - Monaco runtime helpers shared by output mode
  - output context-prettify target resolution for the supported syntax families
  - fold-body extraction and source-linked pane presentation helpers

## Core Runtime Flows

### Startup

1. Main bootstraps logging, preferences, IPC handlers, and menu wiring.
2. Main creates a document window and passes initial theme data through preload.
3. Renderer reads the preload bridge, seeds theme state, and mounts `App` or `LogWindowApp`.

### Prettify Flow

1. Renderer ingests text from open, drop, paste, or output-mode switch.
2. The document session owns renderer-visible input/output, wait, modal, and pane state.
3. Renderer runs the shared local parser first.
4. Pure prettifier session/domain helpers decide local success, passthrough, fallback prompts, and whether output can be safely reindented by whitespace remapping.
5. `usePrettifierRequestFlow` owns request ids, stale-response guards, fallback wait state, and IPC calls for both root-output prettify and pane-targeted prettify.
6. If local parsing fails and fallback is allowed, the prettifier runtime calls main over IPC.
7. Main executes the configured fallback agent and streams progress back by request id.
8. Renderer shows a wait screen, supports cancel, and resolves the active request to either the final result or passthrough through session state or the targeted output pane.

### Preferences Flow

1. Main owns persisted preferences.
2. Renderer hydrates preferences through preload IPC.
3. Renderer uses optimistic updates for theme, indent size, and fallback agent selection.
4. Main validates and persists the final value.

## Where To Work

- New UI behavior
  - start in `src/renderer/app/session/*` when the behavior changes renderer-visible state ownership
  - use `src/renderer/app/*` controller hooks for orchestration
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
  - shared text-format helpers such as GraphQL formatting live in `src/shared/*`
  - shared indentation remapping lives in `src/shared/reindentText.ts`
  - use Prettier only as a formatter backend for formats where the product wants to preserve the source language as that language, and where Prettier is the safest formatter for the job
  - the current approved runtime Prettier use is GraphQL formatting in `src/shared/graphqlPrettifier.ts`
  - do not route JSON-family normalization through Prettier when the product behavior is to canonicalize input into JSON output rather than preserve the original source dialect
  - do not treat Prettier as the app's format detector or prettify orchestrator; format detection, malformed/unsupported classification, and fallback routing stay owned by the shared prettifier flow
  - keep the malformed-vs-text boundary in shared local detection: plain unrecognized text is a local applied no-op (`text`), and `malformed` is only for recognized supported local syntax that fails parsing
  - renderer prettifier session state decides whether an already-prettified output may be reindented by remapping leading whitespace or must stay fixed until the next real prettify run
  - main runtime behavior lives in `src/main/prettifier/*`
  - renderer session/domain behavior lives in `src/renderer/app/session/prettifierSessionDomain.ts`
  - renderer runtime seams live in `src/renderer/app/session/usePrettifierRuntime.ts` and `src/renderer/app/session/useFallbackModalRuntime.ts`
  - renderer orchestration lives in `src/renderer/app/usePrettifierFlow.ts`
- Monaco output behavior
  - start in `src/renderer/components/useOutputEditorRuntime.ts`
  - shared Monaco helpers stay in `src/renderer/output/*`
  - keep extracted-source line-number mapping and highlight decoration ownership in the editor runtime
  - model extracted-source pane identity from the full Monaco fold range so control state, highlighting, and pane text stay aligned
  - keep extracted-source language inheritance in the pane controller/view model layer because it is a presentation concern, not pane identity
- Output context menu behavior
  - start in `src/renderer/components/useOutputEditorRuntime.ts`
  - keep target resolution in `src/renderer/output/*`
  - keep menu state and action orchestration in `src/renderer/app/*`
  - keep pane-slot replacement shared with other derived-pane producers
- Split-pane viewport behavior
  - start in `src/renderer/components/useOutputPaneViewportRuntime.ts`
  - keep `src/renderer/components/OutputPaneStrip.tsx` render-only where possible

## Complexity Hotspots

These files carry the most behavioral density. Read them carefully before changing related features.

- `src/renderer/app/session/documentSessionDomain.ts`
- `src/renderer/app/session/prettifierSessionDomain.ts`
- `src/renderer/app/usePrettifierFlow.ts`
- `src/renderer/app/outputPaneDomain.ts`
- `src/renderer/components/useOutputPaneViewportRuntime.ts`
- `src/renderer/components/useOutputEditorRuntime.ts`

## Rules That Matter

- Keep `src/shared` pure and cross-process.
- Keep renderer free of direct Electron and Node APIs.
- Validate renderer-originated payloads at the main-process boundary.
- Keep `App.tsx` thin.
- Keep renderer-visible window state in the document session, not scattered across components.
- Split pure behavior decisions from runtime effects and DOM/Monaco coordination.
- Keep `OutputPaneStrip.tsx` and `OutputEditor.tsx` as thin render/adapter seams.

## Related Docs

- `docs/ui-spec.md`
  - current product behavior
- `docs/design-style.md`
  - visual rules
- `docs/engineering-guidelines.md`
  - implementation and verification expectations
- `docs/specs/`
  - implementation plans and historical context, not the source of truth for current architecture
