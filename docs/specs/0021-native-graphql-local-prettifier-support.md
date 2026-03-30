# 0021 Native GraphQL Local Prettifier Support

## 1. Current State

`src/shared/localPrettifier.ts` only supports JSON-family local formats: JSON, NDJSON, JSON5, and Python-like dict literals. Its success path assumes every parsed value can be emitted with `JSON.stringify(...)`, which makes the current contract effectively JSON-only even though the app now recognizes more output languages elsewhere.

The renderer already has native GraphQL display affordances:

- `src/renderer/output/detectOutputLanguage.ts` recognizes GraphQL operations and SDL.
- `src/renderer/output/registerGraphqlLanguage.ts` registers Monaco syntax highlighting for GraphQL.
- `src/renderer/output/contextPrettifyTarget.ts` already resolves GraphQL quoted string values and block string values as context-prettify targets.

That means the app can correctly identify and extract GraphQL text from an output pane, but the extracted text still gets passed into the shared local prettifier, which does not understand GraphQL documents. The result is the exact failure reported in the current product:

- right-click a JSON field like `"query"`
- `Prettify...` extracts the GraphQL string correctly
- the shared prettifier reports the text as `malformed`
- the user either gets passthrough output or a fallback-agent prompt instead of local GraphQL formatting

This is a product gap because GraphQL documents are a common payload format in logs, API tooling, and embedded request bodies. The app already presents GraphQL as a supported pane language, but not as a supported local prettify format.

## 2. Desired End State

The app must support GraphQL documents as a native local prettify format anywhere the current shared prettifier is used.

That includes:

- pasting a valid GraphQL operation into the input editor and switching to output
- pasting a valid GraphQL SDL document into the input editor and switching to output
- triggering `Prettify...` on any existing context-prettify source that decodes to a valid GraphQL document string

For the reported example, right-clicking the JSON `query` field should open a child pane with formatted GraphQL, locally, with no fallback involved.

Example desired output for the extracted `query` value:

```graphql
query ListShipments(
  $customer_account_id: String
  $order_id: String
  $date_from: ISODateTime
  $date_to: ISODateTime
  $order_date_from: ISODateTime
  $order_date_to: ISODateTime
  $tracking_number: String
  $alternate_tracking_id: String
  $voided: Boolean
  $first: Int
  $after: String
) {
  shipments(
    customer_account_id: $customer_account_id
    order_id: $order_id
    date_from: $date_from
    date_to: $date_to
    order_date_from: $order_date_from
    order_date_to: $order_date_to
    tracking_number: $tracking_number
    alternate_tracking_id: $alternate_tracking_id
    voided: $voided
  ) {
    request_id
    complexity
    data(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          legacy_id
          order_id
          user_id
          warehouse_id
          pending_shipment_id
          profile
          picked_up
          needs_refund
          refunded
          delivered
          shipped_off_shiphero
          dropshipment
          completed
          created_date
          total_packages
          ready_to_ship
        }
      }
    }
  }
}
```

Malformed GraphQL must still follow the current malformed-input path:

- local parse fails cleanly
- passthrough or fallback behavior remains unchanged
- the user should not get a partial or guessed formatter result

The app-level indent preference must continue to matter. GraphQL output should respect the current `indentSize` instead of introducing a hard-coded GraphQL-only indentation rule.

## 3. Patterns To Follow

- Keep local formatting logic in `src/shared`. Both renderer and main already depend on the shared local prettifier, and GraphQL support must behave the same in both code paths.
- Keep context-prettify target extraction and local formatting separate. `src/renderer/output/contextPrettifyTarget.ts` should continue to answer only one question: what concrete string payload did the user target?
- Keep renderer orchestration unchanged where possible. `src/renderer/app/usePrettifierRequestFlow.ts` already treats local success, passthrough, fallback prompting, wait state, and cancelation consistently for root output and pane-targeted prettify.
- Reuse existing indent-remapping behavior instead of introducing a second indentation system. The existing `reindentText` helper is the right pattern if a formatter emits canonical indentation that must be aligned to the app preference.
- Let rendered text drive syntax highlighting. `detectOutputLanguage(...)` already recognizes GraphQL, so once the local prettifier returns formatted GraphQL text, no extra pane metadata should be threaded through the controller.

