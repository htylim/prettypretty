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
- `Input/Output` mode control: segmented toggle visible at all times, with explicit active segment.
- Pane/content sync rule: input pane visible means `Input` active, output pane visible means `Output` active.
- Empty-content rule in input mode: `Input` stays active and `Output` is disabled until content exists.
- Empty-content exception in output mode: if ingestion sets empty text and switches to output, `Output` stays active and enabled.
- `Collapse` and `Expand`: visible, enabled only in output mode (placeholder behavior in step 1).
- `Save` and `Copy`: visible only in output mode.
- Search field on the right.
- Theme mode control on the right: segmented `Light/Dark` toggle with explicit active segment.

## Editing Rules

- Input pane: editable textarea.
- Output pane: read-only display.
- Output is derived from input and updates with input changes.
- Unified ingestion flow: drop, paste, and click-open all set input through the same ingestion path.
- Ingestion behavior: load input text, apply existing prettify logic, and switch pane mode to output.
- Manual typing behavior: updates input text without forcing output mode.
