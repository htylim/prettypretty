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
3. Preload script exposes `window.prettypretty`.
4. Renderer calls preload APIs for open/save/copy/info.
5. Main process handles IPC and performs side effects.

## Security

- Context isolation enabled.
- Node integration disabled.
- Renderer has no direct Node access.
- IPC channels are explicit and typed.

## Future Data Flow (Feature Work)

- Input text ingestion (paste/drop/open file).
- Parse + prettify pipeline.
- Output rendering with syntax/highlighting/folding.