## 4. Deliverables

**architecture decisions**

- Add GraphQL as a first-class local prettify format in `src/shared/localPrettifier.ts`.
- Keep GraphQL parse/print ownership entirely in `src/shared`. If a dedicated helper is added, `src/shared/graphqlPrettifier.ts` owns the formatter logic and `src/shared/localPrettifier.ts` owns the shared format-selection contract.
- Use a GraphQL formatter that preserves comments and block-string semantics. In practice that means using Prettier's GraphQL printer, because `graphql.print(...)` drops comments and a post-print indentation remap can change block-string values.
- Allow the shared local-prettifier contract to become async for GraphQL support. Both renderer and main already run prettify flows through async seams, so the contract expansion stays inside the existing prettifier boundaries.
- Apply the requested app `indentSize` at GraphQL format time instead of formatting canonically and remapping afterward.
- Keep `src/main/prettifier/prettifierService.ts` and `src/renderer/prettifier/prettifierService.ts` as thin adapter seams. They may accept the new `graphql` detection and forward shared results, but they must not grow GraphQL-specific parse/format branches of their own.

**design decisions**

- Valid GraphQL operations, fragments, and SDL/type-system documents are in scope.
- GraphQL support applies to both root-input prettify and context-pane prettify because both flows already share the same local prettifier.
- Context-menu targeting rules do not expand in this spec. Existing JSON/YAML/JavaScript/TypeScript/GraphQL/XML/SQL extraction rules stay as they are; only the formatter-side capability changes.
- Malformed GraphQL remains a local `malformed` result and continues through the existing fallback/passthrough decision flow.
- Fallback copy should label GraphQL inputs as `GraphQL` instead of generic `text` when format detection can tell that the malformed input is GraphQL-like.

**data model decisions**

- Extend `LocalDetection` in `src/shared/prettifier.ts` with `graphql`.
- Update renderer and main prettifier result types so `graphql` is treated as a successful local detection, not a fallback-only format.
- Keep fallback status values, request triggers, and pane-target types unchanged.
- If a dedicated GraphQL formatter helper is introduced, keep it in `src/shared` and keep it pure.

**tests decisions**

- Add shared local-prettifier unit coverage for:
  - GraphQL operation formatting
  - GraphQL fragment formatting
  - GraphQL SDL formatting
  - GraphQL block string formatting
  - malformed GraphQL returning `failed` with `detection: 'malformed'`
  - non-default `indentSize` handling for GraphQL output
- Update renderer prettifier-service tests to cover successful local GraphQL formatting and malformed GraphQL passthrough.
- Update main prettifier-service tests to prove GraphQL local success avoids fallback execution and reports `localDetection: 'graphql'`.
- Update fallback-format label tests so GraphQL-like input maps to `GraphQL`.
- Add or update tests for the shared indentation helper if it is moved out of the renderer.
- Add a user-visible coverage case for the reported workflow: JSON log payload with an escaped GraphQL `query` string, right-click `query`, choose `Prettify...`, child pane opens locally formatted GraphQL.
- Run `pnpm check` as the required non-E2E gate.
- Run `pnpm test:e2e` because this changes user-visible Electron behavior.

**code changes decisions**

