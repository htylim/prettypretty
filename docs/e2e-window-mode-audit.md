# E2E Window Mode Audit

Audit baseline:

- 31 Playwright Electron tests in `tests/e2e/`
- hidden-window mode run first via the shared launch helper
- failures rerun in visible-window mode before classification

Tag meanings:

- `@requires-visible-window`: the test must run with a shown window in the default full suite.
- `@headless-migratable`: reserved for tests that still run visible today but look fixable later without product changes.

Current result:

- 31 tests are hidden-compatible.
- 0 tests currently require a shown window.
- 0 tests are currently marked `@headless-migratable`.

## Classifications

| File                                 | Test                                                                                                   | Classification    | Reason                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------ |
| `tests/e2e/app-flows.spec.ts`        | `supports ingest parity for drop and paste`                                                            | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `runs configured fallback agent for malformed input`                                                   | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `uses passthrough output for malformed content when fallback is disabled`                              | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `prettifies graphql documents locally from direct input`                                               | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `treats escape in the context-pane fallback selection modal as No and opens passthrough output`        | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `keeps passthrough text in the child pane when context-pane fallback is canceled from the wait screen` | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `treats escape on the context-pane fallback wait screen as cancel and keeps passthrough output`        | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `opens a recursive prettify child chain from JSON string scalars`                                      | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `resolves YAML block scalars from the output context menu and opens a child pane`                      | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `resolves JavaScript string bindings from the output context menu and opens a child pane`              | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `resolves GraphQL block string values from the output context menu and opens a child pane`             | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `prettifies graphql query strings from json output context panes locally`                              | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `resolves XML attribute values from the output context menu and opens a child pane`                    | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `resolves SQL quoted string literals from the output context menu and opens a child pane`              | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `keeps the context-menu action disabled when the output editor has a selection`                        | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `persists toolbar preferences across app relaunch`                                                     | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-flows.spec.ts`        | `opens and reuses log window and streams telemetry log lines`                                          | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-smoke.spec.ts`        | `launches app and renders main window`                                                                 | hidden-compatible | Hidden run still verified startup and renderer focus behavior.                       |
| `tests/e2e/app-smoke.spec.ts`        | `renders Monaco output editor and keeps collapse/expand stable in output mode`                         | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-smoke.spec.ts`        | `shows a truncated preview overlay for collapsed output blocks`                                        | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-smoke.spec.ts`        | `renders inline output fold controls and hides gutter fold controls`                                   | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-smoke.spec.ts`        | `holding Ctrl switches the inline fold control to direct-child behavior`                               | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-smoke.spec.ts`        | `keeps the inline fold button anchored to the fold-start line across mode changes`                     | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/app-smoke.spec.ts`        | `keeps inline fold controls aligned with Monaco TypeScript folding`                                    | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/empty-state.spec.ts`      | `preload bridge exposes app info`                                                                      | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/empty-state.spec.ts`      | `keeps the empty-state CTA centered after window resize`                                               | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/window-lifecycle.spec.ts` | `toolbar New opens a second blank document window and preserves the existing document`                 | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/window-lifecycle.spec.ts` | `Cmd+N opens a new document window and Cmd+Shift+N resets only the focused window`                     | hidden-compatible | Hidden run passed after dropping the explicit `BrowserWindow.isVisible()` assertion. |
| `tests/e2e/window-lifecycle.spec.ts` | `closing one of two document windows leaves the app running`                                           | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/window-lifecycle.spec.ts` | `closing the final remaining window exits the app process`                                             | hidden-compatible | Hidden run passed unchanged.                                                         |
| `tests/e2e/window-lifecycle.spec.ts` | `the app stays alive when the log window is the only remaining window`                                 | hidden-compatible | Hidden run passed unchanged.                                                         |
