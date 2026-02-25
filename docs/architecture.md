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
2. Main window is created from `src/main/windows/mainWindow.ts`.
3. Main process initializes `PreferencesStore` + `PreferencesService` using `app.getPath('userData')/preferences.json`.
4. Preload script exposes `window.prettypretty`.
5. Renderer calls preload APIs for open/save/copy/info/preferences.
6. Main process handles IPC and performs side effects.

## Preferences Data Flow

- Source of truth is main-process `PreferencesService` (`src/main/preferences`).
- Disk persistence is JSON at `<userData>/preferences.json`.
- Current persisted settings include `themeMode`, `indentSize` (integer `1..8`, default `2`), `agents`, and `fallbackAgentId`.
- `agents` stores fallback command configuration (`executable`, `argsTemplate`, `promptTemplate`, `promptDelivery`, `enabled`, `timeoutMs`, `maxOutputBytes`).
- `fallbackAgentId` is `null` to disable fallback or a valid enabled agent id.
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

## Future Data Flow (Feature Work)

- Input text ingestion (paste/drop/open file).
- Input rendering through Monaco editable editor instance.
- Parse + prettify pipeline via renderer-local `PrettifierService`:
  - strict JSON parse,
  - JSON5 parse for JS/TS object-literal style input,
  - Python-literal normalization + JSON5 parse,
  - malformed/unsupported payload passthrough unchanged.
- Prettifier output indentation and Monaco indentation are both driven by the persisted `indentSize` preference.
- Agent fallback execution is future scope; current work only scaffolds persisted configuration.
- Output rendering through Monaco read-only editor instance with syntax/highlighting/folding.
