# 0022 GraphQL Package Cleanup

## 1. Current State

The app no longer uses the `graphql` package in runtime code.

Current GraphQL formatting is implemented through Prettier in [src/shared/graphqlPrettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/graphqlPrettifier.ts). A repo-wide usage check shows the only remaining `graphql` import is in [tests/unit/shared/localPrettifier.test.ts](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/shared/localPrettifier.test.ts), where the test uses `graphql.parse(...)` to assert that GraphQL block-string values are not semantically changed by formatting.

That leaves the repo in an inconsistent state:

- production formatting no longer depends on `graphql`
- the package still exists in `devDependencies`
- the lockfile still resolves it
- the remaining usage is test-only and should be justified explicitly or removed

This cleanup is needed so dependency ownership matches the actual architecture. The shared GraphQL formatter is Prettier-backed. The repo should not keep an extra parser package around unless there is a deliberate test-only reason to do so.

## 2. Desired End State

The repo should no longer carry `graphql` unless there is a clear, documented, test-only need that cannot be achieved with the existing stack.

Desired outcome:

- `package.json` does not depend on `graphql`
- `pnpm-lock.yaml` no longer resolves `graphql`
- GraphQL unit coverage remains intact
- the GraphQL block-string safety test still protects against semantic regressions without reintroducing another parser dependency

Example of the intended outcome:

- GraphQL formatting still runs through Prettier
- GraphQL comment-preservation and block-string formatting tests still exist
- the block-string test asserts a semantics-safe expected output directly instead of parsing the formatted result with `graphql.parse(...)`

If implementation proves that the current semantic guarantee cannot be tested responsibly without an external parser, stop and ask before keeping `graphql` or adding a replacement dependency.

## 3. Patterns To Follow

Follow the existing dependency-ownership pattern already reflected in the codebase:

- runtime dependencies should map to actual runtime owners
- test-only needs should not leak into runtime dependency decisions
- shared formatter logic stays in `src/shared`
- tests should validate observable formatter behavior, not duplicate runtime ownership

Relevant current patterns in code:

- [src/shared/graphqlPrettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/graphqlPrettifier.ts)
  - GraphQL formatting is owned by a dedicated shared helper
- [src/shared/localPrettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/localPrettifier.ts)
  - shared local formatting routes by detected format and returns app-level result types
- [tests/unit/shared/localPrettifier.test.ts](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/shared/localPrettifier.test.ts)
  - this is the right seam for GraphQL local-format assertions
- [docs/dependencies-and-tools.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/dependencies-and-tools.md)
  - dependency documentation already treats Prettier as the GraphQL formatter and does not claim `graphql` is a runtime dependency

Code in this spec is reference only. Do not copy-paste blindly. If the cleanup reveals that a test guarantee is ambiguous, ask before choosing a new dependency or weakening the coverage.

## 4. Deliverables

**architecture decisions**

- Keep GraphQL formatting ownership exactly where it is today: Prettier-backed shared formatting in `src/shared`.
- Do not introduce a new GraphQL parser helper or alternate runtime formatter as part of this cleanup.
- Do not move GraphQL logic into renderer or main adapter seams just to avoid the dependency cleanup.

**design decisions**

- Remove the remaining test-only `graphql` package usage from the repo.
- Keep the existing GraphQL regression coverage focused on observable formatter output:
  - GraphQL operations
  - fragments
  - SDL/type-system documents
  - comment preservation
  - block-string-safe formatting
- Prefer a direct output assertion for the block-string regression test over parsing the emitted document with another library.

**data model decisions**

- No application data models should change.
- No new result types, session fields, or IPC contracts should be added.

**tests decisions**

- Update [tests/unit/shared/localPrettifier.test.ts](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/shared/localPrettifier.test.ts) so it no longer imports `graphql`.
- Keep the block-string regression scenario, but assert the expected formatter output directly and clearly enough that a future semantic regression would fail the test.
- Do not weaken GraphQL coverage just to remove the dependency.
- Do not add E2E coverage unless the cleanup unexpectedly changes user-visible behavior.

**code changes decisions**

- Remove `graphql` from `package.json`.
- Update `pnpm-lock.yaml` accordingly.
- Remove the `graphql` import and any parser-based assertion logic from the shared GraphQL unit test.
- Keep runtime GraphQL formatting code unchanged unless the cleanup surfaces an actual bug.

**documentation decisions**

- Update docs only if the implementation changes any documented dependency ownership.
- If docs remain accurate after removing `graphql`, avoid unnecessary doc churn.

**verification decisions**

- `pnpm check` is required.
- `pnpm test:e2e` is not required for this cleanup unless implementation touches user-visible or Electron-runtime behavior.
- Every touched renderer module must continue to satisfy the existing unit-test pairing rule.

## 5. Acceptance Criteria

- [ ] `package.json` no longer lists `graphql`.
- [ ] `pnpm-lock.yaml` no longer resolves `graphql`.
- [ ] The repo has no remaining `graphql` imports outside archived spec text or unrelated historical references.
- [ ] [tests/unit/shared/localPrettifier.test.ts](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/shared/localPrettifier.test.ts) still verifies GraphQL block-string-safe formatting without using `graphql.parse(...)`.
- [ ] GraphQL local prettifier coverage still includes operation, fragment, SDL, comment-preservation, block-string, and malformed-document cases.
- [ ] No runtime GraphQL formatting behavior changes as part of the cleanup.
- [ ] `pnpm check` passes.
- [ ] `pnpm test:e2e` is only run if the cleanup changes user-visible or Electron-runtime behavior.

## 6. File Summary

Expected files to modify:

- [package.json](/Users/hernantylim/Dev/sandbox/prettypretty/package.json)
- [pnpm-lock.yaml](/Users/hernantylim/Dev/sandbox/prettypretty/pnpm-lock.yaml)
- [tests/unit/shared/localPrettifier.test.ts](/Users/hernantylim/Dev/sandbox/prettypretty/tests/unit/shared/localPrettifier.test.ts)

Possible files to modify only if needed:

- [docs/dependencies-and-tools.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/dependencies-and-tools.md)
- [docs/learnings.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/learnings.md)

New file added by this spec:

- [docs/specs/0022-graphql-package-cleanup.md](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0022-graphql-package-cleanup.md)

## 7. Open Questions / Resolved Decisions

Resolved decisions:

- The runtime GraphQL formatter is Prettier, not `graphql`.
- The remaining `graphql` package usage is test-only.
- This cleanup should remove the dependency unless the semantic regression test truly cannot be maintained without it.
- This is a dependency/test cleanup, not a product behavior change.

Open questions:

- None at spec-writing time.
- If implementation shows that the block-string regression cannot be asserted responsibly without an external parser, stop and ask before preserving or replacing the dependency.
