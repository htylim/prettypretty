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
- `Expand`, `Collapse`, `Save`, and `Copy`: always visible; disabled in input mode and enabled in output mode.
- `Expand`/`Collapse` are wired to output editor unfold-all/fold-all actions in output mode.
- Keyboard shortcuts:
  - `Cmd+N`: trigger `New`.
  - `Cmd+I`: switch to `Input`.
  - `Cmd+O`: switch to `Output` only when output mode is available (same enable/disable rule as `Output` segment).
  - `Cmd+S`: trigger `Save` only in output mode.
  - `Cmd+Shift+C`: trigger `Copy` only in output mode.
  - `Cmd+F`: open Monaco find widget in output mode, regardless of current DOM focus.
- Toolbar action visual treatment follows the design-style button pattern.
- Theme mode control on the right: segmented `Light/Dark` toggle with explicit active segment.

## Editing Rules

- Input pane: editable textarea.
- Output pane: Monaco-based read-only code viewer.
- Output is derived from input and updates with input changes.
- Unified ingestion flow: drop, paste, and click-open all set input through the same ingestion path.
- Ingestion behavior: load input text, apply existing prettify logic, and switch pane mode to output.
- Manual typing behavior: updates input text without forcing output mode.
- Output mode language detection is heuristic and parser-independent, with malformed JSON-like content preferring JSON highlighting.
- Output mode line numbers are always visible in current scope.
- Output mode minimap is enabled for document-level navigation.
- Output mode search uses Monaco native find widget (triggered by `Cmd+F` in output mode).
- Output mode fold/view state persists for the current document identity during the app session.
- Output-mode JSON prettify indentation and Monaco tab/guide indentation are sourced from the same renderer constant so they stay synchronized.
