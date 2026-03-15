# 0001 Project Setup

## Objective

Establish a production-grade baseline for `prettypretty` so feature development can start with testing, linting, typing, packaging, and documentation already in place.

## Scope

### In Scope

- Electron/React/TypeScript/Vite/Tailwind scaffold.
- Minimal runnable shell UI.
- Security baseline for Electron process boundaries.
- Unit test and Electron E2E automation.
- Local quality gates and git hooks.
- Foundational project documentation.

### Out of Scope

- Full prettifier engine.
- IDE-grade output rendering features.
- Hosted CI pipeline.
- Signed production release pipeline.

## Tech Decisions

- Package manager: `pnpm`
- Node runtime: `22 LTS`
- Packager: `electron-builder`
- Lint/format: `ESLint + Prettier`
- Unit tests: `Vitest + Testing Library`
- E2E tests: `Playwright` with Electron launcher
- Commit policy: scoped, atomic commit messages (Conventional Commits optional)

## Required Files

- Root configs: TS, ESLint, Prettier, Tailwind, Electron Vite, Playwright, Vitest, commitlint, editorconfig, gitignore.
- Source tree under `src/main`, `src/preload`, `src/renderer`, `src/shared`.
- Tests under `tests/unit` and `tests/e2e`.
- Hooks under `.husky`.
- Docs under `README.md` and `docs/*.md`.

## Minimal Shell Behavior

- App launches one window.
- Toolbar is present with placeholder controls.
- Empty-state centered message: `Paste, Drop, or Click`.
- `Click` calls preload API to open file.
- Input/output mode exists; only one pane visible at a time.
- Input pane editable, output pane read-only.

## IPC Contracts

- `dialog.openFile(): Promise<{ path: string; content: string } | null>`
- `file.save(content: string): Promise<{ path: string } | null>`
- `clipboard.copy(content: string): Promise<void>`
- `app.getInfo(): Promise<{ name: string; version: string }>`

## Scripts

- `dev`, `build`, `dist`
- `lint`, `format`, `format:check`, `typecheck`
- `test:unit`, `test:e2e`, `test`, `test:pairing`, `check`

## Quality Gates

- No numeric coverage threshold.
- Coverage report always generated.
- `test:pairing` enforces test files for renderer modules/components.
- `pre-commit`: `lint-staged` + `pnpm check` + `pnpm test:e2e`.
- `pre-push`: no-op.

## Verification Checklist

Run locally and expect all pass:

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test:unit
pnpm test:pairing
pnpm build
pnpm test:e2e
pnpm check
```

## Acceptance Criteria

1. App runs in local dev mode.
2. Unit and E2E tests pass.
3. Quality gates are hook-enforced.
4. Packaging command produces unsigned local artifacts.
5. Documentation exists and matches the implemented setup.
