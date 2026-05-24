# Refresh Loaded File Specification

## Current State

`prettypretty` can ingest text from an open-file dialog, launch/open-file startup payload, drop, or paste. The renderer currently keeps only the input text, not the path or clean baseline of the file that produced it.

Relevant current code:

- `src/main/ipc/index.ts:107` opens a file through Electron's dialog and returns `{ path, content }`.
- `src/main/index.ts:117` keeps startup files window-scoped until the renderer consumes them.
- `src/renderer/app/useAppController.ts:245` opens a file and calls `ingestInputText(file.content, 'open-file')`, dropping the path.
- `src/renderer/app/useAppController.ts:482` consumes launch files and also drops the path after routing through open-file ingestion.
- `src/renderer/app/usePrettifierFlow.ts:246` owns ingest, Monaco limit rejection, input mutation, and prettifier reruns.
- `src/renderer/app/session/documentSessionDomain.ts:12` is the window-local renderer session state.
- `src/renderer/components/Toolbar.tsx:180` renders the indent dropdown; the refresh button belongs immediately before this control.
- `src/renderer/app/useKeyboardShortcuts.ts:87` handles renderer shortcuts, but `src/main/menu/applicationMenu.ts:95` installs Electron's default `viewMenu`, which likely owns `Cmd+R` as Reload today.
- `src/renderer/components/ConfirmationModal.tsx:48` is the existing modal pattern.
- `src/renderer/output/monacoEditorRuntime.ts:43` and `src/renderer/components/useOutputEditorRuntime.ts:185` show the existing output view-state pattern.

Problem:

- There is no refreshable file identity in the renderer session.
- There is no IPC for re-reading the current file without opening a dialog.
- `Cmd+R` is probably captured by Electron's default reload menu role before renderer code can handle it.
- A normal ingest always switches to output on non-empty content, which does not match refresh preserving the current input/output view.
- Dirty input edits are not tracked against a file baseline.

## Desired End State

Each document window that was loaded from a trusted file path can refresh that same file from disk.

Behavior:

- A toolbar refresh button appears immediately to the left of the `Indent` dropdown.
- The button uses the shared toolbar button style, an icon-only control, `aria-label="Refresh"`, and title `Refresh (Cmd+R)`.
- `Cmd+R` / `Ctrl+R` triggers the same refresh command for the focused document window.
- Refresh is window-local. It must refresh only the file loaded in that window.
- Refresh is a no-op when the current input was not loaded from a refreshable file path.
- Paste-loaded input is never refreshable.
- Normal text edits inside the input editor, including paste edits into Monaco, must preserve the file source and mark it dirty. Only document-level paste ingestion that replaces the current document clears file source.
- Drop-loaded input is not refreshable unless a future implementation routes a trusted path through main. The first implementation should treat current drop ingestion as non-refreshable because it only receives browser `File.text()` content in the renderer.
- If the input editor is dirty, show a confirmation dialog before losing edits:
  - Title: `Refresh file?`
  - Message: `Changes made in the input editor will be lost. Do you want to continue?`
  - Cancel: `Cancel`
  - Confirm: `Refresh`
- Canceling the dialog leaves input, output, mode, focus, and viewport untouched.
- Confirming refresh re-reads the file from disk, replaces the input editor text, and reruns prettification.
- The dirty-refresh prompt must store a snapshot of `fileSource`, baseline text, and current input text. Confirming the prompt must revalidate that the snapshot still matches the current session and that the session is refreshable except for the currently open dirty prompt before starting the read. If the snapshot is stale, close the prompt and no-op.
- If the user was in input mode before refresh, they remain in input mode after refresh.
- If the user was in output mode before refresh, they remain in output mode after refresh.
- The active editor should remain at the same logical cursor/viewport position as far as the new content allows.
- If the previous focused line no longer exists, clamp to the final line in the refreshed input/output.
- If refresh reads an empty file, commit that file-backed source with `lastLoadedText === ''`, keep refresh available for the trusted file, show the existing empty-file notice, and switch to input mode because output is not available.
- If refresh reads content rejected by Monaco ingest limits, show the existing oversized-content dialog and do not mutate the current window until the user chooses `Open readable portion`.
- If `Open readable portion` is chosen for a refreshed file, the displayed readable slice becomes the clean baseline for subsequent dirty checks.
- If the file cannot be re-read because it was deleted, permissions changed, or any other read error occurs, preserve all current window state, clear the refresh-in-flight state, leave the dirty baseline unchanged, report the error through the existing renderer error path, and show a non-destructive `ingestNotice`: `Unable to refresh file.` The existing notice dismissal behavior should be reused.
- Do not add a new UTF-8 validation promise as part of this feature. Current file reads use Node's UTF-8 string decoding behavior. Fatal invalid-byte detection is out of scope unless separately specified.
- If the user edits input after a refresh request starts but before the file read/prettify result is ready, the refresh result must not overwrite those edits silently. The implementation must compare a request snapshot against the current session before mutating input. If current input differs from the request snapshot, abort the stale refresh or re-enter the dirty confirmation flow before applying it.
- Refresh availability is exactly `fileSource !== null && !isRefreshing && fallbackWaitState === null && fallbackModalState === null && ingestRejectionPrompt === null && dirtyRefreshPrompt === null`.
- The toolbar button is disabled when refresh is unavailable. Shortcut, menu, and direct controller refresh invocations must no-op when refresh is unavailable.

