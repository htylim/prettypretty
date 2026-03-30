# Dependencies and Tools

Use the existing stack unless there is a documented reason to add something new.

## Runtime

- `electron`
  - app shell
  - window lifecycle
  - IPC
- `react`, `react-dom`
  - renderer UI
- `zustand`
  - lightweight renderer store
- `monaco-editor`, `@monaco-editor/react`
  - input and output editors
- `json5`
  - local parsing support for JSON5 and JS/TS object-literal input
- `prettier`
  - local GraphQL formatting in the shared prettifier
  - comment-preserving and block-string-safe GraphQL printing
- `react-icons`
  - toolbar iconography

## Build

- `electron-vite`
  - main/preload/renderer build pipeline
- `vite`
  - dev server and bundling
- `typescript`
  - type system and project builds
- `@vitejs/plugin-react`
  - React support for Vite

## Styling

- `tailwindcss`
- `@tailwindcss/postcss`
- `postcss`
- `autoprefixer`

Visual tokens and shared component styling live in `src/renderer/styles/tailwind.css`.

## Testing

- `vitest`
  - unit tests
- `@testing-library/react`
  - renderer/component tests
- `@testing-library/user-event`
  - interaction tests
- `@testing-library/jest-dom`
  - DOM assertions
- `jsdom`
  - unit-test browser environment
- `playwright`, `@playwright/test`
  - Electron end-to-end tests

## Lint, Format, Release

- `eslint`
- `typescript-eslint`
- `prettier`
- `husky`
- `lint-staged`
- `electron-builder`

## System Tools

- `pnpm`
  - package manager
- `magick`
  - icon raster generation used by `scripts/generate-app-icons.sh`

## Default Choices By Area

- Renderer UI: React + Tailwind
- Renderer state: Zustand when shared state is needed
- Main/preload: TypeScript + Electron APIs
- Shared contracts and types: `src/shared`
- Unit tests: Vitest
- E2E tests: Playwright
