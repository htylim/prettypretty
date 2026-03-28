# Architecture

## Process Model

- `src/main`: Electron main process, window lifecycle, IPC handlers.
- `src/preload`: secure bridge exposing typed APIs to renderer.
- `src/renderer`: React UI.
- `src/shared`: cross-process contracts and shared types.

## Renderer Styling

- Visual tokens and component skinning live in `src/renderer/styles/tailwind.css`.
- Light/dark theming is driven by `document.documentElement.dataset.theme`, consumed through `:root[data-theme='dark']`.
- Renderer boot (`src/renderer/main.tsx`) seeds `themeMode` + `documentElement.dataset.theme` from preload-provided `window.prettypretty.app.initialThemeMode` before first React render to avoid first-paint theme flicker.
- React components (`Toolbar`, `FallbackAgentDropdown`, `EditorShell`, `App`) bind semantic class names while keeping behavior/state logic separate from styling.

## Renderer Controller Layer

- `src/renderer/App.tsx` is a thin composition shell only.
- `src/renderer/app/useAppController.ts` owns renderer orchestration and UI wiring.
- `src/renderer/app/useOutputPaneController.ts` owns output-pane chain state, pane-strip viewport state (`leftVisiblePaneIndex`), active-pane routing, embedded-highlight state, focus handoff, and reset rules independently from the broader app controller.
- `src/renderer/app/usePrettifierFlow.ts` owns prettifier execution flow, request-id race guards, fallback wait/progress state, and request-scoped fallback cancellation.
- `src/renderer/app/usePreferencesFlow.ts` owns preferences hydration and optimistic persistence sequencing for theme/fallback agent.
- `src/renderer/app/useKeyboardShortcuts.ts` owns keyboard shortcut bindings and mode gating, including split navigation/pop shortcuts in output mode for literal `Ctrl+Arrow`, browser-style `primary+[ / primary+]`, and `Alt+Arrow` navigation equivalents.
- `src/renderer/app/useMouseNavigationShortcuts.ts` owns output-pane navigation bindings for side-button mice, consuming preload-native browser navigation commands and DOM button-`3`/`4` fallback events without double-triggering.
- `src/renderer/app/primaryModifier.ts` centralizes platform-aware primary-modifier detection for renderer shortcuts and Monaco input gestures.
- `src/renderer/app/windowApi.ts` centralizes safe access to the typed preload bridge from renderer hooks.
- `src/renderer/app/appDomain.ts` contains pure helper functions/constants shared by renderer controller hooks.
- `src/renderer/app/outputPaneDomain.ts` owns pure derived-pane chain mutations, generalized pane-content descriptors (shared-source range views plus independent extracted text), explicit descendant invalidation, viewport-step math, source-highlight lookup, and active-pane normalization for output split behavior.
- `src/renderer/app/reportRendererError.ts` provides a single renderer-side error reporting path.

## Renderer Editor Folding

- `src/renderer/editor/monacoFolding.ts` is the single renderer folding adapter. It isolates Monaco folding-contribution access and exposes fold-start discovery, smallest-enclosing fold-range resolution, collapsed-state lookup, toggle-by-fold-start behavior, direct-child action resolution, and direct-child action execution for renderer features.
- `src/renderer/output/inlineFoldControls.ts` owns output-only inline fold control widgets. It renders Monaco content widgets on visible fold-start lines, derives collapsed-preview text from the top lines inside the folded region, refreshes widget state from scroll/layout/model/language/hidden-area changes, swaps the single inline button between self-toggle and direct-child actions while literal `Ctrl` is held, and prevents inline-control clicks from falling through to pane split selection.
- `src/renderer/output/indentBlockFolding.ts` remains the modifier-click registration seam, but it now delegates fold targeting and toggling to `monacoFolding.ts` instead of inferring fold ranges from indentation.
- `src/renderer/output/outputEmbeddedSelection.ts` resolves one embedded structured payload candidate from output text plus click/selection context, projects nested decoded matches back to source coordinates, and returns the exact source span plus extracted payload.
- `src/renderer/output/outputViewRange.ts` owns pane-local hidden-area application so derived panes can render filtered views over the shared root Monaco model without mutating source text or fold state in sibling panes.
- `src/renderer/output/monacoEditorRuntime.ts` owns Monaco runtime preparation, bounded pane view-state caching, and shared-model reference counting so editor instances do not manage those globals inline.
- `src/renderer/output/registerGraphqlLanguage.ts` registers the custom Monaco GraphQL language used by output panes when detected content is a GraphQL operation or schema block.
- `src/renderer/output/splitSelectionDecorations.ts` owns the Monaco decoration collection for output embedded highlights.
- `src/renderer/components/OutputPaneStrip.tsx` renders the ordered horizontal output pane strip, mounts every pane in the current chain, owns the hidden-scrollbar scroll container, and converts literal-`Ctrl` wheel/trackpad gestures into snapped viewport steps.
- Output-pane editors share one Monaco source model per root output document. Root-pane view state persists by root document identity, derived-pane keys are regenerated when a selection changes, and the runtime manager caps cached view-state entries so pane replacement cannot grow that cache without bound.