## Patterns To Follow

- Keep renderer free of direct Node/Electron APIs. File re-read must happen through preload IPC.
- Put IPC channel names and payload/return types in `src/shared`.
- Validate renderer-originated payloads in `src/main/ipc/index.ts`.
- Keep file-source state window-local in `src/renderer/app/session/*`.
- Keep orchestration in `src/renderer/app/useAppController.ts` or a focused hook composed by it, not in `App.tsx` or `Toolbar.tsx`.
- Keep `Toolbar.tsx` render-only: props in, callbacks out.
- Use the existing `ConfirmationModal` style for dirty-refresh confirmation.
- Preserve `App.tsx` as composition-only.
- Extend existing unit tests beside the changed renderer/main modules.
- Add Electron E2E for the user-visible refresh journey.
- Do not read historical specs while implementing this work. Code and current docs are the source of truth.

## Resolved Decisions

- Refreshable source means a path authorized by main from an open-file dialog or startup/open-file launch payload.
- Paste and current drop ingestion clear refreshable file state.
- The refresh button is disabled exactly when `canRefreshFile` is false. The shortcut and menu event use the same guard.
- `Cmd+R` should not reload the Electron renderer. Replace the default Electron `viewMenu` role with an explicit app menu shape that does not include Reload, then add a refresh menu item with `CommandOrControl+R`.
- Main should send a focused-window refresh event for the menu accelerator. Renderer keydown handling may also support `Cmd/Ctrl+R`, but the menu event is required because Electron accelerators can intercept the shortcut first.
- Refresh should reuse the ingest guard and prettifier flow. Do not create a second formatting path.
- Refresh should use a distinct trigger/telemetry source such as `refresh-file` so tests and logs can distinguish it from a user opening a different file.
- Derived output panes are invalidated when root output changes. If refresh starts from a derived output pane, restore to the root output editor at the captured/clamped logical line rather than keeping stale derived pane content.
- Derived-pane restore mapping:
  - `source-range` panes map their displayed line back to the root output line using their `sourceRange`
  - extracted-source panes map their displayed line back to the root output line using their `sourceRange` and `lineNumberStart`
  - independent context-prettify panes have no reliable root mapping, so refresh should restore the previous root output viewport if available, otherwise line 1

## Out Of Scope

- File watching or automatic reload.
- Refreshing paste content.
- Refreshing current drag/drop content without a trusted main-process path.
- Saving dirty input before refresh.
- Diffing the dirty input against the refreshed file.
- Preserving stale derived output panes across a root-output refresh.
- Adding new dependencies.

## Deliverables

### Architecture Decisions

- Add file-source metadata to the window-local document session:
  - `sourceToken`
  - `path`
  - `lastLoadedText`
  - required `sourceKind`
- Define `FileSourceKind` as an explicit union:
  - `dialog-open-file`
  - `startup-open-file`
  - `refresh-file`
- Dirty input is `fileSource !== null && inputText !== fileSource.lastLoadedText`.
- Add explicit pending file-source metadata to rejected-ingest prompts. The prompt must preserve the file path and source kind needed to commit the correct file baseline if the user accepts the readable slice.
- Add a main-process refresh-file IPC path that only reads paths authorized for the sender window.
- Main must track pending and committed refresh sources per window, not a historical allow-list:
  - pending source: created after main successfully reads a file and sends it to the renderer
  - committed source: created only after renderer confirms that the file-backed ingest was accepted into the visible session
  - both records include a main-issued opaque `sourceToken` and `path`
- Main must not replace the committed current source merely because a different file was successfully read. Oversized rejection, user abort, or any renderer-side rejected ingest must preserve the previous committed source until the renderer explicitly commits or clears it.
- Authorize/update pending source in main only after a successful file read/return:
  - after `dialog:open-file` successfully reads and returns a token-bearing open-file payload
  - after a startup/open-file payload is successfully consumed by that window
  - after `refreshOpenFile({ path, sourceToken })` validates the current committed source and successfully re-reads the same path
