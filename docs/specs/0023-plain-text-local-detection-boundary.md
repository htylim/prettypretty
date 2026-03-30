# 0023 Plain Text Local Detection Boundary

## 1. Current State

The shared local prettifier in `src/shared/localPrettifier.ts` currently tries the supported local format paths in this order:

1. JSON
2. NDJSON
3. JSON5
4. Python-like JSON normalization
5. GraphQL

If none of those paths succeeds, the function returns:

- `kind: 'failed'`
- `detection: 'malformed'`

That means any non-empty text that is not one of the supported formats is currently classified as malformed. A plain string such as `hello world` is not invalid structured data; it is just unrecognized plain text. The current behavior collapses these two different cases into the same result:

- recognized format, but malformed
- unrecognized plain text

That boundary leak is visible outside the shared module:

- `src/main/prettifier/prettifierService.ts` treats any local failure as fallback-eligible or passthrough-failed work.
- `src/renderer/app/usePrettifierRequestFlow.ts` can show fallback wait state or confirmation for content that is not actually malformed.
- `tests/unit/renderer/prettifier/prettifierService.test.ts` and `tests/unit/main/prettifier/prettifierService.test.ts` currently encode the malformed default for all local misses.

The renderer already has a separate fallback label helper in `src/renderer/prettifier/detectFallbackFormat.ts` that falls back to `text` when no format signal is found. The shared local prettifier does not currently preserve that distinction in its own contract.

## 2. Desired End State

The app must distinguish between:

- supported format input that failed local parse/format
- plain text that does not match a supported local format

Examples:

- `hello world`
  - local result is successful no-op text handling
  - output stays `hello world`
  - `localDetection` is `text`
  - fallback is not attempted
- `notes:\nship later`
  - same as above
- `SELECT * FROM users`
  - treat this as `text` for local prettifier purposes
  - the current product does not locally prettify SQL, so it is not a malformed local format
- `{bad`
  - local result remains `failed`
  - `localDetection` remains `malformed`
- `query Shipments {`
  - local result remains `failed`
  - `localDetection` remains `malformed`
- `42`
  - keep current behavior
  - this remains a successful local no-op through the existing JSON-family scalar-root path

Whitespace-only input is out of scope for this spec. It already avoids malformed handling and does not need to change to fix this bug.

## 3. Patterns To Follow

Use the existing ownership seams described in `docs/architecture.md`:

- shared local detection and parse/format ownership stays in `src/shared/*`
- main prettifier runtime in `src/main/prettifier/*` remains an adapter/orchestrator over the shared result
- renderer request flow in `src/renderer/app/*` continues to react to the shared result instead of re-deciding format classification

Follow the current shared-local-result pattern already used by `runLocalPrettifier(...)`:

- `kind: 'applied'` means the shared layer handled the input locally, even if the output is unchanged
- `kind: 'failed'` is reserved for cases where local parsing/formatting could not safely handle the text and fallback/passthrough policy must decide the next step

Follow the renderer fallback label pattern already present in `src/renderer/prettifier/detectFallbackFormat.ts`:

- no syntax signal should map to plain `text`
- malformed labeling should stay tied to known format signals, not to “anything local formatting did not recognize”

If the implementation needs reusable syntax-signal helpers, keep them in `src/shared/*` as pure helpers and let renderer label mapping remain a renderer concern. Do not move fallback-wait copy generation into shared code.

## 4. Deliverables

**architecture decisions**

- Keep the malformed-vs-text boundary owned by the shared local prettifier contract.
- Do not solve this in `src/main/prettifier/prettifierService.ts` or `src/renderer/app/usePrettifierRequestFlow.ts`. Those layers must consume the shared result, not reinterpret it.
- Keep renderer fallback-label presentation in `src/renderer/prettifier/detectFallbackFormat.ts`. If syntax-signal reuse is needed, extract shared pure helpers and consume them from both sides instead of duplicating heuristics.

**design decisions**

- Add a new local detection value: `text`.
- Non-empty input that does not match a supported local format and does not present a recognized malformed-format signal must return:
  - `kind: 'applied'`
  - `detection: 'text'`
  - `outputText: inputText`
- `malformed` must be reserved for inputs that present as one of the supported local formats but fail local parse/format.
- Plain text must not trigger fallback wait state, fallback confirmation, or fallback execution.
- Keep the current scalar-root JSON-family behavior unchanged. This spec does not reclassify accepted scalar roots as `text`.

**data models decisions**

- Extend `LocalDetection` in `src/shared/prettifier.ts` to include `text`.
- Widen any renderer/main applied-result type unions that currently only allow:
  - `json`
  - `ndjson`
  - `json5`
  - `python-like`
  - `graphql`
- Keep `failed` result unions restricted to actual failure detections such as `unsupported` and `malformed`.

**format-recognition decisions**

- Add an explicit recognized-format gate before returning `malformed`.
- The shared local prettifier must only return `malformed` after both of these are true:
  - no supported local formatter successfully handled the input
  - the input still carries a recognizable signal for a supported format family
- For this change, “supported format family” means the shared local prettifier's current local families:
  - `json`
  - `ndjson`
  - `json5`
  - `python-like`
  - `graphql`
