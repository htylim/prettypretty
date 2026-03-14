# Design Style Guide

## Purpose

- This document is the source of truth for reusable UI element styling.
- Any new UI element should match one of these patterns before introducing a new style variant.

## Tokens

- Theme tokens live in `src/renderer/styles/tailwind.css` under `:root` and `:root[data-theme='dark']`.
- Do not hardcode colors, radii, or typography directly in components when a token already exists.

## Typography

- Display font token: `--font-display` (`-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `system-ui`, `sans-serif`).
- UI font token: `--font-ui` (`-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `system-ui`, `sans-serif`).
- Code font token: `--font-code` (`"SF Mono"`, `Menlo`, `Monaco`, `Consolas`, `"Courier New"`, `monospace`).
- Use system UI fonts to match the native IDE aesthetic; use code fonts for the editor and log outputs.

## Color System

- Light mode tokens use the VS Code Light+ inspired direction:
  - Background: `--bg #ffffff`, `--bg-alt #f3f3f3`.
  - Surfaces: `--panel #f3f3f3`, `--panel-alt #ffffff`.
  - Accent: `--accent #007acc`.
- Dark mode tokens use the VS Code Dark+ inspired direction:
  - Background: `--bg #1e1e1e`, `--bg-alt #252526`.
  - Surfaces: `--panel #252526`, `--panel-alt #1e1e1e`.
  - Accent: `--accent #007acc`.
- Keep contrast and hierarchy by deriving borders, muted text, focus rings, and soft accents from these token groups.

## Buttons

- Toolbar action buttons (`New`, `Expand`, `Collapse`, `Save`, `Copy`) must use class `.btn`.
- `Expand`, `Collapse`, `Save`, and `Copy` buttons use icons from `react-icons/vsc` (VS Code Codicons) instead of text labels.
- Toolbar controls should include `title` tooltips that describe the action and include keyboard shortcut hints where available, and icon-only buttons must have an `aria-label`.
- `.btn` is the default action button style:
  - Height `32px`, radius `4px`.
  - Border `1px solid transparent`.
  - Transparent surface by default, soft accent background on hover.
  - Font weight `400`.
- Do not create per-action button color variants for toolbar actions.

## Toggles

- Binary or segmented mode switches must use `.segmented` container + `.seg` buttons.
- Active segment must use `.seg-active`.
- Inactive segment must use `.seg-inactive`.
- Toggle behavior must expose explicit active state with `aria-pressed`.

## Dropdowns

- Custom dropdown controls (e.g. indentation-size selector, fallback agent selector) must use `.dropdown` container with `.dropdown-trigger` button and `.dropdown-panel` floating options.
- Trigger uses same pill geometry as `.btn` (height `32px`, radius `4px`, transparent background, soft accent background on hover).
- Trigger includes a `.dropdown-chevron` SVG that rotates on open (`.dropdown-chevron-open`).
- Panel floats below trigger with radius `4px`, tokenized border/background, and `dropdown-reveal` entry animation.
- Options use `.dropdown-option` with `.dropdown-option-active` for selected state (accent color) and `.dropdown-option-disabled` for non-selectable items.
- Dropdowns do not use a visible label; the selected value inside the trigger serves as context.
- Focus ring applies to both `.dropdown-trigger` and `.dropdown-option`.
- Toolbar left-side controls include the indentation-size dropdown and fallback-agent dropdown after the Copy button.
- Toolbar right-side control order is just the theme segmented toggle.

## Inputs

- Shared form geometry for toolbar controls:
  - Height aligned to action buttons (`32px`).
  - Rounded corners and tokenized border/background.

## Text-Link Actions

- Inline CTA actions inside sentence copy must use link styling (example: `.empty-state-link`).
- Use this only for inline text interactions, not toolbar actions.

## Shell and Surface Geometry

- Toolbar container must use `.toolbar`.
- Editor container must use `.editor-shell`.
- Keep the established edge-to-edge VS Code geometry:
  - Application shell has no margins or padding.
  - Toolbar spans the full width with no border radius and only a bottom border.
  - Editor spans the full width and remaining height with no outer borders or radius.
  - Toolbar button/input controls use `4px` radius pills.

## Monaco Editors

- Input and output modes are both rendered by Monaco (separate instances).
- Monaco theme IDs are fixed: `prettypretty-light` and `prettypretty-dark`.
- Monaco themes must align with token direction from `src/renderer/styles/tailwind.css`:
  - light mode uses Light+ tones,
  - dark mode uses Dark+ tones.
- Input and output editors should share the same Monaco preference set.
- Output editor stays read-only; input editor stays editable.
- Monaco editors must keep visible:
  - line-number gutter,
  - document minimap,
  - input-editor fold controls in gutter,
  - indentation guides + bracket-pair guides.
- Output editor fold affordance rules:
  - hide Monaco gutter fold controls,
  - render inline fold buttons only on visible Monaco fold-start lines,
  - anchor controls to the end of the fold-start line so they move with code horizontally and vertically,
  - use tokenized UI colors, not syntax-token colors, so the control never reads as source text.
- Output inline fold button styling:
  - square or soft-rect `16px` to `18px`,
  - vertically center inside the `23px` Monaco line box instead of sitting on the text baseline,
  - keep expanded controls close to the fold-start line end, but shift collapsed controls a few pixels farther right so Monaco folded placeholders (`...`) do not visually collide with the control,
  - muted default color using panel/border tokens,
  - stronger text/border contrast on hover,
  - visible `:focus-visible` ring using `--focus-ring`,
  - explicit expand/collapse glyphs (`+` / `-` in current scope).
- Bracket pair colorization must define at least six depth colors before repeating.
- Search in output mode should use Monaco's native find widget (no custom decoration class for search matches).

## Focus and Accessibility

- Interactive controls must support keyboard focus with visible ring using `:focus-visible`.
- Use shared accent-based focus ring token (`--focus-ring`).
- Disabled states must reduce emphasis while remaining readable.

## Change Process

- When introducing or changing a reusable UI pattern:
  - Update this guide.
  - Update `docs/ui-spec.md` if behavior/visual rules changed.
  - Add/adjust unit tests that lock the intended class usage or interaction behavior.