- Refresh reads use a token rollover model: `refreshOpenFile` validates the committed `{ path, sourceToken }`, reads the file, returns a new pending `sourceToken` for the same path with `sourceKind: 'refresh-file'`, and keeps the previous committed source active until renderer commits the pending refresh source.
- Renderer must explicitly commit the pending source after accepted normal file-backed ingest or accepted readable-slice ingest.
- File-backed ingest transaction order must be: validate Monaco ingest limits without mutating visible state; if accepted, commit the pending source in main; only after commit succeeds, mutate renderer visible session and file-source state. This applies to normal content, readable slices, and empty trusted files.
- Every async source transaction must be snapshot-guarded, not only refresh. Dialog-open ingest, startup ingest, readable-slice acceptance, accepted paste/drop clearing, and reset clearing must capture a session snapshot before starting commit/clear IPC, revalidate that snapshot before visible mutation, and discard stale transaction results.
- If a pending source is discarded before commit because the renderer transaction is stale, canceled, or superseded, renderer must clear that pending source in main. This applies to dialog, startup, refresh, and readable-slice pending tokens.
- If commit succeeds in main but the renderer session changes before visible mutation, immediately clear that newly committed source if it is no longer the current renderer source, preserve the current visible session, and do not overwrite newer input. Because main cannot restore the previous committed source without a dedicated rollback contract, renderer must also clear/disable its local file source unless the current renderer source already matches the committed source. Do not leave the UI refreshable with a token main no longer accepts.
- If clear succeeds in main but the renderer session changes before visible mutation, do not overwrite newer input; the current renderer source must already be absent or must be re-established only by a later accepted file-backed commit.
- Renderer must explicitly clear pending source on rejected-ingest abort, stale refresh result, dirty prompt invalidation, and failed/aborted refresh acceptance.
- File-backed replacement does not clear the old committed source first. It commits the new pending source over the old committed source only after the new file-backed ingest is accepted; if that commit fails, preserve the previous visible session and committed source.
- Renderer must clear committed source only when the accepted transition moves the session into a non-refreshable/no-source state: accepted document-level paste ingestion, current untrusted drop ingestion, or reset. Input-editor paste edits are ordinary dirty edits and must not clear file source. Rejected/aborted oversized paste, drop, open-file, or refresh attempts must preserve the previous committed source and only clear the new pending source.
- Clearing a committed source is fail-closed and must happen before visible session mutation for accepted paste/drop/reset transitions. If clear fails, do not mutate the visible session into a non-file-backed state; preserve the previous visible session and file-source state, report the error, and show `Unable to refresh file.`
- Renderer refresh requests must include the current `sourceToken`; main must reject requests whose token/path do not match the sender window's committed current source.
- Reject or no-op refresh IPC for untrusted paths instead of reading arbitrary renderer-supplied paths.
- Add a focused-window app event for `Cmd/Ctrl+R`, parallel to the reset-current-window event.
- Add active editor viewport snapshot and restore methods to the existing Monaco editor handles. The snapshot should be a small typed value, not Monaco objects.
- Add refresh request sequencing in renderer orchestration:
  - capture `requestId`, file-source `sourceToken`, path, source kind, last-loaded text, input text, pane mode, active pane identity, and viewport snapshot before the async read
  - before the pre-commit input mutation, verify that the request is still current and current `fileSource.sourceToken`, `fileSource.path`, `fileSource.sourceKind`, `fileSource.lastLoadedText`, and `inputText` match the captured pre-read snapshot unless the user has confirmed losing newer edits
  - after commit and visible input mutation, capture a second post-commit snapshot containing the new `fileSource`, new input text, pane mode, and request id
  - before final refresh-triggered prettifier output application, verify against the post-commit snapshot, not the pre-read snapshot
  - invalidate pending refresh requests and dirty-refresh prompts on reset, accepted new open-file ingestion, accepted paste ingestion, accepted drop ingestion, accepted readable-slice ingestion, and any file-source replacement/clear
  - discard stale refresh responses
  - apply the same request-id/snapshot pattern to non-refresh file-source commit and clear transactions

### UI Decisions

- Add an icon-only refresh button in `Toolbar`.
- Use `react-icons/vsc` if it exposes a suitable refresh icon, keeping current toolbar iconography consistent.
- Place the button after Copy and before `IndentSizeDropdown`.
- Disabled state is driven by `canRefreshFile`.
- The dirty confirmation modal is a separate `ConfirmationModal` instance in `App.tsx`, with state and actions owned by the controller.
- Dirty confirmation state stores the refresh snapshot and is cleared whenever that snapshot no longer matches the document session.

### Data Model Decisions

- Extend `DocumentSessionState` with refreshable file source state.
- Add a typed `PendingIngestFileSource` shape for file-backed ingest attempts:
  - `sourceToken`
  - `path`
  - `sourceKind`
  - `baselineText`
  - `commitOnReadableSlice`
- Reset clears file source state.
- Open-file and launch-file accepted ingestion sets file source state.
- Paste and drop accepted ingestion clear file source state.
- Input-editor text edits, including paste edits handled by Monaco, preserve file source state and only affect dirty status.
- Rejected/aborted oversized paste and drop attempts leave the current visible session and committed file source unchanged.
- A blocked oversized ingest must not update file source state until the user accepts the readable slice.
- A readable slice from a file-backed source updates `lastLoadedText` to the slice shown in the input editor.
- Main-process refresh authorization is a per-window pending/committed current-source record, not a historical allow-list. Main must clean up both records when the window is destroyed. This avoids arbitrary reads and prevents a renderer from refreshing an older path that is no longer the window's current file.
- Dialog open-file and startup/launch-file ingestion must call `ingestInputText` with explicit file-backed metadata. Reusing source string `'open-file'` alone is not enough because it loses `path` and `sourceKind`.

