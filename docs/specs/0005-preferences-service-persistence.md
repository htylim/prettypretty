# 0005 Preferences Service Persistence

## Goal

Add a preferences framework that persists user settings on disk and exposes a typed getter/setter facade for UI code.
This spec covers logic only (storage, schema, validation, IPC bridge, service APIs), not a settings screen.
The first persisted preference is theme mode (`light` / `dark`) and must integrate with existing theme behavior.

## Problem / Context

Current UI state stores theme mode in renderer memory only and resets on app restart.
Without a persistence service, future settings (AI provider, shortcuts, behavior toggles) will be implemented ad hoc and drift.

## Deliverables

### Storage location decision (best practice)

- Store preferences under Electron `app.getPath('userData')`.
- File path: `<userData>/preferences.json`.
- Do not store preferences in the installation/runtime directory.
- Do not store preferences in `~/.<app>` custom folders.
- Do not use renderer `localStorage` as source of truth for app settings.
- `userData` is the Electron-supported writable config location and maps to OS conventions:
- macOS: `~/Library/Application Support/<AppName>`.
- Linux: `~/.config/<AppName>`.
- Windows: `%APPDATA%\<AppName>`.

### File format decision

- Use JSON with explicit schema versioning.
- Initial structure:

```json
{
  "version": 1,
  "themeMode": "light"
}
```

- Use defaults when the file does not exist.
- On malformed JSON or invalid shape, move bad file to `preferences.corrupt.<timestamp>.json`, restore defaults, and rewrite the canonical file.

### Service and class design

- Add a main-process preferences module as single source of truth.
- Add `PreferencesStore` for disk IO, atomic writes, and migration entrypoint.
- Add `PreferencesService` facade for `get`, `getAll`, `set`, `update`, `reset`.
- Add schema/default/validation helpers for runtime guards.
- Keep renderer logic free of filesystem access; all preference writes go through preload IPC.
- Keep all writes serialized (single in-flight write queue) to avoid race corruption.
- Atomic persistence requirement: write to temp file in same directory (`preferences.json.tmp`), flush where available, then rename to final path.

### IPC facade design

- Extend `IPCChannels` with `preferences:get-all`, `preferences:update`, and `preferences:reset`.
- Extend `WindowApi` and preload bridge with `preferences.getAll()`, `preferences.update(patch)`, and `preferences.reset()`.
- Validate input in main process (never trust renderer payloads).

### Theme setting (first preference)

- Persist theme mode as `themeMode: 'light' | 'dark'`.
- App startup flow: renderer fetches stored preferences during bootstrap, hydrates store before user interaction, and applies `document.documentElement.dataset.theme`.
- Theme toggle flow: UI updates store optimistically, persists via `preferences.update({ themeMode })`, and rolls back on failure with non-blocking error logging.

### Migration/versioning policy

- Include `version` in file from day one.
- Create `migratePreferences(fromVersion, data)` scaffold even if `v1` has no prior migrations.
- Unknown keys are ignored during load and not re-emitted unless explicitly supported.

### Testing requirements

- Unit tests for preferences store/service: missing file defaults, persist/reload, invalid enum rejection, corrupt-file fallback, atomic temp-write + rename, migration scaffold.
- IPC tests: valid update succeeds, invalid payload is rejected, return shape matches shared contract.
- Renderer state tests: startup hydrates persisted theme and toggle triggers persistence call.

### Documentation updates required by implementation

- Update `docs/architecture.md` with preferences data flow.
- Update `docs/ui-spec.md` with persisted theme behavior.
- Update `docs/dependencies-and-tools.md` only if new libs are added.
- Update `docs/learnings.md` with pitfalls found during implementation.

Reference note for implementation agents: any code snippets in specs are intent examples only, not copy-paste source of truth.

## Acceptance Criteria

- [ ] Preferences are persisted to `<app.getPath('userData')>/preferences.json`.
- [ ] Preferences are never stored in install directory or renderer-only storage as source of truth.
- [ ] Main process exposes typed preferences facade with get/update behavior.
- [ ] Renderer accesses preferences only via preload bridge.
- [ ] Invalid/malformed on-disk file does not crash app; defaults are restored with corrupt-file rollover.
- [ ] Writes are atomic (temp file + rename) and serialized.
- [ ] `themeMode` is persisted and restored on app relaunch.
- [ ] Shared contracts stay typed across `src/shared`, `src/preload`, and `src/main`.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `docs/specs/0005-preferences-service-persistence.md`
- New: `src/main/preferences/preferencesTypes.ts`
- New: `src/main/preferences/preferencesDefaults.ts`
- New: `src/main/preferences/preferencesStore.ts`
- New: `src/main/preferences/preferencesService.ts`
- New: `tests/unit/main/preferences/preferencesStore.test.ts`
- New: `tests/unit/main/preferences/preferencesService.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/shared/window-api.ts`
- Modify: `src/renderer/state/uiStore.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `docs/architecture.md`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`

## Open Questions / Resolved Decisions

- Resolved: preferences persistence must live in Electron `userData` directory.
- Resolved: JSON + explicit schema version is preferred over ad hoc key-value flat files.
- Resolved: main process is the authority for validation and disk writes.
- Open question: should theme support a third `system` mode now, or stay `light|dark` only in this spec?
