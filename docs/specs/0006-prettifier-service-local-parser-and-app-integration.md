# 0006 Prettifier Service Local Parser and App Integration

## Goal

Introduce a dedicated `PrettifierService` that accepts `string` input and returns `string` output, then wire app prettification through this service instead of inline logic in `App.tsx`.
Scope is local parser-based prettification only (no AI fallback implementation yet).
For malformed or unsupported input, return the original text unchanged.

## Problem / Context

Current formatting is JSON-only and inlined in renderer `App.tsx`, which blocks clean extension to newline-delimited JSON, JavaScript/TypeScript object-literal text, and Python dict-like text.
This also leaves no explicit seam for the future LLM fallback path.

## Deliverables

### Architecture and ownership decisions

- Add a pure local service module as parser/formatter source of truth (no Electron APIs, no filesystem access, no network access).
- Keep renderer ingestion flow unchanged (`drop`, `paste`, `open file` continue to use the same ingestion path).
- Replace inline `formatText` in `App.tsx` with `PrettifierService`.
- Replace renderer-only indentation constant ownership with persisted `PreferencesService` ownership.

### Indentation preference refactor (cross-cutting)

- Extend preferences schema with `indentSize` and keep main process as the authority:
  - type: integer `1..8`,
  - default: `2`,
  - stored in `<userData>/preferences.json` with existing schema versioning/migration path.
- Extend shared contracts and validation:
  - `src/shared/preferences.ts`: include `indentSize` in `Preferences` and `PreferencesPatch`,
  - main-process validators reject values outside `1..8`,
  - IPC/preload typed bridge continues to use `preferences.getAll()` + `preferences.update(patch)`.
- Renderer bootstrap must hydrate both `themeMode` and `indentSize` from preferences before user interaction.
- `PrettifierService` must receive indentation size from caller options and never hardcode indentation.
- Monaco input/output editor options must use the same hydrated `indentSize` (`tabSize` + indentation guides alignment).
- There must be one runtime indentation source at any moment: persisted preferences state mirrored in renderer store.
- No indentation UI control is added in this scope; preference is persisted/system-driven only.

### Parser strategy decision (lightweight, no heavy formatter stack)

- Use parser chain in this order:

1. Strict JSON parse (`JSON.parse`).
2. Newline-delimited JSON parse (strict JSON parse per non-empty line).
3. JSON5 parse for JS/TS object-literal style input (single quotes, comments, trailing commas, unquoted keys).
4. Python-literal normalization + JSON5 parse for dict/list representations.

- Do not use `eval`, `new Function`, `vm`, or any dynamic code execution.
- Do not add heavy formatting ecosystems (for example full Prettier parser packs) in this scope.

### Data-shape and safety rules

- Public API stays `prettify(rawText: string): string`.
- Empty/whitespace input returns `''`.
- Only prettify structured roots (`object` or `array`); scalar roots (`number`, `string`, `boolean`, `null`) pass through unchanged.
- After parse, validate the value tree is JSON-serializable before `JSON.stringify`:
  - reject non-finite numbers (`NaN`, `Infinity`, `-Infinity`),
  - reject unsupported runtime values if encountered.
- On any parse/normalize/serialize failure, return the original input exactly.

### Python dict-like normalization scope

- Supported normalization tokens (outside string literals only):
  - `True` -> `true`
  - `False` -> `false`
  - `None` -> `null`
- In scope examples:
  - `{'a': 1, 'b': True, 'c': None}`
  - `{'items': [{'x': 1}, {'y': 2}]}`
- Out of scope (must return original text unchanged):
  - tuples, sets, bytes, datetime/object constructors, custom classes, comprehensions.

### Electron best-practice constraints

- Keep renderer free from unsafe execution of user-provided text.
- Keep service pure and deterministic so it can be moved behind IPC later for AI fallback orchestration without behavior drift.

### Testing requirements

- Add unit tests for service behavior:
  - valid JSON prettifies with injected indentation (`2` and `4` cases),
  - valid newline-delimited JSON prettifies record-by-record,
  - valid JSON5/JS object-literal prettifies,
  - valid Python dict-like payload prettifies,
  - malformed JSON/JSON5/Python-like text returns original unchanged,
  - unsupported Python constructs return original unchanged,
  - non-finite numeric values do not silently coerce; return original unchanged.
