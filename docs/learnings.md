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
