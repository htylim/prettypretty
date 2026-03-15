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
- E2E tests validate Electron runtime user journeys, not only boot/smoke behavior.
- E2E scope must cover critical flows: ingestion parity (`open/drop/paste`), fallback enabled/disabled behavior, preference persistence across relaunch, and log-window lifecycle/streaming.
- Prefer deterministic test setup for fallback e2e (test-configured local executables) over machine-specific external CLI dependencies.
- Coverage is reported, not threshold-gated.

## Code Quality

- Use ESLint + Prettier.
- Keep functions small and explicit.
- Avoid implicit shared mutable state.
- Extract repeated state transitions and async request-sequencing into named helpers before adding more branches.
- Add concise docstrings/comments only where behavior, ownership, or async invariants are non-obvious.

## Commit Policy

- Conventional Commits are optional and not enforced by hook.
- Keep commits scoped and atomic.

## Hooks

- `pre-commit`: lint/format staged files, full local quality gate, and e2e.
- `pre-push`: no-op.
