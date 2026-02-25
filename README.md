# prettypretty

`prettypretty` is a desktop Electron app for prettifying structured text input (JSON, JavaScript objects, Python-like dictionaries, and related formats).

This repository currently contains **Step 1: project setup and minimal shell**.

## Stack

- Electron
- React
- TypeScript
- Vite (`electron-vite`)
- Tailwind CSS

## Prerequisites

- Node.js 22 LTS
- pnpm

## Quick Start

```bash
pnpm install
pnpm dev
```

## Commands

```bash
pnpm dev           # run Electron in development mode
pnpm build         # build main/preload/renderer
pnpm dist          # package app with electron-builder
pnpm icon:generate # regenerate app icons in build/
pnpm lint          # eslint
pnpm format        # prettier write
pnpm format:check  # prettier check
pnpm typecheck     # TypeScript project typecheck
pnpm test:unit     # Vitest unit tests
pnpm test:e2e      # Playwright Electron tests
pnpm test          # unit + e2e
pnpm test:pairing  # enforce source-to-test file pairing
pnpm check         # lint + format:check + typecheck + unit + pairing
```

## App Icon Assets

- Electron packaging expects icons under `build/`:
  - `build/icon.icns` (macOS)
  - `build/icon.ico` (Windows)
  - `build/icon.png` (Linux)
- Regenerate all icon artifacts from the design source with:

```bash
pnpm icon:generate
```

## Quality Gates

- No numeric coverage threshold.
- Coverage reports are generated for visibility.
- Every renderer module/component must have a corresponding unit test file.
- `pre-commit`: `lint-staged`
- `pre-push`: `pnpm check` + `pnpm test:e2e`

## Security Baseline

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Preload-only bridge to Electron/Node APIs.
