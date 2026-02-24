# Learnings

Purpose: capture mistakes and failure patterns to avoid repeating.  
Do not add routine status updates, implementation history, or one-time decisions.

## Keep/Drop Rule

- Keep: issues that caused regressions, rework, inconsistent behavior, or test instability.
- Drop: project setup notes, neutral architecture choices, and "what we built" logs.

## Mistakes To Avoid

- Do not split input ingestion paths by trigger (`drop`, `paste`, `open file`); use one ingestion path or pane-switch behavior drifts.
- Do not let keyboard shortcuts and toolbar controls diverge; both must use the same mode guards and enable/disable rules.
- Do not rely on partial class assertions for style tests; assert exact class contracts so variants cannot drift silently.
- Do not style Monaco text metrics via external CSS selectors (for example `.view-lines`); set typography metrics in Monaco options or cursor/selection alignment can drift.
- Do not let JSON prettify indentation and Monaco indentation settings come from different constants; this causes visible guide mismatch.
- Do not mutate output text to implement search highlighting; use Monaco-native find/decorations so copy/save output remains accurate.
- Do not key output fold/view state to transient UI state; persist/restore by deterministic document identity.
- Do not maintain separate Monaco option sets for input/output that can drift; use one shared base and derive editable/read-only variants.
- Do not enable fold actions when there is no content; fold controls should be content-aware and no-op states should stay disabled.
- Do not bypass Monaco built-ins with CSS overlays for editor primitives (for example minimap); use Monaco options for stability and compatibility.
