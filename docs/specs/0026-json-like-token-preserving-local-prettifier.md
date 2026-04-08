# 0026 JSON-Like Token-Preserving Local Prettifier

## 1. Current State

The app centralizes local prettify behavior in [src/shared/localPrettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/localPrettifier.ts). Renderer and main both consume that shared entrypoint, which is the correct ownership boundary because local-format decisions must not drift.

Before this refactor, JSON-family input effectively had two local outcomes:

- canonical parse succeeded and the app emitted normalized JSON text
- canonical parse failed and the app reported a malformed local result that stayed on the fallback path

That contract was too coarse. Some JSON-like input is still locally readable even when canonical parsing fails, especially truncated objects or arrays. The product goal is to extend local prettifying for those cases without turning the app into a repair engine.

## 2. Desired End State

The local JSON-family flow should have three outcomes:

- `applied / json-like / canonical / {json | ndjson | json5 | python-like}`
- `applied / json-like / token-preserving / json-like-token-preserving`
- `failed / json-like / {malformed | unsupported}`

GraphQL and plain text keep their own families:

- `applied / graphql / canonical / graphql`
- `applied / text / passthrough / text`

Fallback remains the last step. If canonical parsing fails or produces a non-serializable value, the shared local prettifier should still try the token-preserving JSON-like formatter before returning a failed local result.

## 3. Architecture Decisions

- Keep shared local prettify orchestration in [src/shared/localPrettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/localPrettifier.ts).
- Keep the JSON-like token-preserving formatter pure, deterministic, and shared in [src/shared/jsonLikeTokenPreservingFormatter.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/jsonLikeTokenPreservingFormatter.ts).
- Keep canonical parse strategies ordered as `json`, `ndjson`, `json5`, then `python-like`.
- If a canonical strategy parses but cannot be serialized back to JSON safely, record that as `unsupported` and continue to the token-preserving formatter instead of failing early.
- Keep shared result metadata explicit in [src/shared/prettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/prettifier.ts):
  - applied: `{ kind, family, mode, variant }`
  - failed: `{ kind, family, reason }`
- Keep telemetry and logs flattened to primitives derived from that shared summary:
  - `localFamily`
  - `localMode`
  - `localVariant`
  - `localFailureReason`
- Keep renderer output-language decisions driven by shared local-result semantics rather than by re-detecting syntax from possibly invalid prettified text.

## 4. Behavioral Rules

- Canonical JSON-like parsing stays ahead of token-preserving formatting.
- Token-preserving formatting is only for brace/bracket-delimited JSON-like input.
- Token-preserving formatting may change whitespace and layout only.
- Token-preserving formatting must never add, delete, or replace non-whitespace characters.
- Token-preserving formatting must not invent commas, colons, quotes, braces, brackets, or literal values.
- If canonical parsing and token-preserving formatting both fail, fallback behavior stays unchanged.
- Plain unrecognized text remains a local applied no-op and must not trigger fallback.

## 5. Renderer Integration Rules

- Local applied results may carry an explicit output-language override:
  - `json` for structured JSON-like output, including token-preserving JSON-like output
  - `graphql` for GraphQL output
  - `null` for plain text or fallback-driven output
- Preserve the root output-language override in renderer session state so apply, reindent, snapshot restore, and reset stay consistent.
- Derived independent child panes must carry their own optional language override.
- Context-menu target resolution must use the pane's effective document language when present instead of re-detecting from pane text.
- Reindent eligibility remains semantic:
  - JSON-like canonical and token-preserving outputs are reindentable
  - GraphQL and text outputs are not

## 6. Test Expectations

- Strict JSON, NDJSON, JSON5, and Python-like inputs return `applied / json-like / canonical` with the expected `variant`.
- Truncated JSON and JSON-like object literals return `applied / json-like / token-preserving`.
- Unsupported canonical JSON-like values such as `{value: NaN}` fall through to token-preserving local success when token preservation is still possible.
- Malformed keys, comments, backticks, and raw newlines in quoted payloads still fail locally.
- Scalar JSON roots keep their existing local success behavior and do not force a JSON language override.
- Renderer and main consume the same `localResult` summary shape.
- Token-preserving local success must avoid fallback execution in both direct and context-pane flows.
- Root and child panes preserve explicit language overrides across apply, reindent, snapshot restore, and context-pane prettify.
- `pnpm test` passes.
- `pnpm check` passes.

## 7. File Summary

- Shared contract: [src/shared/prettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/prettifier.ts)
- Shared orchestration: [src/shared/localPrettifier.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/localPrettifier.ts)
- Shared formatter: [src/shared/jsonLikeTokenPreservingFormatter.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/shared/jsonLikeTokenPreservingFormatter.ts)
- Main prettifier integration: [src/main/prettifier/prettifierService.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/main/prettifier/prettifierService.ts)
- Renderer prettifier integration: [src/renderer/prettifier/prettifierService.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/prettifier/prettifierService.ts)
- Renderer output-language helper: [src/renderer/prettifier/localResultOutputLanguage.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/prettifier/localResultOutputLanguage.ts)
- Renderer session state: [src/renderer/app/session/prettifierSessionDomain.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/session/prettifierSessionDomain.ts)
- Renderer pane/view-model flow: [src/renderer/app/outputPaneDomain.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/outputPaneDomain.ts), [src/renderer/app/useOutputPaneController.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/app/useOutputPaneController.ts), and [src/renderer/components/outputPaneTypes.ts](/Users/hernantylim/Dev/sandbox/prettypretty/src/renderer/components/outputPaneTypes.ts)

## 8. Resolved Decisions

- This feature generalizes to the JSON-like family only. It does not introduce token-preserving formatters for GraphQL or other languages.
- The framework is generalized through shared result metadata and renderer language overrides, not through a fake universal malformed-language parser.
- Token-preserving local success is a final local success state. Fallback is only attempted after both canonical and token-preserving local attempts fail.
