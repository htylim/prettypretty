# UI Spec

## Windows

- The app supports multiple independent document windows.
- Each document window owns its own input/output session state.
- A separate log window can be opened from the macOS app menu.
- When the bundled app executable is on `PATH`, `prettypretty` opens a new empty document window.
- When the bundled app executable is on `PATH`, `prettypretty <file>` opens a document window with that file preloaded.
- Re-running the terminal command while the app is already open creates another document window in the existing app instance.

## Main Screen

- A top toolbar
- One editor region below it
- Input and output modes are mutually exclusive

## Empty State

- Centered CTA: `Paste, Drop or Click`
- `Click` opens the file picker
- Empty state takes focus on launch and reset so paste works immediately

## Toolbar

- `New`
  - opens a new document window
- `Input` / `Output`
  - segmented mode toggle
  - `Output` is disabled until there is content
- `Expand` / `Collapse`
  - act on the active editor
  - disabled when there is no content
- `Save` / `Copy`
  - enabled only in output mode
- `Indent`
  - custom dropdown with values `1..8`
- `Fallback`
  - custom dropdown with `No Fallback` plus configured agents
- `Splits`
  - left, right, and pop controls for the output pane strip
  - current shipped flows do not open derived panes, so these usually stay effectively idle
- `Light` / `Dark`
  - segmented theme toggle

## Shortcuts

- `Cmd/Ctrl+N`
  - new window
- `Cmd/Ctrl+Shift+N`
  - reset current document window
- `Cmd/Ctrl+I`
  - switch to input
- `Cmd/Ctrl+O`
  - switch to output when output is available
- `Cmd/Ctrl+S`
  - save output
- `Cmd/Ctrl+Shift+C`
  - copy output
- `Cmd/Ctrl+F`
  - open Monaco find in output mode

## Input and Output Behavior

- Input uses an editable Monaco editor.
- Output uses a read-only Monaco editor.
- Open, drop, and paste use the same ingest path.
- Output is recomputed only on ingest or explicit output-mode requests, not on every keystroke.
- Empty open/drop keeps the app in input mode and shows `File has no content.`
- Empty paste keeps the app in input mode without the file-empty notice.
- Ingested content that already exceeds Monaco's large-content limits is rejected before the current window state changes.
- Rejected ingest shows a blocking `Content too large` dialog with `Abort` and `Open readable portion` actions.
- `Open readable portion` loads the largest leading slice that still fits Monaco's ingest limits.
- `Abort` returns the user to the same window state they had before the rejected open, drop, or paste.

## Prettify Behavior

- Local parser runs first.
- Supported local formats:
  - JSON
  - JSON-like token-preserving formatting for brace/bracket-delimited malformed input when the app can improve layout with whitespace only while preserving the original non-whitespace token stream
  - NDJSON
  - JSON5 / JS or TS object-literal style input
  - Python-like dict literals
  - GraphQL documents
- If local parsing succeeds, output updates immediately.
- For JSON-like token-preserving local success, the output may stay invalid JSON. The local formatter only improves layout; it does not repair missing punctuation or truncated tails.
- Unrecognized plain text is treated as a local no-op (`text`) and does not trigger fallback.
- If local parsing fails and fallback is available, renderer calls main-process fallback execution.
- Pane-targeted prettify support is phase-shipped by syntax family; shipped support covers JSON/NDJSON, YAML, JavaScript/TypeScript string literals, GraphQL string values, XML attribute/text payloads, and SQL quoted string literals.

## Fallback Behavior

- Fallback runs only through the main process.
- If no default fallback agent is selected but enabled agents exist, the user can choose a one-shot agent for that run.
- Large malformed inputs require confirmation before fallback starts.
- While fallback is running:
  - editors are hidden
  - a wait screen is shown
  - the user can cancel
  - cancel keeps the original text visible as passthrough output for the active root output or targeted child pane
  - the wait screen shows the last 5 progress lines for the active request

## Output Behavior

- Output mode shows line numbers and a minimap.
- Syntax highlighting is inferred from the rendered text unless local prettify returns an explicit language override for structured output.
- Output uses inline fold controls instead of Monaco gutter fold controls.
- Holding literal `Ctrl` changes the inline fold action to direct-child expand/collapse.
- Holding `Shift` changes the inline fold action to source-block pane open/close.
- While `Shift` is held, the source-block pane actions use `↗` to open and `↙` to close.
- Holding `Ctrl` and `Shift` together cancels both modifier remaps and falls back to the normal self fold action.
- `Shift` + click opens the full fold block, including its opening and closing delimiters, in the clicked pane's direct child.
- If that exact block is already open in the direct child pane, the control stays in the close state until that child pane is replaced or closed.
- Extracted-source panes rebase common leading indentation to zero, keep source-linked displayed line numbers, and inherit the parent pane language for syntax highlighting.
- When an extracted-source pane is open, the full source block stays subtly highlighted in the parent pane until that child is replaced or closed.
- `Save` and `Copy` always operate on the root output text.
- Right-clicking an output pane opens a context menu with `Prettify...`.
- Right-clicking outside an open output context menu dismisses it.
- The action is enabled only for semantic string scalars that decode to concrete non-empty text.
- Any active selection in that pane disables the action.
- `plaintext` and `markdown` keep the action disabled.
- YAML supports quoted scalars, plain string scalars, and block scalars.
- JavaScript and TypeScript support quoted string literals and template literals only when they have no interpolation.
- GraphQL supports quoted string values and block string values.
- Valid GraphQL documents extracted from supported string-scalar targets are formatted locally before the child pane opens.
- XML supports attribute values plus direct text-node and CDATA payloads when the adapter can treat them as concrete string content.
- SQL supports quoted string literals when the adapter can resolve a concrete string payload.
- Triggering the action opens the result in the clicked pane's direct child and replaces any extracted-source child already occupying that slot.