### Code Change Decisions

- Add shared IPC types/channels:
  - `RefreshableOpenTextFile` result with `path`, `content`, and `sourceToken`
  - refresh-file request payload with `path` and `sourceToken`
  - commit-file-source request payload with `sourceToken`, `path`, and committed baseline text metadata if needed by renderer state
  - clear-file-source request payload with `sourceToken` and scope (`pending` or `committed`) when available
  - app refresh-current-window event channel
- Extend preload and `WindowApi`:
  - `file.refreshOpenFile({ path, sourceToken })`
  - `file.commitOpenFileSource({ path, sourceToken })`
  - `file.clearOpenFileSource({ path, sourceToken, scope })`
  - `app.onRefreshCurrentWindow(listener)`
- Extend `registerIpcHandlers`:
  - keep pending and committed authorized refresh sources per window
  - read only committed matching authorized paths through `readOpenTextFile`
  - validate token-bearing payload shapes and string paths
- Extend application menu:
  - add `Refresh File` with `CommandOrControl+R`
  - remove the default reload accelerator from the app menu by replacing `role: 'viewMenu'` with a custom view menu that includes only intended items
- Extend `useKeyboardShortcuts` with `refreshCurrentFile`.
- Extend `useAppController` or a focused `useFileRefreshFlow` composed by it:
  - expose `canRefreshFile`, `isRefreshConfirmationOpen`, and refresh actions
  - compute `canRefreshFile` exactly from file-source plus inactive refresh/fallback/modal state
  - no-op when no refreshable file exists
  - commit must succeed before renderer marks a file source refreshable or enables refresh for it
  - if commit fails, preserve the previous visible session and file-source state, report the error, and show `Unable to refresh file.`
  - committed-source clear operations must succeed before accepted paste/drop/reset mutates visible state; if clear fails, preserve previous visible session and file-source state, report the error, and show `Unable to refresh file.`
  - dirty-confirm before refreshing
  - invalidate dirty-refresh prompt state on reset, source clear/replacement, accepted new ingest, paste, drop, or any current-session mismatch
  - on dirty prompt confirmation, revalidate the prompt snapshot before reading from disk
  - read via `api.file.refreshOpenFile({ path, sourceToken })`
  - use request snapshots and request ids to prevent stale async refresh results from overwriting newer input edits
  - route accepted refreshed content through the shared ingest/prettifier path
  - call commit/clear file-source IPC when file-backed ingest is accepted, aborted, reset, accepted paste/drop occurs, or source is accepted/replaced
  - preserve previous pane mode except for empty/invalid-output cases where existing behavior must fall back to input
  - capture active input/output viewport before refresh and restore after input/output content settles
  - no-op while fallback execution, fallback modals, ingest rejection, or another refresh is active
  - on refresh read failure, preserve state, call `reportRendererError`, and show `Unable to refresh file.`
  - propagate explicit file-backed metadata for dialog and startup file ingestion
  - map derived-pane viewport snapshots back to root before root output invalidates derived panes
- Extend input/output handles:
  - capture logical line, column, top visible line, scroll left/top where available
  - restore after content changes with line/column clamped to the new model
- Update docs:
  - `docs/ui-spec.md` toolbar and shortcut sections
  - `docs/architecture.md` if ownership/IPC docs need a refresh-file note
  - `docs/learnings.md` with any durable pattern discovered during implementation

## Acceptance Criteria

