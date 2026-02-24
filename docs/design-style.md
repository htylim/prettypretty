# Design Style Guide

## Purpose

- This document is the source of truth for reusable UI element styling.
- Any new UI element should match one of these patterns before introducing a new style variant.

## Tokens

- Theme tokens live in `src/renderer/styles/tailwind.css` under `:root` and `:root[data-theme='dark']`.
- Do not hardcode colors, radii, or typography directly in components when a token already exists.

## Typography

- Display font token: `--font-display` (`Bodoni MT`, fallback `Didot`, serif).
- UI font token: `--font-ui` (`Avenir Next`, fallback `Segoe UI`, sans-serif).
- Code font token: `--font-code` (`SFMono-Regular`, fallback `Menlo`, `Consolas`, monospace).
- Use display typography for expressive headline/CTA copy only; use UI/code fonts everywhere else.

## Color System

- Light mode tokens use the warm parchment direction:
  - Background: `--bg #f6f2eb`, `--bg-alt #eee6d8`.
  - Surfaces: `--panel #f8f4ec`, `--panel-alt #fffdf8`.
  - Accent: `--accent #b8733b`.
- Dark mode tokens use the neutral VS Code-like direction:
  - Background: `--bg #1e1e1e`, `--bg-alt #252526`.
  - Surfaces: `--panel #252526`, `--panel-alt #1f1f1f`.
  - Accent: `--accent #3794ff`.
- Keep contrast and hierarchy by deriving borders, muted text, focus rings, and soft accents from these token groups.

## Buttons

- Toolbar action buttons (`New`, `Expand`, `Collapse`, `Save`, `Copy`) must use class `.btn`.
- `.btn` is the default action button style:
  - Height `36px`, radius `12px`.
  - Border `1px solid var(--line)`.
  - Surface from `var(--panel-alt)` mixed with `var(--accent-soft)`.
  - Font weight `600`.
- Do not create per-action button color variants for toolbar actions.

## Toggles

- Binary or segmented mode switches must use `.segmented` container + `.seg` buttons.
- Active segment must use `.seg-active`.
- Inactive segment must use `.seg-inactive`.
- Toggle behavior must expose explicit active state with `aria-pressed`.

## Inputs

- Toolbar search input must use `.toolbar-search`.
- Shared form geometry for toolbar controls:
  - Height aligned to action buttons (`36px`).
  - Rounded corners and tokenized border/background.

## Text-Link Actions

- Inline CTA actions inside sentence copy must use link styling (example: `.empty-state-link`).
- Use this only for inline text interactions, not toolbar actions.

## Shell and Surface Geometry

- Toolbar container must use `.toolbar`.
- Editor container must use `.editor-shell`.
- Keep the established rounded geometry:
  - Toolbar radius `20px`.
  - Editor radius `24px`.
  - Toolbar button/input controls use `12px` radius pills.

## Output Editor (Monaco)

- Output mode is rendered by Monaco, not a plain `<pre>`.
- Monaco theme IDs are fixed: `prettypretty-light` and `prettypretty-dark`.
- Monaco themes must align with token direction from `src/renderer/styles/tailwind.css`:
  - light mode uses warm parchment tones,
  - dark mode uses neutral VS Code-like tones.
- Output editor must keep visible:
  - line-number gutter,
  - document minimap,
  - fold controls on gutter hover,
  - indentation guides + bracket-pair guides.
- Bracket pair colorization must define at least six depth colors before repeating.
- Search match highlight should use `.output-search-match` and token-derived color mixing (no hardcoded per-theme overrides).

## Focus and Accessibility

- Interactive controls must support keyboard focus with visible ring using `:focus-visible`.
- Use shared accent-based focus ring token (`--focus-ring`).
- Disabled states must reduce emphasis while remaining readable.

## Change Process

- When introducing or changing a reusable UI pattern:
  - Update this guide.
  - Update `docs/ui-spec.md` if behavior/visual rules changed.
  - Add/adjust unit tests that lock the intended class usage or interaction behavior.
