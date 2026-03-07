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
- Do not treat bubbled paste events from Monaco find/replace widgets as shell-level ingest; allow widget-local paste or search can overwrite the active document.
- Do not key output fold/view state to transient UI state; persist/restore by deterministic document identity.
- Do not maintain separate Monaco option sets for input/output that can drift; use one shared base and derive editable/read-only variants.
- Do not enable fold actions when there is no content; fold controls should be content-aware and no-op states should stay disabled.
- Do not let shared Monaco affordances (for example fold-control visibility) diverge between input and output panes; keep them in the shared editor-options seam and lock them with unit tests.
- Do not bypass Monaco built-ins with CSS overlays for editor primitives (for example minimap); use Monaco options for stability and compatibility.
- Do not bind structural fold toggling to plain click in Monaco editors; keep default click behavior and require an explicit modifier (for example Cmd+click) when adding custom fold gestures.
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
- Do not tie app lifetime to the first-created document window when the product supports multiple windows; let Electron close individual windows normally and exit only from `window-all-closed`.
- Do not open file/save dialogs without scoping them to the invoking `BrowserWindow`; unparented dialogs become ambiguous once multiple document windows are open.
- Do not execute fallback LLM commands from renderer code or without hard timeout/output caps; keep process execution in main with typed status outcomes so failures degrade to passthrough instead of UI hangs.
- Do not spawn fallback agents without explicit app-shutdown cleanup and process-tree termination; killing only the direct child or relying on parent exit can leave agent subprocesses running after the app closes.
- Do not clear a fallback wait screen without canceling the underlying request-scoped child process; superseded or user-canceled runs must terminate in main or background agent CLIs will keep consuming time and tokens after the UI stops waiting.
- Do not rely on inherited GUI `PATH` when spawning fallback CLIs from Electron; resolve known absolute install paths (for example app bundle, `~/.local/bin`, Homebrew paths) before defaulting to bare command names.
- Do not treat unchanged non-empty fallback output as an automatic failure; malformed inputs can be validly echoed by the fallback agent and should not downgrade to `failed-invalid-output`.
- Do not reject fallback output solely because it is wrapped in markdown fences; unwrap fenced blocks and evaluate inner content so otherwise-valid agent responses are not dropped.
- Do not switch to output editor before malformed-input fallback completes; keep editors hidden behind a dedicated waiting state so users never see raw malformed passthrough during in-flight fallback.
- Do not stream fallback progress into renderer without request-id correlation; stale async lines from prior runs can overwrite the active wait-state if events are not gated by run id.
- Do not run prettifier/fallback on every input keystroke; trigger prettification only on explicit output-mode requests or cost and latency spike while typing.
- Do not rerun prettifier/fallback when only indentation preference changes and output is already prettified; remap leading whitespace locally to avoid unnecessary agent calls and latency.
- Do not include raw input/output/prompt bodies in verbose logs; log only bounded metadata (lengths, statuses, durations, ids) to keep diagnostics safe and readable.
- Do not couple log event capture to verbose transport flags; keep session capture always on and use `-v` only to gate stdout emission.
- Do not keep fallback agent default unset when fallback behavior is a primary test path; set a valid default agent id so malformed-input fallback is testable without manual profile edits.
- Do not hide fallback configuration behind config-file edits when runtime agent switching is required; expose `fallbackAgentId` in toolbar UI with a `No Fallback` option and all configured agents so fallback behavior is testable in-session.
- Do not use native `<select>` for toolbar dropdowns; OS-native rendering breaks visual consistency. Use a custom dropdown with click-to-open panel, outside-click/escape dismissal, and tokenized styling matching existing toolbar controls.
- Do not keep stateful custom control behavior (open/close listeners, outside-click, escape handling) embedded in a broad layout component like `Toolbar`; extract a focused component to keep ownership, tests, and change risk localized.
- Do not use `VITE_DEV_SERVER_URL` for dev-mode URL detection with electron-vite v5; the correct env var is `ELECTRON_RENDERER_URL`. Using the wrong name causes the main process to silently fall back to stale built files in `out/`, making dev changes invisible.
- Do not default renderer theme state to light and wait for async preferences hydration; seed theme synchronously from main/preload before first render or dark-mode users see startup flicker.
- Do not let renderer orchestration accumulate inside `App.tsx`; keep `App` as composition-only and move effectful flows into focused controller hooks (`useAppController`, `usePrettifierFlow`, `usePreferencesFlow`, `useKeyboardShortcuts`) with pure helpers in `appDomain`.
- Do not maintain separate local-prettifier parsing implementations in renderer and main; keep one shared parser core (`src/shared/localPrettifier.ts`) and reuse it across processes to prevent behavior drift.
- Do not classify multi-record NDJSON as malformed just because whole-document `JSON.parse` fails; attempt strict per-line JSON parsing before falling back.
- Do not issue an extra renderer `preferences.getAll()` call before fallback execution; use hydrated renderer fallback selection state to decide wait-screen behavior and let main own final fallback execution decisions.
- Do not auto-run fallback agents on very large malformed inputs without explicit user confirmation; gate oversized fallback requests with a persisted line-threshold check to avoid accidental costly/slow agent runs.
- Do not scatter ad-hoc `console.error` calls across renderer flows; route renderer failures through one shared reporter utility (`reportRendererError`) for consistent handling and easier evolution.
- Do not trust IPC primitive payload types implicitly; validate string channels (for example save/copy text) at the main-process boundary and reject invalid payloads consistently.
- Do not rely on external globally-installed AI CLIs for fallback e2e coverage; configure a deterministic test-only fallback agent via preferences (for example `node -e ...`) so wait/progress/completion paths are stable in CI and local runs.
- Do not let e2e tests leak preference mutations across runs; reset persisted preferences at test boundaries to keep app-launch defaults deterministic and avoid cross-test pollution.
- Do not persist a temporary fallback choice just to support a one-off malformed-input retry; pass an explicit per-request fallback agent override through renderer IPC so the modal-selected agent applies only to that run.
