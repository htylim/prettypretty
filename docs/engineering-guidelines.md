# Engineering Guidelines

## Architecture Rules

- IPC contracts are defined in `src/shared` and consumed by both main/preload/renderer.
- Keep renderer free of Node/Electron direct APIs.
- Keep `src/shared` free of runtime ownership and UI framework dependencies.
- Keep `App.tsx` composition-only.

## Testing

- Every renderer module/component needs a unit test file.
- Tests should cover main paths and edge cases.
- E2E tests validate Electron runtime user journeys, not only boot/smoke behavior.
- Prefer deterministic test setup for fallback e2e (test-configured local executables) over machine-specific external CLI dependencies.

## Quality Gates

- A change is not done until the required checks pass.
- Run `pnpm check` before completing work.
- Run `pnpm test:e2e` for user-visible or Electron runtime changes.
- Coverage is reported for visibility, not threshold-gated.

## Code Quality

- Keep functions small and explicit.
- Avoid implicit shared mutable state.
- Extract repeated state transitions and async request-sequencing into named helpers before adding more branches.
- Add concise docstrings/comments only where behavior, ownership, or async invariants are non-obvious.
- Leave the code cleaner than you found it.

## Hooks

- `pre-commit`: lint/format staged files plus the non-E2E local quality gate (`pnpm check`).
- `pre-commit` must not launch Playwright/Electron e2e; commit-time hooks should stay fast enough for normal iteration.
- `pre-push`: no-op.

## Documentation

- Keep docs current when code ownership or product behavior changes.
- Prefer concise current-state docs over long history logs.
