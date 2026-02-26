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
- Empty-content ingestion rule:
  - empty open-file/drop payload keeps app in input mode and shows inline notice `File has no content.`,
  - empty paste keeps app in input mode without that file-empty notice.
- `Expand` and `Collapse`: always visible; enabled only when content exists.
- `Expand`/`Collapse` are wired to unfold-all/fold-all actions on the currently active editor (input or output).
- `Save` and `Copy`: always visible; disabled in input mode and enabled in output mode.
- Keyboard shortcuts:
  - `Cmd+N`: trigger `New`.
  - `Cmd+I`: switch to `Input`.
  - `Cmd+O`: switch to `Output` only when output mode is available (same enable/disable rule as `Output` segment).
  - `Cmd+S`: trigger `Save` only in output mode.
  - `Cmd+Shift+C`: trigger `Copy` only in output mode.
  - `Cmd+F`: open Monaco find widget in output mode, regardless of current DOM focus.
- Toolbar action visual treatment follows the design-style button pattern.
- Theme mode control on the right: segmented `Light/Dark` toggle with explicit active segment.
- Theme preference persistence: selected theme is stored through preload/main preferences APIs and restored on next app launch.
- Indentation preference has no user-facing control in current scope; renderer consumes persisted `indentSize` value only.
- Fallback agent preferences (`agents`, `fallbackAgentId`) currently have no user-facing settings controls.

## Editing Rules

- Input pane: Monaco-based editable code editor.
- Output pane: Monaco-based read-only code viewer.
- Input and output Monaco instances are separate and do not share content/state.
- Input mode Monaco uses the same preferences/settings as output mode, except output remains read-only and input remains editable.
- Output is derived from input and updates with input changes.
- Output is recomputed only when output mode is requested (ingestion that switches to output, or manual input->output switch), not on every input keystroke.
- Unified ingestion flow: drop, paste, and click-open all set input through the same ingestion path.
- Ingestion behavior:
  - non-empty input: switch to output and run prettifier.
  - empty open/drop: remain input with inline notice.
  - empty paste: remain input without file-empty notice.
- Local parser chain order: strict JSON -> JSON5 (JS/TS object-literal style) -> Python-literal normalization + JSON5.
- Malformed/unsupported local inputs trigger fallback agent execution via main-process IPC when configured; otherwise output is passthrough unchanged.
- Manual typing behavior: updates input text without forcing output mode.
- Output mode language detection is heuristic and parser-independent, with malformed JSON-like content preferring JSON highlighting.
- Output mode line numbers are always visible in current scope.
- Output mode minimap is enabled for document-level navigation.
- Output mode search uses Monaco native find widget (triggered by `Cmd+F` in output mode).
- Output mode fold/view state persists for the current document identity during the app session.
- Output-mode prettify indentation and Monaco tab/guide indentation are sourced from the same persisted preference value (`indentSize`) so they stay synchronized.
- Output mode shows a loading indicator only while fallback agent execution is pending.
- Theme persistence behavior: renderer hydrates `themeMode` from persisted preferences at startup and uses optimistic updates with rollback on failed writes.
- Indentation persistence behavior: renderer hydrates `indentSize` from persisted preferences at startup and uses it as the single runtime source for formatter + Monaco indentation.
