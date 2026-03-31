# prettypretty

`prettypretty` is an Electron desktop app for turning structured text into readable output.
It uses a local parser first and can fall back to configured CLI agents when local parsing fails.

## Current Product Shape

- Monaco input editor and read-only Monaco output editor
- Local prettify for JSON, NDJSON, JSON5, JS/TS object literals, Python-like dicts, and GraphQL documents
- Right-click prettify in output panes for semantic string scalars in JSON/NDJSON, YAML, JavaScript/TypeScript string literals, GraphQL string values, XML attribute/text payloads, and SQL quoted string literals, including child-pane expansion
- `Shift` inline fold controls can open extracted source blocks in adjacent output panes, keep the close control visible while that pane stays open, preserve source-linked line numbers, and inherit source syntax highlighting
- Optional main-process fallback agent execution
- Fallback cancel keeps passthrough text visible instead of clearing the active output
- Persisted theme, indent, and fallback-agent preferences
- Multi-window document workflow and optional log window

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
pnpm dev
pnpm build
pnpm dist
pnpm test
pnpm test:e2e
pnpm test:e2e:headless-only
pnpm check
```

## Documentation

- Use these as needed:
- Use `docs/ui-spec.md` for product behavior.
- Use `docs/design-style.md` for visual rules.
- Use `docs/architecture.md` for code structure and ownership.
- Use `docs/engineering-guidelines.md` for implementation and test expectations.
- Use `docs/dependencies-and-tools.md` for stack choices.
- `docs/specs/` contains implementation plans and historical decision context. It is not the source of truth for current architecture.

## Quality Gates

- `pnpm check` is the required non-E2E gate.
- Run `pnpm test:e2e` for user-visible or Electron runtime changes.
- `pnpm test:e2e` still runs the full suite.
- `pnpm test:e2e:headless-only` excludes tests tagged `@requires-visible-window`.
- `@requires-visible-window` means the test must launch with a shown Electron window.
- `@headless-migratable` is reserved for visible-only tests that look fixable later without product changes.
- If a change set is documentation-only, skip `pnpm check`, `pnpm test`, and `pnpm test:e2e`.
- Every renderer module/component must have a corresponding unit test file.
- `pre-commit`: `pnpm lint-staged && pnpm check`
- `pre-push`: no-op

## Security Baseline

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Preload-only typed bridge to Electron/Node APIs.
