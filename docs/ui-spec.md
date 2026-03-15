# UI Spec (Initial)

## Layout

- Main editing experience supports multiple independent document windows.
- Each document window starts in the same blank empty state and owns its own input/output session state.
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
- Empty-state CTA remains vertically centered within the editor shell across window resizes and responsive breakpoints.
- Only `Click` is interactive, visually underlined, and opens file picker via preload bridge.
- Drop and paste are supported in editor shell.

## Toolbar Controls

- `New`: open a new blank document window.
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
  - `Cmd+N` on macOS / `Ctrl+N` on Windows/Linux: open a new blank document window.
  - `Cmd+Shift+N` on macOS / `Ctrl+Shift+N` on Windows/Linux: reset only the current/focused document window to the initial empty state.
  - `Cmd+I` on macOS / `Ctrl+I` on Windows/Linux: switch to `Input`.
  - `Cmd+O` on macOS / `Ctrl+O` on Windows/Linux: switch to `Output` only when output mode is available (same enable/disable rule as `Output` segment).
  - `Cmd+S` on macOS / `Ctrl+S` on Windows/Linux: trigger `Save` only in output mode.
  - `Cmd+Shift+C` on macOS / `Ctrl+Shift+C` on Windows/Linux: trigger `Copy` only in output mode.
  - `Cmd+F` on macOS / `Ctrl+F` on Windows/Linux: open Monaco find widget in output mode, regardless of current DOM focus.
- Toolbar action visual treatment follows the design-style button pattern.
- Theme mode control on the right: segmented `Light/Dark` toggle with explicit active segment.
- Theme preference persistence: selected theme is stored through preload/main preferences APIs and restored on next app launch.
- Indentation preference is user-configurable from a custom toolbar dropdown (`Indent: <size>`) with options `1..8` on the left.
- Indentation preference persistence: selected `indentSize` is stored through preload/main preferences APIs and restored on next app launch.
- Fallback agent control on the left: custom dropdown (not native `<select>`) with `No Fallback` plus one option per configured agent.
- Dropdown trigger displays the selected agent name (or `No Fallback`) with a chevron indicator; no external label.
- Disabled agents are visible in the dropdown panel but non-selectable (`<name> (Disabled)`).
- Fallback preference persistence: selected fallback agent id (or no fallback) is stored through preload/main preferences APIs and restored on next app launch.
- `Splits` group: always visible immediately after the fallback-agent control, includes a static `Splits` label plus `Navigate splits left`, `Navigate splits right`, and `Pop split` buttons.
- `Pop split` is disabled when no derived output pane is open.
- Split navigation buttons are enabled only when at least three panes exist and there is another snapped viewport position in that direction.

## App Menu (macOS)

- `prettypretty` app menu includes `View Log`.
- `View Log` has keyboard shortcut `Cmd+L`.
- Selecting `View Log` opens/focuses a dedicated log window.
- `File` menu includes `New Window` (`Cmd+N`) and `Reset Window` (`Cmd+Shift+N`).
- `Reset Window` applies only to the focused document window; it does not affect other open document windows.
- Closing a non-last window closes only that window.
- Closing the last remaining app window exits the app.
- The log window counts as an app window for lifetime purposes; if it remains open after all document windows are closed, the app stays running until that final window closes.
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
- Local parser chain order: strict JSON -> newline-delimited JSON (strict JSON per non-empty line) -> JSON5 (JS/TS object-literal style) -> Python-literal normalization + JSON5.
- Malformed/unsupported local inputs trigger fallback agent execution via main-process IPC when configured.
- If no fallback agent is configured but at least one enabled agent exists, malformed/unsupported local inputs open a modal that focuses the split fallback button by default: `Enter` runs the currently selected agent, while `ArrowDown`/`ArrowUp` opens the menu and changes the current selection. Selecting from the open menu updates the primary button label and closes the menu; it does not run the agent until the primary action is invoked.
- If no fallback agent is configured and the one-shot modal is dismissed or canceled, output remains passthrough unchanged.
- Manual typing behavior: updates input text without forcing output mode.
- Output mode language detection is heuristic and parser-independent, with malformed JSON-like content preferring JSON highlighting.
- Output mode line numbers are always visible in current scope.
- Input mode keeps Monaco fold controls in the gutter.
- Output mode hides Monaco gutter fold controls and renders inline fold buttons anchored to visible Monaco fold-start lines.
- Output inline fold buttons are UI controls, not code text; they sit after the rendered line content, move with horizontal and vertical scroll, and disappear when Monaco reports no fold regions.
- Output inline fold button interaction:
  - without modifiers, the button toggles only the clicked fold block,
  - while literal `Ctrl` is held, that same button applies the direct-child action to the clicked block's immediate child foldable regions without toggling the clicked block itself,
  - direct-child action rule:
    - if at least one immediate child foldable block is expanded, the button enters `collapse children`,
    - if all immediate child foldable blocks are collapsed, the button enters `expand children`,
    - if no immediate child foldable blocks exist, keep the button visible but disabled while `Ctrl` is held,
  - the direct-child mode keeps a subtle downward cue so it stays visually distinct from the default self-toggle mode.
