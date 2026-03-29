# Output Embedded Prettify Context Menu And Pane Reuse

## Status

Removed on March 28, 2026.

The renderer-owned embedded-prettify workflow was rolled back. The feature lived in the wrong layer: output-editor selection, context-menu actions, and pane-local prettification were being orchestrated in the renderer instead of going through the main prettifier service.

## Current State

- The reusable pane-strip platform remains.
- Output mode has no embedded-selection highlight behavior.
- Output mode has no custom right-click actions.
- Output mode has no `Prettify in Pane` action.
- Output mode has no `Prettify & Replace` action.
- Current product flow keeps output root-only, so toolbar split controls stay inactive except for the root `1 of 1` state.

## Architectural Constraint

If this workflow is rebuilt, it must follow these rules:

- Any pane-targeted prettification must call the main prettifier service through IPC.
- Renderer code may own pane layout, viewport, focus, and Monaco presentation state only.
- Product-specific extraction, selection normalization, and formatting execution must not live as a parallel renderer-only pipeline.
- The pane-strip platform must stay generic so future pane content strategies do not require another controller rewrite.

## Historical Note

This spec is retained only as an archival marker for the removed feature.

- Use [0016](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0016-output-structural-split-pane-stage-one.md) and [0017](/Users/hernantylim/Dev/sandbox/prettypretty/docs/specs/0017-output-structural-split-pane-recursive-chain-and-snap-navigation.md) only as historical references for pane-strip mechanics.
- Do not treat this document as current product behavior.
