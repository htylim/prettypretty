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