- Extend preferences tests:
  - default preferences include `indentSize: 2`,
  - valid `indentSize` updates persist/reload,
  - invalid `indentSize` in patch is rejected,
  - missing/invalid `indentSize` in version-1 on-disk payload migrates to default (`2`) without corrupt-file rollover.
- Extend IPC tests:
  - `preferences:update({ indentSize: 4 })` succeeds and returns typed preferences,
  - invalid indentation payload is rejected in main process.
- Update renderer `App` unit tests:
  - ingestion routes continue switching to output mode,
  - output rendering uses service result for JSON, JS object-literal, and Python dict-like samples,
  - hydrated `indentSize` drives both prettifier output and Monaco `tabSize`,
  - malformed samples remain unchanged in output.

### Documentation updates required by implementation

- Update `docs/architecture.md` with Prettifier local pipeline ownership.
- Update `docs/ui-spec.md` with parser-order behavior and malformed passthrough rule.
- Update `docs/dependencies-and-tools.md` if a new lightweight parsing dependency is added (expected: `json5`).
- Update `docs/learnings.md` with parser-safety pitfalls discovered during implementation.

Reference note for implementation agents: any code snippets in specs are intent examples only, not copy-paste source of truth.

## Acceptance Criteria

- [ ] App prettification path uses `PrettifierService` (no inline JSON formatting logic in `App.tsx`).
- [ ] `PrettifierService` input/output contract is `string -> string`.
- [ ] Parser chain supports well-formed JSON, newline-delimited JSON, JS object-literal style input, and Python dict-like input in scope.
- [ ] Malformed/unsupported input is returned unchanged.
- [ ] No dynamic code execution is used for parsing.
- [ ] Persisted `indentSize` preference is the single source for prettify indentation and Monaco indentation.
- [ ] `indentSize` supports integers `1..8`, defaults to `2`, and is validated in main process.
- [ ] Unit tests cover parser chain and passthrough behavior.
- [ ] Unit and IPC tests cover indentation preference validation + persistence behavior.
- [ ] No new indentation control is added to toolbar/settings UI in this scope.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `docs/specs/0006-prettifier-service-local-parser-and-app-integration.md`
- New: `src/renderer/prettifier/prettifierService.ts`
- New: `src/renderer/prettifier/pythonLiteralNormalize.ts`
- New: `src/renderer/prettifier/jsonSerializableGuard.ts`
- New: `tests/unit/renderer/prettifier/prettifierService.test.ts`
- New: `tests/unit/renderer/prettifier/pythonLiteralNormalize.test.ts`
- New: `tests/unit/renderer/prettifier/jsonSerializableGuard.test.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/state/uiStore.ts` (add `indentSize` state + setter)
- Modify: `src/renderer/output/outputEditorConfig.ts` (consume caller-provided/preference indentation)
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `tests/unit/renderer/output/outputEditorConfig.test.ts`
- Modify: `src/shared/preferences.ts`
- Modify: `src/main/preferences/preferencesTypes.ts`
- Modify: `src/main/preferences/preferencesDefaults.ts`
- Modify: `src/main/preferences/preferencesStore.ts` (migration/validation path)
- Modify: `tests/unit/main/preferences/preferencesStore.test.ts`
- Modify: `tests/unit/main/preferences/preferencesService.test.ts`
- Modify: `tests/unit/main/ipc/preferencesIpc.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/ui-spec.md`
- Modify: `docs/dependencies-and-tools.md` (only if dependency added)
- Modify: `docs/learnings.md`

## Open Questions / Resolved Decisions

- Resolved: local parser-first optimization is required; AI fallback implementation is out of scope for this spec.
- Resolved: malformed or unsupported input must not throw and must return original text.
- Resolved: avoid heavy formatter libraries in this phase; prefer minimal parser dependency (`json5`) plus small normalization utilities.
- Resolved: code identifiers use `PrettifierService` naming.
- Resolved: top-level scalar inputs (for example `42`, `'x'`) remain passthrough and are not normalized in this phase.
- Resolved: newline-delimited JSON is treated as supported local input by parsing each non-empty line as strict JSON and formatting records sequentially.
- Resolved: indentation source of truth is persisted `PreferencesService.indentSize`, not a renderer constant.
- Resolved: supported indentation sizes in this phase are integers `1..8`.
- Resolved: indentation remains non-user-configurable in UI during this phase.
