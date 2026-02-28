# Learnings

Purpose: capture mistakes and failure patterns to avoid repeating.  
Do not add routine status updates, implementation history, or one-time decisions.

## Keep/Drop Rule

- Keep: issues that caused regressions, rework, inconsistent behavior, or test instability.
- Drop: project setup notes, neutral architecture choices, and "what we built" logs.

## Mistakes To Avoid

- Do not split input ingestion paths by trigger (`drop`, `paste`, `open file`); use one ingestion path or pane-switch behavior drifts.
- Do not let keyboard shortcuts and toolbar controls diverge; both must use the same mode guards and enable/disable rules.
- Do not rely on partial class assertions for style tests; assert exact class contracts so variants cannot drift silently.
- Do not style Monaco text metrics via external CSS selectors (for example `.view-lines`); set typography metrics in Monaco options or cursor/selection alignment can drift.
- Do not let prettifier indentation and Monaco indentation settings come from different sources; both must read the same persisted preference value.
- Do not mutate output text to implement search highlighting; use Monaco-native find/decorations so copy/save output remains accurate.
- Do not key output fold/view state to transient UI state; persist/restore by deterministic document identity.
- Do not maintain separate Monaco option sets for input/output that can drift; use one shared base and derive editable/read-only variants.
- Do not enable fold actions when there is no content; fold controls should be content-aware and no-op states should stay disabled.
- Do not bypass Monaco built-ins with CSS overlays for editor primitives (for example minimap); use Monaco options for stability and compatibility.
- Do not persist app preferences in renderer localStorage or install directories; keep main-process ownership and store in Electron `app.getPath('userData')` for OS-correct, writable config behavior.
- Do not implement optimistic preference writes without request sequencing; stale async failures can rollback newer user selections.
- Do not parse JS/TS object-literal input with `eval`/`new Function`; use parser-based approaches to keep renderer execution safe.
- Do not silently coerce unsupported parsed values (for example `NaN`/`Infinity`) during prettify; return original input if the value tree is not JSON-serializable.
- Do not treat additive preference fields as corrupt-file cases by default; migrate missing/invalid optional fields to safe defaults when backward compatibility allows it.
- Do not expose nested preference objects/arrays by shallow copy from the service cache; deep-clone them to avoid accidental external mutation of persisted state.
- Do not rely on `iconutil` conversion in constrained/sandboxed environments for app icons; generate `.icns` through `app-builder-bin icon` with a size-labeled PNG input (`1024x1024.png`) to keep icon builds deterministic.
- Do not rely on macOS default app menu labeling in dev mode; explicitly set application menu template label from `app.getName()` or the top-bar app menu can remain `Electron`.
- Do not rely on `app.getName()` to drive macOS top-bar app menu label in dev mode; use a fixed app label (`prettypretty`) when deterministic branding is required.
- Do not hardcode an editor executable for opening config files from app menus; use Electron `shell.openPath` so OS file associations select the default editor.
- Do not keep macOS-style background app behavior when product semantics require single-window lifecycle; bind main window `close` directly to `app.exit(0)` so `Cmd+W` exits the app.
- Do not execute fallback LLM commands from renderer code or without hard timeout/output caps; keep process execution in main with typed status outcomes so failures degrade to passthrough instead of UI hangs.
- Do not rely on inherited GUI `PATH` when spawning fallback CLIs from Electron; resolve known absolute install paths (for example app bundle, `~/.local/bin`, Homebrew paths) before defaulting to bare command names.
- Do not treat unchanged non-empty fallback output as an automatic failure; malformed inputs can be validly echoed by the fallback agent and should not downgrade to `failed-invalid-output`.
- Do not reject fallback output solely because it is wrapped in markdown fences; unwrap fenced blocks and evaluate inner content so otherwise-valid agent responses are not dropped.
- Do not switch to output editor before malformed-input fallback completes; keep editors hidden behind a dedicated waiting state so users never see raw malformed passthrough during in-flight fallback.
- Do not stream fallback progress into renderer without request-id correlation; stale async lines from prior runs can overwrite the active wait-state if events are not gated by run id.
- Do not run prettifier/fallback on every input keystroke; trigger prettification only on explicit output-mode requests or cost and latency spike while typing.
- Do not include raw input/output/prompt bodies in verbose logs; log only bounded metadata (lengths, statuses, durations, ids) to keep diagnostics safe and readable.
- Do not couple log event capture to verbose transport flags; keep session capture always on and use `-v` only to gate stdout emission.
- Do not keep fallback agent default unset when fallback behavior is a primary test path; set a valid default agent id so malformed-input fallback is testable without manual profile edits.
- Do not hide fallback configuration behind config-file edits when runtime agent switching is required; expose `fallbackAgentId` in toolbar UI with a `No Fallback` option and all configured agents so fallback behavior is testable in-session.
- Do not use native `<select>` for toolbar dropdowns; OS-native rendering breaks visual consistency. Use a custom dropdown with click-to-open panel, outside-click/escape dismissal, and tokenized styling matching existing toolbar controls.
- Do not keep stateful custom control behavior (open/close listeners, outside-click, escape handling) embedded in a broad layout component like `Toolbar`; extract a focused component to keep ownership, tests, and change risk localized.
- Do not use `VITE_DEV_SERVER_URL` for dev-mode URL detection with electron-vite v5; the correct env var is `ELECTRON_RENDERER_URL`. Using the wrong name causes the main process to silently fall back to stale built files in `out/`, making dev changes invisible.
- Do not default renderer theme state to light and wait for async preferences hydration; seed theme synchronously from main/preload before first render or dark-mode users see startup flicker.