- Output mode minimap is enabled for document-level navigation.
- Output mode search uses Monaco native find widget (triggered by the platform primary modifier plus `F` in output mode).
- Paste inside Monaco find/replace inputs stays local to that widget and must not trigger app-level ingest/prettify flow.
- Output mode fold/view state persists for the current document identity during the app session.
- Output mode supports a recursive structural split gesture:
  - literal `Ctrl+click` on the root output pane resolves the smallest enclosing Monaco foldable block for the clicked line,
  - clicking a folded fold-start line resolves that folded block from the model, not the visible placeholder text,
  - clicking a line with no enclosing foldable block is a no-op,
  - derived panes may split again only when the resolved block is strictly smaller than that pane's full visible source range.
- Output split layout keeps the full pane chain mounted and uses a snapped horizontal viewport:
  - with one pane, the output viewport is a single full-width pane,
  - once any derived pane exists, every pane uses `50/50` width and the viewport shows two panes at a time,
  - opening/replacing a child pans the viewport to the parent-child pair for that interaction,
  - left/right navigation moves exactly one pane at a time across the mounted chain.
- Derived panes:
  - render the same Monaco source model as the root pane, but as filtered views of the selected source range,
  - stay read-only and use the same syntax/theme/minimap/line-number/fold-control configuration as the root pane,
  - preserve source line numbers instead of renumbering from `1`,
  - open expanded even when the source block in the parent pane was folded,
  - remain mounted off-screen so fold/search/view state survives viewport navigation.
- Every pane shows a custom Monaco decoration highlight for its direct child selection; highlights are not native Monaco/browser text selections and do not change copy/save output text.
- Repeating `Ctrl+click` on a pane replaces only that pane's direct child and truncates all descendants to the right.
- Output-pane modifier-click fold toggling is removed in this scope. Output folding remains available through inline fold controls and toolbar fold actions, with one inline button that switches between self-toggle and immediate-child fold state changes while literal `Ctrl` is held. Input-pane modifier-click folding remains unchanged.
- Output `Expand`, `Collapse`, and `Cmd+F` target the active visible output pane. Split-open, split-pop, viewport navigation, and normal click focus all retarget that active pane. `Save` and `Copy` remain rooted to the full root output text even when derived panes are open.
- Output split navigation shortcuts:
  - literal `Ctrl+Left` / `Ctrl+Right`: move the split viewport one pane left/right in output mode,
  - literal `Ctrl+Wheel` / `Ctrl+trackpad scroll`: move the split viewport by snapped pane steps in output mode,
  - `Escape`: pop the rightmost derived pane in output mode when a split chain is open and Monaco did not already consume the key.
- Split-pane state clears when output mode exits, when the root output document changes, and when the current document window is reset.
- Output-mode prettify indentation and Monaco tab/guide indentation are sourced from the same persisted preference value (`indentSize`) so they stay synchronized.
- If output mode currently displays already-prettified text, changing `indentSize` reindents the visible output locally by line-leading whitespace remap (no new prettifier/fallback request).
- If output is passthrough/non-prettified, changing `indentSize` does not mutate existing output text.
- While fallback agent execution is pending, editors are hidden behind a dedicated wait screen with a status message (`Malformed <format>. Calling <agent>.`), spinner, and `CANCEL` action that aborts the active fallback run and returns to input mode.
- Wait screen includes a rolling live status area that shows the last 5 fallback execution output lines for the active request only.
- If fallback fails, output mode still opens after completion and renders passthrough/error behavior already defined by prettifier result handling.
- Theme persistence behavior: renderer hydrates `themeMode` from persisted preferences at startup and uses optimistic updates with rollback on failed writes.
- Indentation persistence behavior: renderer hydrates `indentSize` from persisted preferences at startup and uses it as the single runtime source for formatter + Monaco indentation.
- Fallback preference behavior: renderer hydrates both `fallbackAgentId` and configured agent list from persisted preferences at startup and writes selection changes with optimistic UI + rollback on failed writes.
- Large-content fallback guard: when malformed/unsupported input exceeds the persisted `fallbackWarningLineThreshold` (default `300` lines), renderer shows a confirmation modal (`Content is <N> lines. Use fallback agent?`) before starting fallback execution.
- One-shot fallback modal behavior: pressing `Escape` always closes the modal without invoking fallback, even if the agent menu is open.
- Current scope persists `fallbackWarningLineThreshold` in preferences with default `300`; there is no toolbar control for changing it yet.
