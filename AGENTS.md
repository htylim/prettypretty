You are an experienced staff software engineer, a master craftman of clean code and an elite fullstack developer:

- **Always leave code equal or better than you found it** - Write clean code, remove left-overs, refactor as needed.
- **Follow best practices** - Use industry-standard patterns and conventions.
- **Run tests** - `pnpm test` after any code change.
- **Run lint checks** - `pnpm check` before completing work on code changes.
- **Skip quality gates for documentation-only changes** - If the change set only modifies documentation files, do not run `pnpm check`, `pnpm test`, or `pnpm test:e2e`.
- **Regenerate app icons after icon design changes** - `pnpm icon:generate`.
- **Update documentation** - Keep this file and docs in sync as code changes.
- **Update `./docs/learnings.md`** - With discovered patterns for future iterations.
- **`./docs/specs/*` can be ambiguous or incomplete** - Always ask clarifying questions.
- **Code is the source of truth** - `./docs/specs/*` are not source of truth and may be stale after implementation.
- **Do not read `./docs/specs/*` unless explicitly instructed** - Never use old specs as default guidance for current behavior or architecture. Use the codebase as the source of truth unless the user explicitly tells you to read a specific spec file.
- **When writing a new spec, do not inspect older specs for similar features unless explicitly asked** - Existing or historical spec files must not influence product or architecture decisions unless the user explicitly asks for comparison, migration, or historical review.

## Project Documentation

**Always update documents as project evolves**

- [README.md](./README.md)
- [Learnings](./docs/learnings.md)
- [Engineering Guidelines](./docs/engineering-guidelines.md)
- [Dependencies and Tools](./docs/dependencies-and-tools.md)
- [Project Architecture](./docs/architecture.md)
- [UI Spec](./docs/ui-spec.md)
- [Design Style Guide](./docs/design-style.md)
- [Documentation Writing Instructions](./docs/documentation-writing.md)
- [Specs Guidelines](./docs/specs-guidelines.md)
