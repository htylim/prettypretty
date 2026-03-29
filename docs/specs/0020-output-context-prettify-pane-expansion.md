# Output Context Prettify Pane Expansion

## 1. Current State

Output panes are read-only Monaco editors. They support folding, pane splitting, pane reuse, pane descendant invalidation, and output-language highlighting, but they do not expose any right-click menu or pane-targeted prettify action.

Today, if output contains embedded structured data inside a string scalar, the user must manually copy that embedded text into another `prettypretty` window to format it. That breaks the current pane workflow and duplicates effort.

Current renderer/runtime boundaries already matter here:

- `src/main/prettifier/*` owns prettifier execution and fallback agent execution.
- `src/shared/prettifier.ts` owns the cross-process request/response contract.
- `src/renderer/app/usePrettifierFlow.ts` currently owns root-output prettify orchestration and window-level fallback wait state.
- `src/renderer/app/useOutputPaneController.ts` already owns pane-chain reuse and descendant invalidation.
- `src/renderer/components/useOutputEditorRuntime.ts` already owns Monaco runtime behavior for output panes.

The main architectural gap is that pane-targeted prettify cannot reuse the current root-output flow as-is, because the existing flow mutates root output state. A pane-targeted flow needs the same prettifier pipeline, but it must apply its final text into a child pane instead of replacing the root output.

This spec must be implemented from current code and current docs. Historical spec files are archival only and must not drive architecture decisions.

## 2. Desired End State

The product must support pane-targeted prettify from output-mode right-clicks.

### User-visible behavior

- Right-clicking anywhere inside any output pane always opens a context menu.
- The menu contains exactly one product action for this feature: `Prettify ...`.
- If the clicked semantic value has a resolvable name, the label is `Prettify <name>...`.
- If there is any active text selection in that pane, the action is disabled.
- If there is no selection, the app resolves the right-click location against the current outer-syntax adapter for that pane.
- If the clicked target is a semantic string scalar whose decoded content is concrete and non-empty, the action is enabled.
- If the clicked target is not a semantic string scalar, cannot be decoded safely, or would result in a no-op, the action is disabled from the start.
- Clicking a key/field name targets its associated value, not the key token itself.
- Clicking inside the string scalar value targets that same value.
- Unnamed list items or values use the generic label `Prettify ...`.

### Prettify execution behavior

- When the user triggers the action, the app must take the actual scalar value, not surrounding quotes, commas, colons, or delimiters.
- Escapes must be decoded through the syntax adapter, not by ad-hoc trimming or regex stripping.
- The decoded text is sent through the same prettifier pipeline already used elsewhere:
  - local parser first
  - fallback agent selection when needed
  - large-content confirmation when needed
  - streamed fallback progress
  - cancel support
  - passthrough behavior when prettification fails
- The final output, whether prettified or passthrough, opens in the direct child pane of the clicked pane.
- Re-opening from the same parent pane replaces that parent’s child pane and closes every descendant pane to the right.
- Recursive prettify is allowed: a pane opened from a prior prettify action may itself expose another `Prettify ...` target and open another child pane.

### Supported outer syntax strategy

This feature targets all supported structured outer syntaxes, but not all in one implementation pass.

- Phase 1 must ship the foundation plus JSON / NDJSON support.
- Later phases extend the same adapter architecture, one outer-syntax family at a time.
- Non-structured outer syntaxes such as `plaintext` and `markdown` do not have semantic string-scalar nodes for this feature. Their menu still opens, but `Prettify ...` remains disabled.

### Example

For a JSON value like this:

```json
{
  "query": "query ListShipments(\n  $first: Int\n) {\n  shipments {\n    request_id\n  }\n}"
}
```

Right-clicking on `"query"` or anywhere inside its string value must offer `Prettify query...`.

If triggered:

1. the app resolves the JSON string scalar value,
2. decodes the actual string contents into multiline GraphQL text,
3. runs the normal prettifier pipeline,
4. opens the result in the child pane of the clicked pane.

## 3. Patterns To Follow

Use these current code patterns and ownership boundaries.

- Keep `src/main` as the only owner of prettifier execution and fallback process execution.
- Keep `src/shared` as the owner of typed cross-process contracts and pure shared logic only.
- Keep renderer free of direct Electron and Node runtime ownership.
- Keep `App.tsx` composition-only.
- Keep pane layout, pane focus, pane chain state, and Monaco interaction in renderer.
- Keep output-pane mechanics generic. The pane strip should not become “prettify specific”.
- Split pure syntax-target resolution from runtime hooks that own Monaco, DOM timing, session state, or IPC.
- Reuse existing pane invalidation mechanics instead of creating a second descendant-closing system.
- Reuse the existing window-level fallback wait flow for pane-targeted prettify in this spec. Do not introduce pane-local wait/cancel state here.
- Never enable `Prettify ...` unless the app can already prove it will extract a concrete non-empty string value and send it to the prettifier pipeline.
- Do not implement extraction by trimming punctuation around arbitrary text slices. Resolve semantic string scalars through syntax adapters.

