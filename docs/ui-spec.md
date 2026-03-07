# UI Spec (Initial)

## Layout

- Main editing experience is single-window.
- Optional secondary log window can be opened from macOS app menu (`View Log`, `Cmd+L`).
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
- Indentation preference is user-configurable from a custom toolbar dropdown (`Indent: <size>`) with options `1..8` on the left.
- Indentation preference persistence: selected `indentSize` is stored through preload/main preferences APIs and restored on next app launch.
- Fallback agent control on the left: custom dropdown (not native `<select>`) with `No Fallback` plus one option per configured agent.
- Dropdown trigger displays the selected agent name (or `No Fallback`) with a chevron indicator; no external label.
- Disabled agents are visible in the dropdown panel but non-selectable (`<name> (Disabled)`).
- Fallback preference persistence: selected fallback agent id (or no fallback) is stored through preload/main preferences APIs and restored on next app launch.

## App Menu (macOS)

- `prettypretty` app menu includes `View Log`.
- `View Log` has keyboard shortcut `Cmd+L`.
- Selecting `View Log` opens/focuses a dedicated log window.
- Log window content is raw JSONL and includes:
  - startup/session history captured from app launch,
  - live appended lines while the log window remains open.

## Editing Rules

- Input pane: Monaco-based editable code editor.
- Output pane: Monaco-based read-only code viewer.
- Input and output Monaco instances are separate and do not share content/state.
- Input mode Monaco uses the same preferences/settings as output mode, except output remains read-only and input remains editable.
- Output is derived from input and updates with input changes.
- Output is recomputed only when output mode is requested (ingestion that switches to output, or manual input->output switch), not on every input keystroke.
- Unified ingestion flow: drop, paste, and click-open all set input through the same ingestion path.
- Ingestion behavior:
  - non-empty input: run prettifier first; switch to output only after processing completes.
  - empty open/drop: remain input with inline notice.
  - empty paste: remain input without file-empty notice.
- Local parser chain order: strict JSON -> JSON5 (JS/TS object-literal style) -> Python-literal normalization + JSON5.
- Malformed/unsupported local inputs trigger fallback agent execution via main-process IPC when configured; otherwise output is passthrough unchanged.
- Manual typing behavior: updates input text without forcing output mode.
- Output mode language detection is heuristic and parser-independent, with malformed JSON-like content preferring JSON highlighting.
- Output mode line numbers are always visible in current scope.
- Output mode minimap is enabled for document-level navigation.
- Output mode search uses Monaco native find widget (triggered by `Cmd+F` in output mode).
- Paste inside Monaco find/replace inputs stays local to that widget and must not trigger app-level ingest/prettify flow.
- Output mode fold/view state persists for the current document identity during the app session.
- Output-mode prettify indentation and Monaco tab/guide indentation are sourced from the same persisted preference value (`indentSize`) so they stay synchronized.
- If output mode currently displays already-prettified text, changing `indentSize` reindents the visible output locally by line-leading whitespace remap (no new prettifier/fallback request).
- If output is passthrough/non-prettified, changing `indentSize` does not mutate existing output text.
- While fallback agent execution is pending, editors are hidden behind a dedicated wait screen with a status message (`Malformed <format>. Calling <agent>.`) and spinner.
- Wait screen includes a single-line live status area that shows the latest fallback execution output line for the active request only.
- If fallback fails, output mode still opens after completion and renders passthrough/error behavior already defined by prettifier result handling.
- Theme persistence behavior: renderer hydrates `themeMode` from persisted preferences at startup and uses optimistic updates with rollback on failed writes.
- Indentation persistence behavior: renderer hydrates `indentSize` from persisted preferences at startup and uses it as the single runtime source for formatter + Monaco indentation.
- Fallback preference behavior: renderer hydrates both `fallbackAgentId` and configured agent list from persisted preferences at startup and writes selection changes with optimistic UI + rollback on failed writes.
- Large-content fallback guard: when malformed/unsupported input exceeds the persisted `fallbackWarningLineThreshold` (default `300` lines), renderer shows a confirmation modal (`Content is <N> lines. Use fallback agent?`) before starting fallback execution.
- Current scope persists `fallbackWarningLineThreshold` in preferences with default `300`; there is no toolbar control for changing it yet.
