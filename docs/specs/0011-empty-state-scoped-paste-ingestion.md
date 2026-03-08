# 0011 Empty-State Scoped Paste Ingestion

## Goal

Restrict shell-level paste ingestion to the empty-state entry path so normal editor paste behaves like normal editing.
Pasting into Monaco or other interactive surfaces must never be treated as whole-document ingest unless the app is explicitly in empty-state ingest mode.

## Problem / Context

Current paste handling is attached to the editor shell container.
That makes bubbled paste events easy to misclassify as app-level ingest, which can replace the current document or switch panes unexpectedly.

## Deliverables

### Interaction model changes

- Scope paste-driven ingest to the empty state only.
- When content already exists, paste inside the input editor must remain editor-local and must not trigger shell ingest.
- Keep the existing exception that Monaco find widget paste stays local.
- Preserve click-open and drag-drop ingest behavior.

### Renderer changes

- Refactor `EditorShell` so paste ingestion is bound only to the empty-state affordance or another explicit ingest surface.
- Remove reliance on broad container-level `onPaste` for app-wide ingestion.
- Keep ingestion behavior for empty paste:
  - remain in input mode,
  - do not show file-empty notice.

### Test coverage

- Add/extend unit tests for:
  - empty-state paste still ingests,
  - paste inside input editor does not call ingest callback,
  - paste inside Monaco find widget still does not ingest,
  - existing document content is not replaced by shell-level paste when not in empty state.
- Add or update E2E coverage for pasting into an existing document and confirming editor-local behavior.

### Documentation updates

- Update `docs/ui-spec.md` editing and ingestion rules to distinguish empty-state ingest paste from normal editor paste.
- Update `docs/learnings.md` with the shell-paste scoping rule.

## Acceptance Criteria

- [ ] Empty-state paste still routes through the ingest flow.
- [ ] Paste into the input editor with existing content does not trigger app-level ingest.
- [ ] Paste into Monaco find/replace inputs stays local.
- [ ] Existing document state is not unexpectedly replaced by bubbled paste events.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- Modify: `src/renderer/components/EditorShell.tsx`
- Modify: `src/renderer/App.tsx` if empty-state affordance structure changes
- Modify: `tests/unit/renderer/components/EditorShell.test.tsx`
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `tests/e2e/app-flows.spec.ts`
- Modify: `docs/ui-spec.md`
- Modify: `docs/learnings.md`
- New: `docs/specs/0011-empty-state-scoped-paste-ingestion.md`

## Resolved Decisions

- Paste-as-ingest is an empty-state affordance, not a global shell behavior.
- This spec does not change drop/open-file ingestion behavior.