Relevant code patterns:

- `src/renderer/app/useOutputPaneController.ts`
- `src/renderer/components/useOutputEditorRuntime.ts`
- `src/renderer/app/usePrettifierFlow.ts`
- `src/renderer/app/session/usePrettifierRuntime.ts`
- `src/main/prettifier/prettifierService.ts`
- `src/shared/prettifier.ts`

## 4. Deliverables

### architecture decisions

- Add a renderer-owned output context-menu runtime and view component.
  - Reason: the menu is purely pane/UI state derived from Monaco hit-testing and pane selection state.
  - Main does not need to own popup construction for this phase.
- Extract a reusable renderer prettify-request orchestration layer from the current root-output flow.
  - This new layer must own request ids, stale-response guards, fallback progress subscription, fallback modal/wait/cancel behavior, and calls to the existing main-process prettifier service.
  - Root-output prettify and pane-targeted prettify must both use this shared orchestration layer.
- Keep pane-targeted result application in renderer.
  - Root output keeps using its existing state path.
  - Pane-targeted prettify applies results through `useOutputPaneController`.
- Model outer-syntax support as an adapter registry keyed by outer syntax family.
  - Each adapter receives document text plus a right-click location.
  - Each adapter returns either a concrete prettify target or `null`.
  - Adapters must decode semantic string scalar values only.
- Treat non-structured syntaxes as explicit “no target” adapters or equivalent disabled behavior.
- Add one shared prettify trigger for this feature, for example `context-pane-prettify`, so telemetry and main-process request validation can distinguish it from ingest and mode-switch requests.

### phase decisions

Each phase must be small enough for one implementation subagent to complete without context compaction.

#### Phase 1: Foundation + JSON / NDJSON vertical slice

- Add the renderer-owned context menu.
- Add the reusable prettify-request orchestration layer.
- Add JSON and NDJSON target adapters.
- Support pane-targeted prettify from any output pane, including recursive pane chains.
- Reuse window-level fallback modal/wait/cancel behavior.
- Update current-state docs for shipped Phase 1 behavior.

#### Phase 2: YAML adapter

- Add YAML target resolution for:
  - quoted scalars
  - plain scalars that are semantically strings
  - block scalars (`|`, `>`)
- Add YAML-specific tests and current-state doc updates.

#### Phase 3: JavaScript / TypeScript adapters

- Add JS/TS target resolution for:
  - quoted string literals
  - template literals only when they are plain strings with no interpolation
- Explicitly disable interpolated template literals.
- Add JS/TS-specific tests and current-state doc updates.

#### Phase 4: GraphQL adapter

- Add GraphQL target resolution for:
  - quoted string values
  - block string values
- Add GraphQL-specific tests and current-state doc updates.

#### Phase 5: XML adapter

- Add XML target resolution for:
  - attribute values
  - text nodes / CDATA nodes when treated as string payloads by the adapter
- Add XML-specific tests and current-state doc updates.

#### Phase 6: SQL adapter

- Add SQL target resolution for quoted string literals.
- Add SQL-specific tests and current-state doc updates.

### execution process decisions

The implementation process for this spec is part of the spec and is required.

- One main agent acts as the orchestrator for the full spec.
- The orchestrator launches one implementator subagent per phase.
- Phases are implemented sequentially, one at a time.
- The orchestrator must wait for the implementator to finish before doing anything else for that phase.
- The implementator owns the phase’s code changes, tests, and documentation updates.
- Before handing control back, the implementator must:
  - complete the phase implementation
  - run that phase’s required quality gates
  - launch a code-reviewer subagent on its own work
- The code-reviewer subagent reviews the implementator’s code and returns findings.
- The implementator must fix every reviewer finding that is confirmed as a real issue.
- After fixes, the implementator must rerun the required quality gates.
- Only after code, tests, docs, and reviewer-driven fixes are complete may the implementator report the phase as done.
- The orchestrator then reviews the returned work.
- If important follow-up fixes are still needed, the orchestrator launches another implementator subagent for those fixes before moving on.
- If the phase is acceptable, the orchestrator launches the next implementator subagent for the next phase.
- This cycle repeats until all phases in this spec are complete.

### design decisions

