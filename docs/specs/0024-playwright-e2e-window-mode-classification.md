# 0024 Playwright E2E Window-Mode Classification

This spec is the input for an implementation plan. If any requirement below is unclear, stop and ask clarifying questions before changing code.

Code snippets and command examples in this spec are reference-only. They clarify intent and tagging shape; they are not implementation code to copy blindly.

## 1. Current State

`playwright.config.ts` already sets `use.headless: true`, but the Electron E2E suite still launches visible app windows because the app creates `BrowserWindow` instances with the default `show` behavior.

Current code shape:

- `tests/e2e/*.spec.ts` launches Electron through `_electron.launch(...)`.
- `src/main/windows/mainWindow.ts` creates document windows without `show: false`.
- `src/main/windows/logWindow.ts` creates the log window without `show: false`.
- `pnpm test:e2e` runs `pnpm build && playwright test`.
- `pnpm test` still includes the full E2E suite.
- `pnpm check` remains the non-E2E gate and does not run Playwright.

Current suite size at spec-writing time:

- 31 E2E tests across 4 files: `tests/e2e/app-flows.spec.ts`, `tests/e2e/app-smoke.spec.ts`, `tests/e2e/empty-state.spec.ts`, and `tests/e2e/window-lifecycle.spec.ts`.

Current gaps:

- There is no app-level hidden-window mode for Electron E2E.
- There is no shared classification for tests that still need a visible window.
- There is no tag-based way to exclude visible-window tests from a selective run.
- There is no audit artifact that records which tests were checked, which ones can run hidden, and which ones remain visible-only.

## 2. Desired End State

Electron E2E runs should support hidden-window execution by default, while still allowing specific tests to opt into visible windows when the test genuinely depends on a shown window.

Required end state:

- Hidden window mode becomes the default for the E2E helper/fixture layer.
- Every current E2E test is audited individually under hidden-window execution.
- Any test that cannot currently run hidden is explicitly tagged so it can be excluded from selective runs.
- Any test that still runs visible today but appears migratable later is called out separately.
- `pnpm test:e2e` and `pnpm test` keep running the full suite exactly as they do now.
- Quality gates do not change yet. The new selective run is additive, not a replacement.

Tagging contract:

- `@requires-visible-window`: the test currently must launch with a shown window and must be excluded from hidden-only runs.
- `@headless-migratable`: the test still runs shown for now, but the failure mode appears fixable with future test/runtime work. This tag is additive and only appears alongside `@requires-visible-window`.

The implementation must not rewrite test assertions or user flows just to force hidden compatibility. If a test only becomes hidden-compatible after non-trivial test surgery, do not do that work in this slice. Keep it visible, tag it, and document why.

## 3. Patterns To Follow

Use the current codebase ownership boundaries instead of inventing a parallel test-only architecture.

- Keep Electron window visibility control in the main-process window factories. `src/main/windows/mainWindow.ts` and `src/main/windows/logWindow.ts` are the correct ownership points for `BrowserWindow` visibility behavior.
- Keep runtime wiring explicit. `src/main/index.ts` already coordinates app bootstrap and window creation. Use that seam to resolve and pass an E2E window-mode contract rather than sprinkling `process.env` reads everywhere.
- Centralize E2E app launch behavior in shared test support instead of continuing to duplicate `_electron.launch(...)` across spec files. `tests/e2e/app-flows.spec.ts` and `tests/e2e/window-lifecycle.spec.ts` already show the need for reusable launch helpers.
- Preserve deterministic E2E setup. Existing E2E tests already reset preferences and use local, controlled setup rather than machine-specific dependencies. The new window-mode classification must keep that discipline.
- Keep documentation aligned with actual commands and test-selection behavior. `README.md`, `docs/engineering-guidelines.md`, and `docs/learnings.md` must describe the new optional test mode without implying that default gates changed.

## 4. Deliverables

**architecture decisions**

- Add one explicit E2E window-mode contract for Electron launches. Use a narrow runtime input such as `PRETTYPRETTY_E2E_WINDOW_MODE=hidden|visible`.
- Resolve that contract in the main process and thread it into all E2E-created windows.
- Document windows and log windows must both honor the same mode so hidden E2E runs stay fully hidden, including secondary windows opened during a test.
- Keep normal app/dev behavior unchanged outside E2E-triggered runs.

**design decisions**

- Add a shared E2E support module under `tests/e2e/support/` that owns Electron launch behavior, default retries, and window-mode selection.
- Hidden mode is the default in that support layer.
- Visible mode is opt-in and is selected only for tests tagged `@requires-visible-window`.
- The support layer must work for tests that relaunch the app within a single test and for tests that open additional windows after bootstrap.
- Do not change product behavior or renderer logic for this slice except what is strictly required to let Electron windows honor the E2E visibility mode.

**documentation decisions**

