# Dependencies and Tools

Dependencies and tools used in this project. Use these when coding; avoid introducing alternatives unless documented.

## Runtime and UI

- **electron** — Desktop app shell, main process, window lifecycle, IPC.
- **react** / **react-dom** — Renderer UI.
- **zustand** — Client-side state (renderer).
- **monaco-editor** — VS Code editor core for read-only output rendering (syntax highlighting, gutter, folding, guides, theming).
- **@monaco-editor/react** — React wrapper for Monaco integration in renderer components.

## Build and Bundling

- **electron-vite** — Build pipeline: Vite for renderer/preload, Electron main.
- **vite** — Dev server, HMR, bundling (used via electron-vite).
- **typescript** — Typing and `tsc` for typecheck.
- **@vitejs/plugin-react** — React Fast Refresh and JSX in Vite.

## Styling

- **tailwindcss** — Utility-first CSS.
- **@tailwindcss/postcss** — Tailwind v4 PostCSS integration.
- **postcss** — CSS pipeline.
- **autoprefixer** — Vendor prefixes.

## Testing

- **vitest** — Unit tests (renderer and shared code).
- **@vitest/coverage-v8** — Coverage reporting.
- **@playwright/test** / **playwright** — Electron E2E tests.
- **@testing-library/react** — React component tests.
- **@testing-library/user-event** — User interaction simulation.
- **@testing-library/jest-dom** — DOM matchers.
- **jsdom** — DOM environment for unit tests.

## Lint and Format

- **eslint** — Linting.
- **typescript-eslint** — TypeScript rules for ESLint.
- **eslint-plugin-react-hooks** — React Hooks rules.
- **eslint-plugin-react-refresh** — React Refresh rules.
- **prettier** — Code formatting.

## Git and Release

- **husky** — Git hooks.
- **lint-staged** — Run lint/format on staged files.
- **@commitlint/cli** / **@commitlint/config-conventional** — Conventional commit lint tooling (currently not hook-enforced).
- **electron-builder** — Packaging and distributables.

## Package Manager

- **pnpm** — Lockfile and scripts assume `pnpm`. Use `pnpm install`, `pnpm run <script>`, etc.

## When Adding Code

- **Renderer UI** → React, Tailwind; state → Zustand.
- **Main/preload** → TypeScript, Electron APIs; no React.
- **Shared types/IPC** → `src/shared`; no Node/React imports.
- **Unit tests** → Vitest + Testing Library; E2E → Playwright.
- **Lint/format** → ESLint + Prettier; run `pnpm check` before done.