## Runtime Flow

1. App starts in `src/main/index.ts`.
2. Main process initializes `PreferencesStore` + `PreferencesService` using `app.getPath('userData')/preferences.json`.
3. Main process configures an explicit application menu via `src/main/menu/applicationMenu.ts` using fixed app naming (`prettypretty`) to avoid macOS dev menu fallback label `Electron`, exposes `Preferences...` in the macOS app menu, and routes `New Window` / `Reset Window` commands through main-process callbacks.
4. Main process resolves persisted preferences each time a document window is created and passes `themeMode` into `BrowserWindow` (`backgroundColor` + `additionalArguments`) in `src/main/windows/mainWindow.ts`.
5. Startup creates one document window; later document windows can be created from the File menu or renderer IPC without reusing renderer state from an existing window, and new document windows cascade from the originating document window bounds captured at command dispatch with a bounded offset inside the active display work area.
6. Main process identifies document windows separately from the optional log window and can send focused-window reset events only to document renderers.
7. `src/main/windows/mainWindow.ts` forwards native BrowserWindow browser-navigation events to the renderer over the preload bridge, using `app-command` on Windows/Linux and `swipe` on macOS so split-pane navigation can bind to mouse side buttons and swipe-driven history gestures.
8. Preload script exposes `window.prettypretty`, including window-creation, reset-subscription, and browser-navigation-command subscription APIs.
9. Renderer calls preload APIs for open/save/copy/window/info/preferences/prettifier/telemetry.
10. Main-process IPC handlers parent open/save dialogs to the invoking `BrowserWindow` so multi-window dialog ownership stays scoped correctly.
11. App lifetime is tied to Electron's `window-all-closed` event: closing a non-last window only removes that window, and closing the final remaining window exits the app.
12. Main-process shutdown paths (`before-quit`, `will-quit`, `window-all-closed`) terminate any active fallback agent children before exit so agent CLIs do not outlive the app.

## Preferences Data Flow

- Source of truth is main-process `PreferencesService` (`src/main/preferences`).
- Disk persistence is JSON at `<userData>/preferences.json`.
- Current persisted settings include `themeMode`, `indentSize` (integer `1..8`, default `2`), `fallbackWarningLineThreshold` (positive integer, default `300`), `agents`, and `fallbackAgentId`.
- `agents` stores fallback command configuration (`executable`, `argsTemplate`, `promptTemplate`, `promptDelivery`, `enabled`, `timeoutMs`, `maxOutputBytes`).
- `fallbackAgentId` is either `null` to disable fallback or a valid enabled agent id (default: `codex`).
- Prompt template tokens currently supported by the preferences model are `{input}` and `{indentSize}`.
- Default preferences initialize two agent configs: `amp` and `codex`.
- Renderer reads/writes preferences only via preload IPC channels:
  - `preferences:get-all`
  - `preferences:update`
  - `preferences:reset`
- Toolbar preferences (`themeMode`, `indentSize`, `fallbackAgentId`) use optimistic renderer updates with request-id sequencing and rollback on failed persistence.
- Startup hydration is invalidated whenever a newer optimistic preference mutation begins, so a slow `preferences:get-all` response cannot overwrite a more recent local selection.
- `fallbackWarningLineThreshold` is hydrated from preferences and consumed by renderer prettifier orchestration to gate large fallback runs; current scope does not expose a toolbar write path for this value.
- Store writes are serialized and atomic (temp file + flush + rename).
- Invalid/corrupt preferences files are rolled to `preferences.corrupt.<timestamp>.json` and replaced with defaults.

## Security

- Context isolation enabled.
- Node integration disabled.
- Renderer has no direct Node access.
- IPC channels are explicit and typed.
- Main-process IPC handlers validate payloads at the boundary (including primitive channels such as save/copy text) and reject invalid payloads with `ipc.validation.error` telemetry.
- Renderer-side window commands (`app:open-window`) and main-to-renderer reset signals (`app:reset-current-window`) stay inside the preload bridge; renderer code still has no direct Electron access.
- Native browser navigation mouse commands also stay inside the preload bridge; renderer receives typed `browser-backward` / `browser-forward` events instead of direct Electron objects.

