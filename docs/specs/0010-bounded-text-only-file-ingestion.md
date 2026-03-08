# 0010 Bounded Text-Only File Ingestion

## Goal

Make file ingestion safe and predictable by accepting only supported text inputs within explicit size limits.
Open-file and drag-drop flows must reject oversized or non-text payloads before they can freeze the app or produce garbage output.

## Problem / Context

Current open-file and drag-drop flows read arbitrary files as UTF-8 with no size cap.
That allows binary files, very large files, and unsupported payloads to reach the renderer and can cause hangs, memory spikes, or unreadable content.

## Deliverables

### Ingestion guardrails

- Define one shared ingestion policy in main process:
  - explicit maximum file size in bytes,
  - supported text extensions and/or MIME checks,
  - rejection of binary or undecodable content,
  - normalized user-facing error/result shape.
- Apply the same policy to both open-file and drag-drop ingestion paths.

### Main/preload/renderer changes

- Move drag-drop file reading out of the renderer and through preload/main so size/type checks happen before full content enters renderer memory.
- Keep dialog-open and drag-drop behavior aligned through one ingestion boundary API instead of separate ad-hoc readers.
- Add explicit handling for:
  - oversized file,
  - unsupported file type,
  - unreadable or undecodable content.
- Surface rejection feedback as clear inline notice or modal-level app error, without switching to output mode.

### API contract changes

- Extend shared IPC/window API contracts as needed for a typed ingest-file request/result.
- Keep result payloads explicit; do not overload `null` to mean every failure case.

### Testing requirements

- Add/extend unit tests for:
  - accepted small supported text file,
  - oversized file rejection,
  - unsupported/binary file rejection,
  - drag-drop and open-file parity,
  - no pane switch on rejected ingest.
- Add or update Electron E2E coverage for one accepted file and one rejected file path.

### Documentation updates

- Update `docs/architecture.md` runtime flow and security sections with bounded main-owned ingestion.
- Update `docs/ui-spec.md` empty-state / ingestion rules with rejection behavior.
- Update `docs/learnings.md` with the “do not ingest arbitrary files in renderer” rule.

## Acceptance Criteria

- [ ] Open-file and drag-drop use the same bounded ingestion policy.
- [ ] Files above the configured size cap are rejected before content is loaded into renderer state.
- [ ] Unsupported or binary payloads are rejected with clear user feedback.
- [ ] Accepted text files keep current successful ingest behavior.
- [ ] Rejected ingest does not switch to output mode or mutate current document content.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/shared/window-api.ts`
- Modify: `src/renderer/components/EditorShell.tsx`
- Modify: `src/renderer/app/useAppController.ts`
- Modify: `src/renderer/app/usePrettifierFlow.ts` if ingest state/result handling changes
- Modify: `tests/unit/main/ipc/preferencesIpc.test.ts` and/or add a dedicated ingest IPC test file
- Modify: `tests/unit/renderer/components/EditorShell.test.tsx`
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `tests/e2e/app-flows.spec.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0010-bounded-text-only-file-ingestion.md`

## Resolved Decisions

- Renderer should not read dropped file blobs directly for this app.
- Rejection paths must be typed and user-visible.
- This spec covers guardrails and parity, not richer import workflows.
