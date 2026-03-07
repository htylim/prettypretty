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
- `src/renderer/app/usePrettifierFlow.ts` owns prettifier execution flow, request-id race guards, and fallback wait/progress state.
- `src/renderer/app/usePreferencesFlow.ts` owns preferences hydration and optimistic persistence sequencing for theme/fallback agent.
- `src/renderer/app/useKeyboardShortcuts.ts` owns keyboard shortcut bindings and mode gating.
- `src/renderer/app/appDomain.ts` contains pure helper functions/constants shared by renderer controller hooks.
- `src/renderer/app/reportRendererError.ts` provides a single renderer-side error reporting path.

## Runtime Flow

1. App starts in `src/main/index.ts`.
2. Main process initializes `PreferencesStore` + `PreferencesService` using `app.getPath('userData')/preferences.json`.
3. Main process configures an explicit application menu via `src/main/menu/applicationMenu.ts` using fixed app naming (`prettypretty`) to avoid macOS dev menu fallback label `Electron`, exposes `Preferences...` in the macOS app menu, and routes `New Window` / `Reset Window` commands through main-process callbacks.
4. Main process resolves persisted preferences each time a document window is created and passes `themeMode` into `BrowserWindow` (`backgroundColor` + `additionalArguments`) in `src/main/windows/mainWindow.ts`.
5. Startup creates one document window; later document windows can be created from the File menu or renderer IPC without reusing renderer state from an existing window.
6. Main process identifies document windows separately from the optional log window and can send focused-window reset events only to document renderers.
7. Preload script exposes `window.prettypretty`, including window-creation and reset-subscription APIs.
8. Renderer calls preload APIs for open/save/copy/window/info/preferences/prettifier/telemetry.
9. Main-process IPC handlers parent open/save dialogs to the invoking `BrowserWindow` so multi-window dialog ownership stays scoped correctly.
10. App lifetime is tied to Electron's `window-all-closed` event: closing a non-last window only removes that window, and closing the final remaining window exits the app.
11. Main-process shutdown paths (`before-quit`, `will-quit`, `window-all-closed`) terminate any active fallback agent children before exit so agent CLIs do not outlive the app.

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
- Main prettifier service resolves the fallback agent from either the persisted preference or a per-request override and executes via `child_process.spawn`.
- Active fallback children are tracked in main and terminated on app shutdown; POSIX builds kill the spawned process group and Windows uses tree termination (`taskkill /T /F`) so child/grandchild agent processes do not survive app exit.
- Fallback execution enforces timeout and output-size caps and classifies failures into typed statuses.
- Any fallback failure degrades to passthrough output instead of throwing into renderer.
- Empty open-file/drop content stays in input mode and shows an inline notice (`File has no content.`).