## Logging

- Main process always captures structured JSON log lines in an in-memory session buffer (max 2000 lines) from app startup.
- Verbose mode (`-v` or `--verbose`) controls stdout emission only.
- When verbose is enabled, main process emits structured JSON log lines to stdout.
- macOS app menu (`prettypretty`) includes `View Log` (`Cmd+L`) to open a dedicated log window.
- Log window shows buffered startup/runtime history immediately and then streams newly appended log lines.
- Startup, ingestion, IPC validation, prettifier pipeline, and fallback execution events are captured for session log viewing and emitted to stdout in verbose mode.
- Raw payloads are never logged; logs include metadata only (lengths, statuses, timings, ids).

## Packaging Assets

- Electron Builder reads packaging assets from `build/` (`directories.buildResources`).
- App icon artifacts are:
  - `build/icon.icns` for macOS
  - `build/icon.ico` for Windows
  - `build/icon.png` for Linux
- Main process also uses `build/icon.png` at runtime for dev icon overrides:
  - macOS dock icon via `app.dock.setIcon(...)`
  - Windows/Linux window icon via `BrowserWindow` `icon` option
- Regenerate icon artifacts via `pnpm icon:generate` (`scripts/generate-app-icons.sh`).

## Prettifier Runtime Flow

- Input text ingestion events come from open file, drop, paste, or manual output-mode switch.
- Prettifier runs only on output-triggered paths and never on every input keystroke.
- Renderer applies local parser chain first:
  - strict JSON parse,
  - newline-delimited JSON parse (strict JSON per non-empty line),
  - JSON5 parse for JS/TS object-literal style input,
  - Python-literal normalization + JSON5 parse.
- Local parser implementation is shared across processes in `src/shared/localPrettifier.ts` and reused by both renderer and main-process prettifier flows.
- If local parsing succeeds, renderer uses local output immediately.
- If local parsing fails/unsupported, renderer calls main-process `prettifier:run` IPC and shows a dedicated wait screen (hiding editors) while fallback is running.
- Before calling main-process fallback for malformed/unsupported input, renderer checks `fallbackWarningLineThreshold`; when input line count exceeds the threshold, it requires explicit modal confirmation.
- If local parsing fails/unsupported while no persisted fallback is selected, renderer can request a one-shot fallback agent choice and passes that agent id to main as a per-request override without mutating preferences.
- When `indentSize` changes while output pane shows already-prettified text, renderer reindents current output locally (leading-whitespace remap) instead of triggering a new prettifier/fallback run.
- Main process streams best-effort fallback progress lines over `prettifier:progress` IPC; renderer binds updates to request id and renders only the latest line in the wait screen.
- Renderer can cancel the active fallback wait-screen request through `prettifier:cancel`; cancellation hides the wait screen immediately, returns to input mode, and ignores the late response from the killed run.
- Main prettifier service resolves the fallback agent from either the persisted preference or a per-request override and executes via `child_process.spawn`.
- Active fallback children are tracked in main by request id and terminated on user cancel or app shutdown; POSIX builds kill the spawned process group and Windows uses tree termination (`taskkill /T /F`) so child/grandchild agent processes do not survive app exit.
- Fallback execution enforces timeout and output-size caps and classifies failures into typed statuses.
- Any fallback failure degrades to passthrough output instead of throwing into renderer.
- Output syntax highlighting is inferred from the rendered text and currently recognizes JSON, JavaScript, TypeScript, GraphQL, YAML, XML, SQL, Markdown, and plaintext.
- Empty open-file/drop content stays in input mode and shows an inline notice (`File has no content.`).
- Output pane state stays renderer-window local inside `useOutputPaneController`, resets on root-output invalidation / output-mode exit / window reset, and never changes the root output text used by save/copy.
- Output pane state keeps content, highlight, and viewport concerns separate: the ordered derived-pane chain decides which panes exist, the embedded-candidate map decides which pane source spans are highlighted, and `leftVisiblePaneIndex` decides which adjacent pair is framed in the strip.
- The pane-strip platform is broader than the current product workflow: today it is used for root output plus independent embedded-prettify panes, but the chain model still supports shared-source range panes as a separate content strategy.
- Output pane dependency is explicit and linear: every pane depends on the pane immediately to its left, and any mutation of a pane invalidates and removes every pane to its right before focus/viewport state is normalized.
- Toolbar fold/find routing uses controller-managed `activePaneId` plus registered output-editor handles, so visible pane focus is independent from pane content identity and follows split open/pop/navigation transitions.