- Do not treat renderer-only language labels such as SQL, YAML, XML, Markdown, JavaScript, or TypeScript as local malformed classifications unless this feature set is explicitly expanded in a separate spec.
- At minimum, recognized malformed candidates must continue to include:
  - JSON-like/object-like structured text such as `{bad`
  - malformed GraphQL operation/schema text such as `query Shipments {`
- Plain prose, notes, sentences, and other free-form text such as `hello world` must bypass malformed classification and resolve to `text`.
- Prefer a conservative signal test. When the shared layer cannot justify a supported-format signal, classify the input as `text`, not `malformed`.

**tests decisions**

- Add or update shared local prettifier unit coverage in `tests/unit/shared/localPrettifier.test.ts` for:
  - plain text returning `applied` + `text`
  - multi-line prose returning `applied` + `text`
  - malformed JSON-like text still returning `failed` + `malformed`
  - malformed GraphQL still returning `failed` + `malformed`
  - scalar roots remaining unchanged under the existing local-success path
- Add or update renderer prettifier service coverage in `tests/unit/renderer/prettifier/prettifierService.test.ts` for:
  - `prettifyDetailed('hello world')` returning `kind: 'applied'`, `localDetection: 'text'`, unchanged output
  - confirming malformed structured inputs still return `failed`
- Add or update main prettifier service coverage in `tests/unit/main/prettifier/prettifierService.test.ts` for:
  - plain text returning `status: 'applied-local'`
  - `fallbackExecutor.execute` not being called for plain text
  - malformed structured input behavior staying unchanged
- Add renderer request-flow or app-level coverage for:
  - switching to output with plain text does not show fallback wait state
  - large plain text does not show the large-content fallback confirmation modal
- Add one E2E regression in `tests/e2e/app-flows.spec.ts` that pasting plain text keeps the text unchanged locally even when a fallback agent is configured.

**code changes decisions**

- Update `src/shared/localPrettifier.ts` so the terminal “no local format matched” path no longer defaults to `malformed`.
- Keep the change localized to shared classification logic plus the type plumbing needed by main/renderer adapters.
- Do not add new fallback branches for plain text. The existing applied-local path should be reused.
- Keep comments/docstrings focused on the contract boundary:
  - why `text` is a successful no-op result
  - why `malformed` is now limited to recognized supported formats

**documentation decisions**

- Update `docs/architecture.md` if the implementation introduces a new shared helper or clarifies the `text` vs `malformed` ownership boundary beyond what is already documented.
- Update `docs/ui-spec.md` if it currently describes plain text as malformed or implies fallback for arbitrary unrecognized text.
- Update `docs/learnings.md` with the final rule that unsupported-format absence is not the same as malformed recognized syntax.

## 5. Acceptance Criteria

- [ ] Entering plain text such as `hello world` produces unchanged output through the local applied path.
- [ ] Plain text returns `localDetection: 'text'`.
- [ ] Plain text does not trigger fallback execution, fallback wait UI, or fallback confirmation UI.
- [ ] Malformed recognized formats such as `{bad` and `query Shipments {` still return `localDetection: 'malformed'`.
- [ ] Existing supported local success cases for JSON, NDJSON, JSON5, Python-like normalization, GraphQL, and scalar roots continue to work.
- [ ] Main and renderer adapter seams only receive type/result plumbing updates; the malformed-vs-text decision remains in shared code.
- [ ] Unit coverage exists for shared, renderer, and main seams touched by this change.
- [ ] E2E coverage exists for the user-visible plain-text regression.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.
- [ ] `pnpm test:e2e` passes.

## 6. File Summary

Expected modified files:

- `docs/specs/0023-plain-text-local-detection-boundary.md`
- `src/shared/prettifier.ts`
- `src/shared/localPrettifier.ts`
- optional new shared pure helper if syntax-signal extraction improves clarity
- `src/renderer/prettifier/prettifierService.ts`
- `src/main/prettifier/prettifierService.ts`
- `src/renderer/app/usePrettifierRequestFlow.ts` only if type plumbing or explicit guard coverage requires it
- `tests/unit/shared/localPrettifier.test.ts`
- `tests/unit/renderer/prettifier/prettifierService.test.ts`
- `tests/unit/main/prettifier/prettifierService.test.ts`
- renderer app/request-flow unit tests that cover fallback wait and confirmation behavior
- `tests/e2e/app-flows.spec.ts`
- `docs/architecture.md` if needed
- `docs/ui-spec.md` if needed
- `docs/learnings.md`

## 7. Open Questions / Resolved Decisions

**resolved decisions**

- Plain unrecognized text must be modeled as successful local handling, not as malformed input.
- The new shared local detection value is `text`.
- `malformed` is reserved for recognized supported format families that fail parse/format.
- “Recognized supported format families” here only means the formats the shared local prettifier currently owns, not renderer-only language hints.
- This spec does not change the current behavior for accepted scalar roots.
- This spec does not broaden the set of supported prettified formats. It only fixes the classification boundary for unrecognized plain text.

**open questions**

- None. If implementation discovers an ambiguous input class that cannot be conservatively separated between recognized malformed syntax and plain text, the coding agent must stop and ask for clarification before changing the boundary rules.
