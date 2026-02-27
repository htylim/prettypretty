# Architecture

## Process Model

- `src/main`: Electron main process, window lifecycle, IPC handlers.
- `src/preload`: secure bridge exposing typed APIs to renderer.
- `src/renderer`: React UI.
- `src/shared`: cross-process contracts and shared types.

## Renderer Styling

- Visual tokens and component skinning live in `src/renderer/styles/tailwind.css`.
- Light/dark theming is driven by `document.documentElement.dataset.theme`, consumed through `:root[data-theme='dark']`.
- React components (`Toolbar`, `EditorShell`, `App`) bind semantic class names while keeping behavior/state logic separate from styling.

## Runtime Flow

1. App starts in `src/main/index.ts`.
2. Main process sets explicit app menu labels via `src/main/menu/applicationMenu.ts` using fixed app naming (`prettypretty`) to avoid macOS dev menu fallback label `Electron`, and exposes `Preferences...` in the macOS app menu to open `<userData>/preferences.json` in the OS default editor.
3. Main window is created from `src/main/windows/mainWindow.ts`.
4. Main process initializes `PreferencesStore` + `PreferencesService` using `app.getPath('userData')/preferences.json`.
5. Preload script exposes `window.prettypretty`.
6. Renderer calls preload APIs for open/save/copy/info/preferences/prettifier/telemetry.
7. Main process handles IPC, prettifier orchestration, and other side effects.

## Preferences Data Flow

- Source of truth is main-process `PreferencesService` (`src/main/preferences`).
- Disk persistence is JSON at `<userData>/preferences.json`.
- Current persisted settings include `themeMode`, `indentSize` (integer `1..8`, default `2`), `agents`, and `fallbackAgentId`.
- `agents` stores fallback command configuration (`executable`, `argsTemplate`, `promptTemplate`, `promptDelivery`, `enabled`, `timeoutMs`, `maxOutputBytes`).
- `fallbackAgentId` is either `null` to disable fallback or a valid enabled agent id (default: `codex`).
- Prompt template tokens currently supported by the preferences model are `{input}` and `{indentSize}`.
- Default preferences initialize two agent configs: `amp` and `codex`.
- Renderer reads/writes preferences only via preload IPC channels:
  - `preferences:get-all`
  - `preferences:update`
  - `preferences:reset`
- Store writes are serialized and atomic (temp file + flush + rename).
- Invalid/corrupt preferences files are rolled to `preferences.corrupt.<timestamp>.json` and replaced with defaults.

## Security

- Context isolation enabled.
- Node integration disabled.
- Renderer has no direct Node access.
- IPC channels are explicit and typed.

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
  - JSON5 parse for JS/TS object-literal style input,
  - Python-literal normalization + JSON5 parse.
- If local parsing succeeds, renderer uses local output immediately.
- If local parsing fails/unsupported, renderer calls main-process `prettifier:run` IPC and shows a dedicated wait screen (hiding editors) while fallback is running.
- Main process streams best-effort fallback progress lines over `prettifier:progress` IPC; renderer binds updates to request id and renders only the latest line in the wait screen.
- Main prettifier service resolves configured fallback agent from preferences and executes via `child_process.spawn`.
- Fallback execution enforces timeout and output-size caps and classifies failures into typed statuses.
- Any fallback failure degrades to passthrough output instead of throwing into renderer.
- Empty open-file/drop content stays in input mode and shows an inline notice (`File has no content.`).
