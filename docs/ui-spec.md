# UI Spec (Initial)

## Layout

- Single-window app.
- Top toolbar.
- One editor pane below toolbar.
- Input and output views are mutually exclusive.

## Visual System Integration

- Reusable visual rules and component styling are defined in `docs/design-style.md`.
- Theme tokens are centralized in `src/renderer/styles/tailwind.css` and keyed by `:root` + `:root[data-theme='dark']`.
- Product behavior supports two theme modes (`Light`, `Dark`) switchable from the toolbar.

## Empty State

- Centered single-line CTA: `Paste, Drop or Click`.
- Only `Click` is interactive, visually underlined, and opens file picker via preload bridge.
- Drop and paste are supported in editor shell.

## Toolbar Controls

- `New`: reset input state.
- `Input/Output` mode control: segmented toggle visible at all times, with explicit active segment.
- Pane/content sync rule: input pane visible means `Input` active, output pane visible means `Output` active.
- Empty-content rule in input mode: `Input` stays active and `Output` is disabled until content exists.
- Empty-content exception in output mode: if ingestion sets empty text and switches to output, `Output` stays active and enabled.
- `Collapse`, `Expand`, `Save`, and `Copy`: always visible; disabled in input mode and enabled in output mode.
- Toolbar action visual treatment follows the design-style button pattern.
- Search field on the right.
- Theme mode control on the right: segmented `Light/Dark` toggle with explicit active segment.

## Editing Rules

- Input pane: editable textarea.
- Output pane: read-only display.
- Output is derived from input and updates with input changes.
- Unified ingestion flow: drop, paste, and click-open all set input through the same ingestion path.
- Ingestion behavior: load input text, apply existing prettify logic, and switch pane mode to output.
- Manual typing behavior: updates input text without forcing output mode.
