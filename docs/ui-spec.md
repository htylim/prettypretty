# UI Spec (Initial)

## Layout

- Single-window app.
- Top toolbar.
- One editor pane below toolbar.
- Input and output views are mutually exclusive.

## Empty State

- Centered single-line CTA: `Paste, Drop or Click`.
- Only `Click` is interactive, visually underlined, and opens file picker via preload bridge.
- Drop and paste are supported in editor shell.

## Toolbar Controls

- `New`: reset input state.
- `Input/Output` toggle: visible at all times, disabled when empty.
- `Collapse` and `Expand`: visible, enabled only in output mode (placeholder behavior in step 1).
- `Save` and `Copy`: visible only in output mode.
- Search field on the right.
- Theme toggle on the right.

## Editing Rules

- Input pane: editable textarea.
- Output pane: read-only display.
- Output is derived from input and updates with input changes.