- Add a durable audit document that lists every current E2E test, its final classification, and a short reason.
- Recommended path: `docs/e2e-window-mode-audit.md`.
- Update `README.md` and `docs/engineering-guidelines.md` to document the new optional hidden-only E2E command.
- Update `README.md` and `docs/engineering-guidelines.md` to document the meaning of `@requires-visible-window` and `@headless-migratable`.
- Update `README.md` and `docs/engineering-guidelines.md` to state explicitly that default quality gates still run the full suite.
- Update `docs/learnings.md` with the Electron-specific finding that Playwright browser headless mode does not by itself hide Electron `BrowserWindow` instances.

**tests decisions**

- Audit every current E2E test individually. Do not classify by file-level guesswork.
- The audit sequence must be explicit: run the test in hidden mode first.
- If the hidden run fails, rerun the same test in visible mode.
- If the visible rerun passes, classify the test as `@requires-visible-window`.
- If the visible-only status appears fixable later without product changes, also add `@headless-migratable`.
- Record the final classification and reason in the audit document.
- Hidden-compatible tests must remain untagged so the default path is clean.
- Add an additive command for running only hidden-compatible E2E tests. Recommended script name: `pnpm test:e2e:headless-only`.
- That command must exclude all tests tagged `@requires-visible-window`.
- Do not change `pnpm test:e2e`, `pnpm test`, or any quality-gate entry point in this slice.

**code changes decisions**

- Remove duplicated direct `_electron.launch(...)` usage from spec files by routing launches through shared support.
- Keep test-flow changes minimal. Allowed changes are shared helper adoption, imports, and title-level tagging or metadata.
- Do not rewrite assertions, interactions, or behavior only to make hidden mode pass.
- Prefer one common selection mechanism for visible tests. Title-level Playwright tags are acceptable here because the repo currently has no other tagging pattern and the selective run needs simple grep-based filtering.

Reference-only example:

```ts
test('keeps the empty-state CTA centered after window resize @requires-visible-window @headless-migratable', async () => {
  // unchanged test body
});
```

**quality decisions**

- `pnpm check` remains the required non-E2E gate.
- `pnpm test:e2e` remains required for this implementation because this work changes Electron-runtime test behavior.
- The new hidden-only E2E command is an additional verification tool and documentation target, not a replacement gate.

## 5. Acceptance Criteria

- [ ] Electron E2E supports a hidden-window mode that is controlled explicitly by app/runtime code, not only by Playwright `use.headless`.
- [ ] Main document windows and log windows both honor the same E2E window-mode contract.
- [ ] Hidden mode is the default for the shared E2E launch helper or fixture.
- [ ] Every current E2E test in `tests/e2e/` has been audited individually and recorded in the audit document.
- [ ] Every test that cannot currently run hidden is tagged `@requires-visible-window`.
- [ ] Every visible-only test that appears migratable later is additionally tagged `@headless-migratable`.
- [ ] Hidden-compatible tests remain untagged.
- [ ] A hidden-only selective command exists and excludes every `@requires-visible-window` test.
- [ ] `pnpm test:e2e` still runs the full suite, including visible-window tests.
- [ ] `pnpm test` still runs the same full E2E suite it runs today.
- [ ] No test has been behaviorally weakened or rewritten just to force hidden compatibility.
- [ ] `README.md`, `docs/engineering-guidelines.md`, and `docs/learnings.md` are updated to match the final behavior.
- [ ] `pnpm check` passes.
- [ ] `pnpm test:e2e` passes.

## 6. File Summary

Expected implementation touch points:

- New: `tests/e2e/support/` shared Electron launch helper/fixture module(s)
- Modified: `src/main/index.ts`
- Modified: `src/main/windows/mainWindow.ts`
- Modified: `src/main/windows/logWindow.ts`
- Modified: `tests/e2e/app-flows.spec.ts`
- Modified: `tests/e2e/app-smoke.spec.ts`
- Modified: `tests/e2e/empty-state.spec.ts`
- Modified: `tests/e2e/window-lifecycle.spec.ts`
- Modified: `package.json`
- New: `docs/e2e-window-mode-audit.md`
- Modified: `README.md`
- Modified: `docs/engineering-guidelines.md`
- Modified: `docs/learnings.md`

## 7. Open Questions / Resolved Decisions

Resolved in this spec:

- Default suite behavior does not change. `pnpm test:e2e` still runs everything.
- The common exclusion tag is `@requires-visible-window`.
- The migration-only additive tag is `@headless-migratable`.
- Tests are classified by empirical audit, not by assumptions from file names or feature area.
- This slice must not rewrite tests just to make them hidden-compatible.

Open questions for implementation:

- None at spec-writing time. If implementation discovers a case where a test can only be classified by changing product code unrelated to window visibility, stop and ask before expanding scope.