- [ ] Refresh button appears immediately before the indent dropdown.
- [ ] Refresh button is disabled without a refreshable file source.
- [ ] Refresh button is disabled while refresh is in flight, fallback wait is active, fallback modal is open, ingest rejection modal is open, or dirty-refresh modal is open.
- [ ] Refresh button is enabled after opening a file through the dialog.
- [ ] Refresh button is enabled after a launch/open-file startup payload is consumed.
- [ ] Refresh button is disabled after paste ingestion.
- [ ] Refresh button is disabled after current drop ingestion unless trusted path support is explicitly added.
- [ ] Clicking refresh re-reads the same file from disk and updates input/output in the current window only.
- [ ] `Cmd/Ctrl+R` triggers refresh instead of Electron renderer reload.
- [ ] `Cmd/Ctrl+R` targets the focused document window when multiple windows are open.
- [ ] Dirty input shows the confirmation dialog before refresh.
- [ ] Canceling dirty refresh leaves the window unchanged.
- [ ] Confirming dirty refresh replaces dirty input with file contents and reruns prettification.
- [ ] Confirming a stale dirty-refresh prompt after reset, paste, drop, or source replacement no-ops and does not read or mutate content.
- [ ] Refresh from input mode stays in input mode.
- [ ] Refresh from output mode stays in output mode.
- [ ] Refresh restores the active editor to the same logical line/position when possible.
- [ ] Refresh clamps to the final available line when the old line no longer exists.
- [ ] Empty refreshed files show the existing empty-file notice and input mode.
- [ ] Empty trusted refreshed files commit `lastLoadedText === ''` and remain refreshable.
- [ ] Oversized refreshed files use the existing Monaco ingest rejection dialog and keep the old window state until accepted.
- [ ] Oversized refreshed files preserve file-source metadata in the prompt and commit the readable slice as the clean baseline only after the user accepts it.
- [ ] Successful refresh reads return a new pending token for `sourceKind: 'refresh-file'` and keep the old committed source until accepted.
- [ ] Stale or aborted refresh reads clear their pending token without replacing the old committed source.
- [ ] Oversized open-file rejection does not replace the previous committed refresh source in main unless the user accepts the readable slice.
- [ ] Rejected-ingest abort clears the pending main source and preserves the previous committed source.
- [ ] Accepted document-level paste, accepted drop, and reset clear the committed main source for the current window.
- [ ] Pasting/editing inside the input editor after opening a file preserves file source, marks input dirty, and causes refresh to prompt.
- [ ] Accepted file-backed replacement commits the new pending source over the old committed source without clearing the old committed source first.
- [ ] Rejected/aborted oversized paste, drop, open-file, and refresh attempts preserve the previous committed main source.
- [ ] Renderer does not mark a file source refreshable until commit IPC succeeds.
- [ ] Commit IPC failure preserves previous visible session/file-source state, disables refresh for the failed source, reports the error, and shows `Unable to refresh file.`
- [ ] Clear IPC failure before accepted paste/drop/reset preserves previous visible session and file-source state, reports the error, and shows `Unable to refresh file.`
- [ ] Refresh read errors preserve input/output/mode/viewport/file-source state and show `Unable to refresh file.`
- [ ] Stale refresh results do not overwrite input edits made after the refresh request started.
- [ ] Stale refresh results do not apply after file source path/kind/baseline changes, even when input text is coincidentally identical.
- [ ] Stale refresh final prettifier responses do not apply after user edits or file-source changes.
- [ ] Final refresh prettifier responses validate against a post-commit snapshot after token rollover.
- [ ] Stale dialog/startup/readable-slice pending tokens are cleared from main when renderer discards them before commit.
- [ ] If commit succeeds but renderer aborts before visible mutation, renderer clears/disables local file source unless it still matches main's committed source.
- [ ] Refresh no-ops while fallback execution, fallback modal prompts, ingest rejection prompts, or another refresh request is active.
- [ ] Main rejects refresh reads when `path` or `sourceToken` do not match the sender window's committed authorized source.
- [ ] Main creates pending sources only after successful open/startup file reads, and commits them only after renderer acceptance.
- [ ] Main cleans up pending and committed authorized sources when the sender window is destroyed.
- [ ] No renderer code imports Node or Electron runtime APIs directly.
- [ ] `App.tsx` remains composition-only.
- [ ] Documentation updates land with the implementation.
- [ ] `pnpm check` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm test:e2e` passes because this is user-visible Electron runtime behavior.

## Implementation Phases

### Phase 1: File Source State And Refresh IPC

#### Why This Phase Is Independently Verifiable

At the end of this phase, the app can know whether the current window has a refreshable file and main can safely re-read only an authorized path. No toolbar or shortcut is needed yet.

#### Changes Required

##### 1. Tests (RED)

**File**: `tests/unit/renderer/app/session/documentSessionDomain.test.ts`

Add tests:

- `tracks refreshable file source in initial and updated document session state`
- `reset clears refreshable file source while preserving preferences`

**File**: `tests/unit/renderer/app/session/useDocumentSession.test.ts`

Add tests:

- `sets and clears refreshable file source`

**File**: `tests/unit/renderer/app/usePrettifierFlow.test.ts`

Add tests:

- `sets file source only after accepted open-file ingestion`
- `sets required file source token path and sourceKind for dialog and startup files`
- `clears file source after paste ingestion`
- `clears file source after drop ingestion without trusted path`
- `defers file source update when file-backed ingest is blocked by Monaco limits`
- `sets file source to readable slice after accepting blocked file-backed ingest`
- `commits empty trusted file as refreshable with empty baseline`
- `stores pending file-source metadata on blocked file-backed ingest prompts`

**File**: `tests/unit/main/ipc/fileIpc.test.ts`

Add tests:

- `creates pending source after successful dialog file read`
- `creates pending source after startup file is consumed by the sender window`
- `does not create pending source after failed dialog or startup file read`
- `keeps successful dialog reads pending until renderer commits them`
- `does not replace committed source when pending source is cleared after ingest abort`
- `commits pending source by matching sourceToken`
- `refresh read validates committed token and returns a new pending refresh token`
- `clearing stale refresh pending token preserves previous committed source`
- `clears committed source by matching sourceToken on reset document paste or drop`
- `file-backed replacement commits new pending source over old committed source`
- `does not clear committed source for rejected oversized paste drop open or refresh attempts`
- `commit failure leaves pending source uncommitted and does not enable refresh`
- `clear failure before accepted paste drop or reset preserves previous visible session and source state`
- `rejects refresh reads when path is not the sender window committed source`
- `rejects refresh reads when sourceToken does not match the sender window committed source`
- `validates refresh read payload shape`
- `cleans up pending and committed authorized sources when the sender window is destroyed`
- `uses existing readOpenTextFile UTF-8 behavior without adding refresh-only decode rules`

**File**: `tests/unit/preload/index.test.ts`

Add tests:

- `exposes refresh-open-file IPC through the file bridge`
- `exposes commit and clear file-source IPC through the file bridge`

##### 2. Implementation (GREEN)

Files:

- `src/shared/ipc-contracts.ts`
- `src/shared/window-api.ts`
- `src/preload/index.ts`
- `src/main/ipc/index.ts`
- `src/renderer/app/session/documentSessionDomain.ts`
- `src/renderer/app/session/useDocumentSession.ts`
- `src/renderer/app/session/documentSessionSelectors.ts`
- `src/renderer/app/usePrettifierFlow.ts`
- `src/shared/prettifier.ts`
- `src/shared/telemetry.ts`

Implement:

- Shared types and channel constants for refresh-file reads.
- Preload bridge method for refresh-file reads.
- Main IPC handler with per-window pending/committed source authorization and token matching.
- Document session file-source state and actions.
- Ingest metadata updates that only commit file-source state after accepted file-backed input.
- A distinct refresh trigger/telemetry source for refreshed files.

#### Success Criteria

- [x] Phase 1 tests fail before implementation: `pnpm exec vitest run tests/unit/renderer/app/session/documentSessionDomain.test.ts tests/unit/renderer/app/session/useDocumentSession.test.ts tests/unit/renderer/app/usePrettifierFlow.test.ts tests/unit/main/ipc/fileIpc.test.ts tests/unit/preload/index.test.ts`
- [x] Phase 1 tests pass after implementation with the same selector.
- [x] `pnpm check` passes.
- [x] `pnpm test` passes before handing off this phase.

### Phase 2: Refresh Orchestration, Dirty Confirmation, And Viewport Restore

#### Why This Phase Is Independently Verifiable

At the end of this phase, refresh can be invoked through controller methods and renderer keyboard handling without relying on the toolbar UI or Electron menu wiring.

#### Changes Required

##### 1. Tests (RED)

**File**: `tests/unit/renderer/app/useAppController.test.ts`

Add tests:

- `exposes canRefreshFile false without refreshable file source`
- `exposes canRefreshFile false while refresh is in flight or any fallback/ingest/dirty-refresh modal state is active`
- `refresh no-ops without refreshable file source`
- `refresh reads the current file path and routes content through refresh ingestion`
- `commit failure after accepted file ingest preserves previous source state and shows refresh failure notice`
- `commit happens before visible file-backed ingest mutation`
- `clear failure before accepted paste preserves previous visible session and shows refresh failure notice`
- `input editor paste edit preserves file source and marks input dirty`
- `refresh preserves input mode`
- `refresh preserves output mode`
- `stale async refresh result does not overwrite edits made after refresh started`
- `stale async refresh result does not apply after file source changes with identical input text`
- `stale refresh prettifier response does not apply after user edits while prettify is pending`
- `final refresh prettifier response uses post-commit snapshot after token rollover`
- `stale dialog-open commit result does not overwrite newer input`
- `post-commit stale abort clears local file source when previous main source cannot be restored`
- `stale readable-slice commit result clears the orphan committed source and preserves newer input`
- `stale dialog or startup pending token is cleared when discarded before commit`
- `stale paste clear result does not overwrite newer input`
- `dirty refresh opens confirmation before reading from disk`
- `dirty refresh confirmation stores a file-source and input snapshot`
- `dirty refresh confirmation revalidates refreshable state except for its own open prompt`
- `confirming stale dirty refresh prompt after reset no-ops`
- `confirming stale dirty refresh prompt after source replacement no-ops`
- `canceling dirty refresh leaves input text and output state untouched`
- `confirming dirty refresh reads the file and reruns prettification`
- `refresh discards stale output context menu state before applying refreshed content`
- `refresh handles refresh-file read failure without mutating current content`
- `refresh no-ops while fallback is running`
- `refresh no-ops while fallback or ingest modals are open`
- `dialog and startup file ingestion pass file-backed metadata into ingest`

**File**: `tests/unit/renderer/app/outputPaneDomain.test.ts` or a new focused helper test if derived-pane restore mapping is extracted

Add tests:

- `maps extracted-source pane viewport snapshots back to root output lines`
- `maps source-range pane viewport snapshots back to root output lines`
- `falls back to previous root viewport for independent derived panes`
- `falls back to line 1 when an independent derived pane has no root viewport snapshot`

**File**: `tests/unit/renderer/app/useKeyboardShortcuts.test.ts`

Add tests:

- `routes Cmd+R to refreshCurrentFile and prevents default`
- `does not route shifted Cmd+R to refreshCurrentFile`

**File**: `tests/unit/renderer/components/InputEditor.test.tsx`

Add tests:

- `captures and restores viewport snapshots with clamped line and column`

**File**: `tests/unit/renderer/components/useOutputEditorRuntime.test.ts`

Add tests:

- `captures and restores output viewport snapshots with clamped line and column`

**File**: `tests/unit/renderer/App.test.tsx`

Add tests:

- `renders dirty-refresh confirmation modal and wires cancel/confirm actions`
- `pasting inside input editor on a file-backed document keeps refreshable source and dirty prompt behavior`

##### 2. Implementation (GREEN)

Files:

- `src/renderer/app/useAppController.ts`
- optional focused hook under `src/renderer/app/*` if it reduces controller complexity
- `src/renderer/app/useKeyboardShortcuts.ts`
- `src/renderer/components/InputEditor.tsx`
- `src/renderer/components/OutputEditor.tsx`
- `src/renderer/components/useOutputEditorRuntime.ts`
- `src/renderer/App.tsx`
- `src/shared/window-api.ts`
- `src/preload/index.ts`

Implement:

- Controller-level refresh command.
- Dirty confirmation state and actions.
- Keyboard shortcut support.
- Input/output viewport snapshot and restore handle methods.
- Restoration scheduling after refreshed content and prettifier output settle.
- Stale-response guards for refresh read/prettify sequences.
- Stale-response guards must wrap both input replacement and final refresh-triggered prettifier output application.
- Stale-transaction guards for all commit/clear-backed source transitions.
- Failure notice handling for refresh read errors.
- Explicit file-backed metadata propagation for dialog and startup file ingestion.
- Derived-pane-to-root viewport mapping before root output invalidates derived panes.

#### Success Criteria

- [ ] Phase 2 tests fail before implementation: `pnpm exec vitest run tests/unit/renderer/app/useAppController.test.ts tests/unit/renderer/app/useKeyboardShortcuts.test.ts tests/unit/renderer/app/outputPaneDomain.test.ts tests/unit/renderer/components/InputEditor.test.tsx tests/unit/renderer/components/useOutputEditorRuntime.test.ts tests/unit/renderer/App.test.tsx`
- [x] Phase 2 tests pass after implementation with the same selector.
- [x] Phase 1 tests still pass.
- [x] `pnpm check` passes.
- [x] `pnpm test` passes before handing off this phase.

### Phase 3: Toolbar Button And Electron Menu Shortcut

#### Why This Phase Is Independently Verifiable

At the end of this phase, the user-visible button and `Cmd/Ctrl+R` menu accelerator exist and point to the refresh orchestration.

#### Changes Required

##### 1. Tests (RED)

**File**: `tests/unit/renderer/components/Toolbar.test.tsx`

Add tests:

- `renders refresh button immediately before the indent dropdown`
- `uses shared toolbar button style and shortcut tooltip for refresh`
- `gates refresh button by canRefreshFile`
- `routes refresh button click to onRefresh`
- `keeps refresh disabled during all unavailable controller states`

**File**: `tests/unit/renderer/App.test.tsx`

Add tests:

- `passes refresh availability and handler to the toolbar`

**File**: `tests/unit/main/menu/applicationMenu.test.ts`

Add tests:

- `registers Refresh File with CommandOrControl+R`
- `does not include the default Reload menu accelerator`
- `invokes the configured refresh callback when the Refresh File menu item is activated`

**File**: `tests/unit/main/index.test.ts` or a new focused helper test if refresh/reset window commands are extracted

Add tests:

- `sends refresh request to the focused document window only`
- `does not send refresh request when the focused window is not a document window`

##### 2. Implementation (GREEN)

Files:

- `src/renderer/components/Toolbar.tsx`
- `src/renderer/App.tsx`
- `src/main/menu/applicationMenu.ts`
- `src/main/index.ts`
- `src/shared/ipc-contracts.ts`
- `src/preload/index.ts`
- `src/shared/window-api.ts`

Implement:

- Toolbar props and render changes.
- App wiring from controller to toolbar.
- Application menu refresh item.
- Focused-window refresh IPC event.
- App refresh-current-window listener registration.
- Removal/replacement of default reload menu behavior.

#### Success Criteria

- [x] Phase 3 tests fail before implementation: `pnpm exec vitest run tests/unit/renderer/components/Toolbar.test.tsx tests/unit/renderer/App.test.tsx tests/unit/main/menu/applicationMenu.test.ts tests/unit/main/index.test.ts`
- [x] Phase 3 tests pass after implementation with the same selector.
- [x] Phase 1 and Phase 2 tests still pass.
- [x] `pnpm check` passes.
- [x] `pnpm test` passes before handing off this phase.

### Phase 4: End-To-End Behavior And Documentation

#### Why This Phase Is Independently Verifiable

At the end of this phase, the full Electron runtime behavior is covered: real file reads, focused-window routing, menu accelerator behavior, dirty confirmation, and viewport preservation.

#### Changes Required

##### 1. Tests (RED)

**File**: `tests/e2e/app-flows.spec.ts` or `tests/e2e/window-lifecycle.spec.ts`

Add E2E tests:

- `refresh button reloads the current file and reruns prettify without changing pane mode`
- `Cmd+R refreshes the focused file-backed window instead of reloading Electron`
- `double Cmd+R/menu invocations while refresh is pending trigger only one refresh`
- `dirty input refresh prompts and cancel preserves edits`
- `dirty input refresh prompts and confirm replaces edits from disk`
- `edits made while refresh is pending are not overwritten without confirmation`
- `refresh clamps preserved line when refreshed content is shorter`
- `refresh from extracted-source derived pane restores the mapped root output line`
- `refresh from independent derived pane restores the previous root viewport or line 1`
- `paste-backed input ignores Cmd+R refresh`
- `multiple windows refresh only the focused window file`
- `refresh is disabled/no-op during fallback wait and modal states`

##### 2. Documentation (GREEN)

Files:

- `docs/ui-spec.md`
- `docs/architecture.md`
- `docs/learnings.md`
- `README.md` only if command or product summary needs an update

Update:

- Toolbar section with `Refresh`.
- Shortcuts section with `Cmd/Ctrl+R`.
- Input/output behavior with file-backed refresh semantics.
- Architecture docs for refresh IPC/file-source ownership if useful.
- Learnings with durable patterns discovered during implementation.

#### Success Criteria

- [x] Phase 4 E2E tests fail before implementation/docs completion: `pnpm test:e2e -- --grep refresh`
- [x] Phase 4 E2E tests pass after implementation/docs completion: `pnpm test:e2e -- --grep refresh`
- [x] Full `pnpm check` passes.
- [x] Full `pnpm test` passes.
- [x] Full `pnpm test:e2e` passes.
- [ ] Manual check: open a file, scroll to line 100 in input, edit input, press `Cmd+R`, cancel, and verify the cursor/viewport and dirty text remain unchanged.
- [ ] Manual check: repeat, confirm refresh, and verify input is reloaded from disk, output is rerun, and mode/line are preserved or clamped.
- [ ] Manual check: delete or chmod the backing file, refresh, and verify current state remains intact with `Unable to refresh file.`

## Testing Strategy

Unit tests:

- Session state for file source and dirty baseline.
- IPC authorization and payload validation.
- Preload bridge exposure.
- Controller refresh orchestration and dirty confirmation.
- Keyboard shortcut behavior.
- Toolbar render/order/disabled/click behavior.
- Menu accelerator setup.
- Monaco viewport snapshot/restore helpers.
- Derived-pane viewport mapping back to root output.

E2E tests:

- Real file refresh updates content from disk.
- `Cmd+R` does not reload the app.
- Dirty confirmation cancel/confirm.
- Multi-window focused-window isolation.
- View/mode/line preservation.
- Refresh from derived output panes.
- Paste no-op.

Manual tests:

- Refresh from input and output.
- Refresh shorter file line clamping.
- Refresh empty file.
- Refresh oversized file and readable-slice recovery.
- Refresh while fallback is running: expected behavior is disabled/no-op and must be documented/tested.

## File Summary

Expected source files:

- `src/shared/ipc-contracts.ts`
- `src/shared/window-api.ts`
- `src/shared/prettifier.ts`
- `src/shared/telemetry.ts`
- `src/preload/index.ts`
- `src/main/ipc/index.ts`
- `src/main/index.ts`
- `src/main/menu/applicationMenu.ts`
- `src/renderer/app/session/documentSessionDomain.ts`
- `src/renderer/app/session/useDocumentSession.ts`
- `src/renderer/app/session/documentSessionSelectors.ts`
- `src/renderer/app/usePrettifierFlow.ts`
- `src/renderer/app/useAppController.ts`
- `src/renderer/app/useKeyboardShortcuts.ts`
- optional `src/renderer/app/useFileRefreshFlow.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/Toolbar.tsx`
- `src/renderer/components/InputEditor.tsx`
- `src/renderer/components/OutputEditor.tsx`
- `src/renderer/components/useOutputEditorRuntime.ts`

Expected test files:

- `tests/unit/preload/index.test.ts`
- `tests/unit/main/ipc/fileIpc.test.ts`
- `tests/unit/main/menu/applicationMenu.test.ts`
- `tests/unit/renderer/app/session/documentSessionDomain.test.ts`
- `tests/unit/renderer/app/session/useDocumentSession.test.ts`
- `tests/unit/renderer/app/usePrettifierFlow.test.ts`
- `tests/unit/renderer/app/useAppController.test.ts`
- `tests/unit/renderer/app/useKeyboardShortcuts.test.ts`
- `tests/unit/renderer/components/Toolbar.test.tsx`
- `tests/unit/renderer/components/InputEditor.test.tsx`
- `tests/unit/renderer/components/useOutputEditorRuntime.test.ts`
- `tests/unit/renderer/App.test.tsx`
- `tests/e2e/app-flows.spec.ts` or `tests/e2e/window-lifecycle.spec.ts`

Expected docs:

- `docs/ui-spec.md`
- `docs/architecture.md`
- `docs/learnings.md`
- maybe `README.md`

## Open Questions

None for the first implementation. If implementation discovers that Electron exposes a safe, main-authorized path for dropped files, add that as a separate follow-up decision rather than expanding this work silently.
