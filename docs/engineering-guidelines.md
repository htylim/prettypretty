# Engineering Guidelines

## Core Standards

- Implement features following best-practices.
- A feature is considered DONE only if ALL quality gates pass.
- TypeScript strict mode stays enabled.
- IPC contracts are defined in `src/shared` and consumed by both main/preload/renderer.
- Keep renderer free of Node/Electron direct APIs.

## Testing

- Every renderer module/component needs a unit test file.
- Tests need to cover all main scenarios for the unit they are testing, plus edge cases.
- E2E tests validate Electron boot and bridge behavior.
- Coverage is reported, not threshold-gated.

## Code Quality

- Use ESLint + Prettier.
- Keep functions small and explicit.
- Avoid implicit shared mutable state.

## Commit Policy

- Conventional Commits are optional and not enforced by hook.
- Keep commits scoped and atomic.

## Hooks

- `pre-commit`: lint/format staged files.
- `pre-push`: full local quality gate + e2e.