- The menu must open on every right-click in output panes.
- The menu must visually show the disabled state when the action is unavailable.
- The menu contains only one action in this spec: `Prettify ...`.
- If a resolvable key or field name exists, the menu label is `Prettify <name>...`.
- If there is any selection, the action is disabled regardless of the clicked location.
- If the selection is empty, the click location decides the candidate.
- Clicking a key/field token resolves its associated value node.
- Clicking an unnamed list item or unnamed scalar uses the generic label.
- If the candidate decodes to an empty string, the action is disabled.
- If the target is a number, boolean, null-like literal, object node, array node, or ambiguous text region, the action is disabled.
- If the prettifier returns passthrough output, the pane still opens with that passthrough text.

### data model decisions

- Add a pure renderer-facing target model, for example:
  - `ContextPrettifyTarget`
  - fields:
    - `label: string | null`
    - `decodedText: string`
    - `sourceRange`
    - `paneDocumentLanguage`
    - `sourceKind: 'string-scalar'`
- Add a pure adapter interface, for example:
  - `ContextPrettifyTargetResolver`
  - input: document text + click position
  - output: `ContextPrettifyTarget | null`
- Add a renderer menu state model, for example:
  - anchor coordinates
  - pane id
  - target availability
  - rendered label
- Add a new prettify trigger in `src/shared/prettifier.ts` for pane context prettify.
- Keep pane content storage generic.
  - Pane content continues to use existing independent-text content for derived prettify results.
  - Do not add prettify-specific pane-content types unless a later phase proves they are required.

### tests decisions

Every phase must include unit coverage, integration-style Vitest coverage, and Electron e2e coverage for the behavior introduced in that phase.

#### Phase 1 unit tests

- target-registry resolution by outer syntax
- JSON key-to-value target resolution
- JSON string-scalar decode and label derivation
- NDJSON target resolution within individual records
- selection-present disables the action
- empty/ambiguous/non-string targets disable the action
- reusable request-orchestration stale-response guard
- reusable request-orchestration cancel path
- pane-targeted passthrough still opens a pane
- pane reopen trims descendants through existing pane controller behavior

#### Phase 1 integration-style Vitest tests

- right-click on a JSON key opens enabled menu item
- right-click inside the matching JSON string value opens enabled menu item
- right-click with an active selection shows disabled item
- triggering the action opens a child pane with prettified output
- triggering the action from a child pane opens a grandchild pane
- re-triggering from a parent pane replaces its child and removes descendants
- fallback confirmation and fallback agent selection reuse the existing modal flow
- fallback wait/cancel reuse the existing window-level wait flow

#### Phase 1 e2e tests

- JSON example with embedded multiline GraphQL string opens a child pane
- malformed embedded text reuses fallback flow and lands result in a child pane
- selection keeps `Prettify ...` disabled
- recursive pane expansion works
- reopening a parent pane closes descendants to the right

#### Later-phase tests

- Each later syntax adapter phase adds:
  - adapter-specific unit tests
  - adapter-specific integration-style Vitest coverage
  - at least one e2e path proving right-click target resolution for that syntax family

#### Quality gates per phase

- Run `pnpm test`
- Run `pnpm check`
- Every new renderer module/component must have a unit test file
- Each phase must leave existing tests green before the next phase begins

### code changes decisions

Phase 1 must introduce these seams.

- A new pure adapter area in renderer for context-prettify target resolution
- A renderer context-menu component for output panes
- Output-editor runtime extensions for:
  - right-click hit-testing
  - selection-state checks
  - menu open/close callbacks
- A reusable prettify-request orchestration hook/service extracted from the current root-output flow
- Root-output flow refactored to consume that new request layer instead of owning a completely separate orchestration path
- App-controller orchestration for:
  - opening pane-targeted prettify requests
  - applying final results into child panes
  - maintaining pane descendant invalidation through existing pane-controller entry points
- Shared prettifier contract updates for the new trigger
- Main prettifier payload validation updates for the new trigger only

Later phases should add adapter modules and tests without redesigning Phase 1 seams.

### documentation decisions

- This spec documents the phased rollout and the semantic-string-scalar rule.
- Current-state docs must only be updated when a phase ships. Do not document future behavior in current-state docs before that phase is implemented.
- Each shipped phase must update the relevant docs in the same phase:
  - `docs/ui-spec.md`
  - `docs/architecture.md` if ownership or runtime seams change
  - `README.md` when the current product shape changes materially
  - `docs/learnings.md`
- The documentation for this feature must explicitly state:
  - pane-targeted prettify only targets semantic string scalars
  - selection disables the action
  - non-structured syntaxes keep the action disabled
  - syntax-family support is phased

## 5. Acceptance Criteria

