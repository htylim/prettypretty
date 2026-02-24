# 0004 Output Editor Read-Only IDE Parity

## Goal

Replace the current plain `<pre>` output renderer with an IDE-grade read-only code viewer that behaves like VS Code/Cursor for readability and navigation.
The output view must support syntax highlighting across multiple formats, line-number gutter + fold controls, colored nesting guides, and full light/dark theme sync.
The feature remains read-only and does not introduce authoring/IDE capabilities.

## Problem / Context

Current output mode is a plain text block:

- no language-aware syntax highlighting,
- no line number gutter,
- no fold controls,
- no indentation/nesting guides,
- no editor-level theme semantics.

This makes long structured outputs harder to scan and navigate.

## Deliverables

### Dependency decision

- Adopt `monaco-editor` + `@monaco-editor/react` for output rendering.
- Rationale: Monaco is the editor core used by VS Code/Cursor and is a popular, production-grade package with native support for gutter, folding, guides, and themes.
- Do not add secondary syntax-highlighting libraries for output view in this spec.

### Output renderer refactor

- Create `OutputEditor` component and replace `<pre className="output-editor">` path in `EditorShell`.
- Keep `EditorShell` as orchestration surface (drop/paste/open/input), but move output rendering concerns into `OutputEditor`.
- Keep output editor strictly read-only (`readOnly: true`, minimap enabled for navigation, no inline suggestions, no diagnostics popups).

### Line number scope (current vs future)

- Current scope: line numbers are always enabled in output mode.
- Do not add user-facing or store-backed line-number toggle logic in this implementation.
- Add a small extension seam in output-editor config (for example `getLineNumbersOption()` or equivalent) so future settings integration is additive and low-risk.

### Language detection and malformed input tolerance

- Add `detectOutputLanguage(text: string): OutputLanguageId` utility.
- Language detection must not depend on successful parsing.
- Heuristics should classify at least: JSON, JavaScript, TypeScript, YAML, XML, SQL, Markdown, Plain Text.
- For malformed JSON-like text, still select `json` when structural heuristics match (`{`, `}`, `:`, quotes, commas) even when parse fails.
- Unknown or ambiguous content falls back to `plaintext`, except JSON-like ambiguous content should prefer `json` when first non-whitespace character is `{` or `[` and structural hints are present.
- Keep ambiguity strategy easy to change by centralizing it in one detector function with explicit precedence comments/tests.
- Rendering must never crash on malformed or partial text.

### Gutter and folding behavior

- Line numbers are always shown in left gutter in current scope.
- Fold controls visible in gutter on hover only (match requested behavior).
- Wire toolbar `Expand` / `Collapse` actions to Monaco unfold-all and fold-all actions in output mode.
- Maintain current rule: those actions stay disabled in input mode.
- Persist fold state for the current loaded document while the app session is active and the document identity has not changed.

### Colored vertical nesting guides

- Enable Monaco indentation guides and bracket-pair guides.
- Enable bracket pair colorization to produce depth-based colored vertical guides.
- Define explicit depth colors for both light and dark themes (minimum 6 nesting levels before repeating).
- If built-in Monaco guide rendering does not match required visual clarity, add follow-up task for custom guide decoration plugin (not in this scope unless necessary).

### Theme integration

- Register two Monaco themes: `prettypretty-light` and `prettypretty-dark`.
- Theme switch must follow existing app theme state and update without remounting editor.
- Theme token values must align with `src/renderer/styles/tailwind.css` palette direction.

### Search behavior integration

- Use Monaco native find widget for output search behavior.
- Keep output text unchanged by avoiding any custom search marker/decorations pipeline.
- Support `Cmd+F` opening Monaco find in output mode even when focus is outside editor content.

### Accessibility and UX constraints

- Output editor must preserve keyboard scrolling/navigation.
- Output pane remains non-editable but selectable/copyable.
- No command palette, no intellisense, no edit affordances.

### Documentation updates required by implementation

- Update `docs/ui-spec.md` with output editor behavior details.
- Update `docs/design-style.md` with gutter/guide/theme token rules specific to output editor.
- Update `docs/dependencies-and-tools.md` with Monaco packages and reason.
- Update `docs/learnings.md` with implementation insights after delivery.

Reference note for implementation agents: any code snippets in specs are intent examples only, not copy-paste source of truth.

## Acceptance Criteria

- [ ] Output mode renders through Monaco-based read-only editor (no plain `<pre>` output renderer).
- [ ] Syntax highlighting is active for supported formats and does not crash on malformed input.
- [ ] Malformed JSON-like text still receives JSON-style tokenization heuristically.
- [ ] Left gutter displays line numbers by default.
- [ ] Fold controls appear on gutter hover and can collapse/expand nested blocks.
- [ ] `Expand` toolbar action unfolds all output blocks; `Collapse` folds all output blocks.
- [ ] Colored vertical nesting guides are visible and depth-based in both light and dark themes.
- [ ] App light/dark toggle updates Monaco theme in output mode.
- [ ] Line numbers are always visible in current scope, with output-editor configuration seam ready for future settings-driven toggle work.
- [ ] Search in output mode uses Monaco native find with no custom search decoration pipeline.
- [ ] Existing ingestion flow (drop/paste/open -> output mode) remains intact.
- [ ] `pnpm test` passes.
- [ ] `pnpm check` passes.

## File Summary

- New: `docs/specs/0004-output-editor-readonly-ide-parity.md`
- New: `src/renderer/components/OutputEditor.tsx`
- New: `src/renderer/output/detectOutputLanguage.ts`
- New: `src/renderer/output/outputEditorConfig.ts`
- New: `src/renderer/output/monacoThemes.ts`
- New: `tests/unit/renderer/components/OutputEditor.test.tsx`
- New: `tests/unit/renderer/output/detectOutputLanguage.test.ts`
- Modify: `src/renderer/components/EditorShell.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Toolbar.tsx` (wire collapse/expand behavior to output editor controller)
- Modify: `tests/unit/renderer/components/EditorShell.test.tsx`
- Modify: `tests/unit/renderer/components/Toolbar.test.tsx`
- Modify: `tests/unit/renderer/App.test.tsx`
- Modify: `tests/e2e/app.spec.ts` (add output editor behavior assertions)
- Modify: `docs/ui-spec.md`
- Modify: `docs/design-style.md`
- Modify: `docs/dependencies-and-tools.md`
- Modify: `docs/learnings.md`

## Open Questions / Resolved Decisions

- Resolved: output editor remains read-only; no in-place editing or coding-IDE authoring features.
- Resolved: Monaco is the selected package for IDE parity and stability.
- Resolved: line numbers stay always visible in current scope; optional visibility setting is deferred.
- Resolved: fold state persists for current document during session while document identity is unchanged.
- Resolved: ambiguous JSON-like content should prefer JSON highlighting, and the detector strategy must stay centralized and easy to revise.
- Open questions: none.
