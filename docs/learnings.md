# Learnings

## 2026-02-22

- Initial scaffold established with Electron + React + TypeScript + Vite + Tailwind.
- Local quality gates are hook-enforced.
- Renderer-to-test pairing script is used instead of a coverage threshold target.
- Empty-state CTA should render as one concise line, with an inline button when only part of the copy is interactive.
- Mode-switch controls are clearer as segmented toggles that expose current active state and keep UI state synchronized with rendered content.
- Input ingestion should be centralized so drop, paste, and click-open follow identical load-and-switch behavior while manual typing stays in input mode.

## 2026-02-23

- Toolbar actions that are output-only should share one visibility rule: hide all output actions in input mode and show them enabled in output mode to avoid mixed disabled/hidden states.
- When porting a visual direction from a mockup, extract semantic theme tokens first (typography, surfaces, accents, borders) and map them onto existing component structure instead of reusing mockup feature logic.
- Keep theme switching architecture stable (`data-theme` on root), and move UI parity work to CSS tokens + semantic class names so behavior tests stay unchanged.