- [x] Right-clicking anywhere inside any output pane opens a context menu.
- [x] The menu contains only one action for this feature: `Prettify ...`.
- [x] If there is an active selection in the clicked pane, the action is disabled.
- [x] If there is no selection and the clicked location resolves to a semantic string scalar with concrete non-empty decoded text, the action is enabled.
- [x] If a field/key name exists, the enabled label is `Prettify <name>...`.
- [x] If no field/key name exists, the enabled label is `Prettify ...`.
- [x] Clicking a key/field token targets its associated value node.
- [x] Ambiguous regions, numbers, booleans, null-like literals, arrays, objects, empty strings, and undecodable targets all show the action disabled.
- [x] Triggering the action runs the same prettifier pipeline used elsewhere, including fallback agent selection, fallback confirmation, streamed progress, cancel support, and passthrough behavior.
- [x] Phase 1 lands foundation plus JSON / NDJSON support without breaking root-output prettify behavior.
- [x] Pane-targeted prettify opens or replaces the direct child pane of the clicked pane.
- [x] Reopening from a parent pane removes descendants to the right before inserting replacement content.
- [x] Recursive pane-targeted prettify works across pane chains.
- [x] Passthrough output still opens a pane when the action was enabled and triggered.
- [x] Window-level fallback wait/cancel behavior is reused for pane-targeted prettify in this spec.
- [x] Root-output prettify and pane-targeted prettify share a reusable request-orchestration layer instead of duplicating fallback orchestration logic.
- [x] Phase 2 adds YAML adapter support without redesigning the Phase 1 architecture.
- [x] Phase 3 adds JS/TS adapter support without redesigning the Phase 1 architecture.
- [x] Phase 4 adds GraphQL adapter support without redesigning the Phase 1 architecture.
- [x] Phase 5 adds XML adapter support without redesigning the Phase 1 architecture.
- [x] Later phases add SQL without redesigning the Phase 1 architecture.
- [x] `plaintext` and `markdown` keep the action disabled because they do not provide semantic string-scalar targets for this feature.
- [x] Every phase ships with unit tests, integration-style Vitest coverage, and Electron e2e coverage for that phase’s user-visible behavior.
- [x] Every phase passes `pnpm test` and `pnpm check` before the phase is considered done.
- [x] Each phase follows the orchestrator -> implementator -> reviewer -> fix -> recheck cycle defined in this spec.

## 6. File Summary

Planned Phase 1 file areas:

- New: `docs/specs/0020-output-context-prettify-pane-expansion.md`
- New: renderer context-prettify target adapter modules and tests
- New: renderer output context-menu component and tests
- New: reusable renderer prettify-request orchestration hook/service and tests
- Modify: `src/renderer/components/useOutputEditorRuntime.ts`
- Modify: `src/renderer/components/OutputEditor.tsx`
- Modify: `src/renderer/components/OutputPaneStrip.tsx`
- Modify: `src/renderer/components/EditorShell.tsx`
- Modify: `src/renderer/app/usePrettifierFlow.ts`
- Modify: `src/renderer/app/useAppController.ts`
- Modify: `src/renderer/app/session/usePrettifierRuntime.ts` if the extracted request layer needs a thinner runtime seam
- Modify: `src/shared/prettifier.ts`
- Modify: `src/main/prettifier/prettifierTypes.ts`
- Modify: phase-shipped current-state docs and tests

Planned later-phase file areas:

- New or modify: YAML adapter modules and tests
- New or modify: JS/TS adapter modules and tests
- New or modify: GraphQL adapter modules and tests
- New or modify: XML adapter modules and tests
- New or modify: SQL adapter modules and tests
- Modify: current-state docs for each shipped phase

## 7. Open Questions / Resolved Decisions

### Resolved decisions

- Action label uses `Prettify ...`, not `Expand ...`.
- Selection always disables the action.
- The click location, not selected text, determines the candidate.
- The action is enabled only for semantic string scalars with concrete non-empty decoded text.
- Numbers, booleans, null-like literals, arrays, objects, and ambiguous regions are not valid targets.
- Passthrough output still opens a pane when the action was enabled and executed.
- Window-level fallback wait/cancel flow is reused in this spec.
- Outer-syntax support is phased:
  - Phase 1: JSON / NDJSON
  - Phase 2: YAML
  - Phase 3: JavaScript / TypeScript
  - Phase 4: GraphQL
  - Phase 5: XML
  - Phase 6: SQL
- `plaintext` and `markdown` remain disabled for this feature.
- Implementation proceeds phase-by-phase with an orchestrator, one implementator at a time, mandatory reviewer subagent pass, reviewer-driven fixes, and full rechecks before moving to the next phase.
- This spec is based on current code and current docs only. Historical spec files are not source of truth for this work.

### Open questions

- None at spec-writing time. If a phase uncovers ambiguity in a specific syntax adapter, that phase must stop and clarify the ambiguity before implementation continues.
