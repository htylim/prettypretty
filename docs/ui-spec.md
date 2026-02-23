# UI Spec (Initial)

## Layout

- Single-window app.
- Top toolbar.
- One editor pane below toolbar.
- Input and output views are mutually exclusive.

## Visual Language

- Theme tokens are centralized in `src/renderer/styles/tailwind.css` and keyed by `:root` + `:root[data-theme='dark']`.
- Typography:
  - Display: `Bodoni MT`, fallback `Didot`, serif (empty-state CTA emphasis).
  - UI: `Avenir Next`, fallback `Segoe UI`, sans-serif.
  - Code: `SFMono-Regular`, fallback `Menlo`, `Consolas`, monospace.
- Light mode uses a warm parchment palette:
  - Background gradient from `#f6f2eb` / `#eee6d8`.
  - Panel surfaces `#f8f4ec` / `#fffdf8`.
  - Accent `#b8733b`.
- Dark mode uses a VS Code-like neutral palette:
  - Background `#1e1e1e` / `#252526`.
  - Panel surfaces `#252526` / `#1f1f1f`.
  - Accent `#3794ff`.
- Shared component geometry:
  - Toolbar radius `20px`, editor shell radius `24px`.
  - Controls use rounded pills (`12px`) and segmented active state tinting.
  - Focus-visible rings use accent-mixed outlines for keyboard navigation.

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
- `Collapse`, `Expand`, `Save`, and `Copy`: visible only in output mode, enabled when visible.
- Search field on the right.
- Theme mode control on the right: segmented `Light/Dark` toggle with explicit active segment.

## Editing Rules

- Input pane: editable textarea.
- Output pane: read-only display.
- Output is derived from input and updates with input changes.
- Unified ingestion flow: drop, paste, and click-open all set input through the same ingestion path.
- Ingestion behavior: load input text, apply existing prettify logic, and switch pane mode to output.
- Manual typing behavior: updates input text without forcing output mode.
