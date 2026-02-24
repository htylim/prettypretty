# Learnings

## 2026-02-22

- Initial scaffold established with Electron + React + TypeScript + Vite + Tailwind.
- Local quality gates are hook-enforced.
- Renderer-to-test pairing script is used instead of a coverage threshold target.
- Empty-state CTA should render as one concise line, with an inline button when only part of the copy is interactive.
- Mode-switch controls are clearer as segmented toggles that expose current active state and keep UI state synchronized with rendered content.
- Input ingestion should be centralized so drop, paste, and click-open follow identical load-and-switch behavior while manual typing stays in input mode.

## 2026-02-23

- Toolbar actions that depend on output context should stay visible and use disabled state in input mode, then become enabled in output mode to preserve stable toolbar layout.
- When porting a visual direction from a mockup, extract semantic theme tokens first (typography, surfaces, accents, borders) and map them onto existing component structure instead of reusing mockup feature logic.
- Keep theme switching architecture stable (`data-theme` on root), and move UI parity work to CSS tokens + semantic class names so behavior tests stay unchanged.
- Action buttons in the toolbar should use one shared style (`.btn`) for consistent affordance; use segmented controls (`.segmented` + `.seg`) for toggle behavior instead of button variants.
- Documentation split works best when `docs/ui-spec.md` defines interaction/state behavior and `docs/design-style.md` owns visual tokens, palettes, typography, and component styling rules.
- For visual consistency tests, assert exact class parity (not partial class inclusion) so style variants cannot silently diverge.

## 2026-02-24

- For IDE-grade output upgrades, capture package choice in spec first (Monaco vs alternatives) and lock explicit reasons (parity, ecosystem maturity, malformed-input behavior) before implementation tasks.
- For malformed structured text, language detection should be heuristic and parser-independent so syntax highlighting can still work even when prettification fails.
- When optional UX controls are deferred (for example line-number visibility), keep a dedicated config seam in the implementation instead of adding premature state/settings plumbing.
- Monaco search highlighting should use editor decorations rather than mutating output strings, so copy/save behavior stays content-accurate.
- Fold/view persistence for read-only output works reliably when keyed to deterministic output identity (hash + length) and restored through Monaco view state APIs.
- When output text is app-formatted JSON, Monaco indentation settings (`tabSize`, `detectIndentation`, `insertSpaces`) should share the same source constant as JSON stringify spacing to avoid visual guide drift.
- Do not style Monaco text metrics (`font-size`, `line-height`, font family) through external CSS selectors like `.view-lines`; set them through Monaco editor options instead, or cursor/selection columns can drift from visible text.
- Keep toolbar fold controls in semantic action order (`Expand` before `Collapse`) so action scan follows open-then-close flow, and lock it with a unit test that asserts `.btn` render order.
- Enable output-editor minimap through Monaco options instead of CSS overlays to preserve native document navigation and stay compatible with read-only mode.
- If commit-message schema enforcement slows local iteration, disable the `commit-msg` hook and keep quality guarantees concentrated in `pre-commit` and `pre-push` checks.
- Register keyboard shortcuts at app scope and gate execution with the same mode checks as the corresponding toolbar controls, so disabled UI states and shortcut behavior stay consistent.
- When Monaco is the output viewer, prefer native editor find (`Cmd+F` -> `actions.find`) over duplicating search UI and custom decoration plumbing.