- Refactor `src/shared/localPrettifier.ts` so JSON-family formatting and GraphQL formatting do not share the same `JSON.stringify(...)` assumption.
- Introduce a GraphQL-specific shared helper such as `src/shared/graphqlPrettifier.ts` if that keeps the shared local-prettifier module readable.
- Move `reindentText` into `src/shared` so structured-data outputs and renderer reindent transitions share one implementation, but do not force GraphQL through that remap path.
- If `reindentText` moves, delete the duplicate renderer-only ownership pattern and have both renderer and shared prettifier callers consume the shared helper instead of keeping parallel implementations.
- Update `src/renderer/prettifier/detectFallbackFormat.ts` so GraphQL-like malformed text is labeled correctly in fallback UX.
- Do not change `src/renderer/output/contextPrettifyTarget.ts` unless implementation proves there is a real extraction bug separate from formatting.
- Do not add GraphQL-specific formatting branches to `src/main/prettifier/prettifierService.ts`, `src/renderer/prettifier/prettifierService.ts`, controller hooks, or view components. Those modules should only consume the shared local-prettifier result.

**documentation decisions**

- After implementation, update `README.md` to list GraphQL under local prettify support.
- After implementation, update `docs/ui-spec.md` so GraphQL appears under supported local formats, not only under pane-targeted string extraction.
- After implementation, update `docs/dependencies-and-tools.md` to document the `graphql` runtime dependency.
- After implementation, update `docs/architecture.md` if a new shared GraphQL formatter module is added.
- After implementation, update `docs/learnings.md` with the durable pattern: text AST formats should use dedicated formatter paths instead of being forced through JSON serialization assumptions.

## 5. Acceptance Criteria

- [ ] A valid GraphQL operation pasted into the input editor is prettified locally with no fallback and renders with GraphQL language detection.
- [ ] A valid GraphQL SDL/type-system document pasted into the input editor is prettified locally with no fallback.
- [ ] Triggering `Prettify...` on an existing context-prettify source that decodes to valid GraphQL text opens a child pane with locally formatted GraphQL.
- [ ] The reported JSON `query` payload flow succeeds locally and no longer reports the GraphQL text as malformed.
- [ ] Local prettifier responses report `localDetection: 'graphql'` for successful GraphQL formatting in both renderer and main paths.
- [ ] Malformed GraphQL still resolves through the existing malformed-input path and does not produce partial output.
- [ ] GraphQL output respects the current `indentSize` when it is formatted, including non-default values.
- [ ] Existing JSON, NDJSON, JSON5, and Python-like local prettify behavior remains unchanged.
- [ ] `pnpm check` passes after implementation.
- [ ] `pnpm test:e2e` passes after implementation.

## 6. File Summary

**new spec file**

- `docs/specs/0021-native-graphql-local-prettifier-support.md`

**expected implementation files**

- `package.json`
- `src/shared/prettifier.ts`
- `src/shared/localPrettifier.ts`
- `src/shared/graphqlPrettifier.ts` or equivalent new shared helper
- `src/shared/reindentText.ts` if the existing renderer helper is promoted to shared
- `src/main/prettifier/prettifierService.ts`
- `src/renderer/prettifier/prettifierService.ts`
- `src/renderer/prettifier/detectFallbackFormat.ts`
- `tests/unit/shared/localPrettifier.test.ts`
- `tests/unit/main/prettifier/prettifierService.test.ts`
- `tests/unit/renderer/prettifier/prettifierService.test.ts`
- `tests/unit/renderer/prettifier/detectFallbackFormat.test.ts`
- `tests/e2e/app-flows.spec.ts`
- `README.md`
- `docs/ui-spec.md`
- `docs/dependencies-and-tools.md`
- `docs/architecture.md`
- `docs/learnings.md`

## 7. Open Questions / Resolved Decisions

**resolved decisions**

- Support both GraphQL operations and SDL documents. The app already treats both as GraphQL in output-language detection, so local prettify should not split them into separate capabilities.
- Keep GraphQL on the shared local-prettifier path so root-output prettify and pane-targeted prettify stay behaviorally aligned.
- Keep GraphQL formatting native and local. This is not a fallback-agent feature.
- Respect the existing app indent preference for GraphQL output.
- Prefer the synchronous `graphql` parser/printer path over async runtime Prettier.

**open questions**

- GraphQL comments and block strings require a semantics-preserving formatter path. Do not ship an implementation that drops comments or rewrites block-string payloads just to reuse the generic indentation remap.
