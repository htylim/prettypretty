# Documentation Writing

## Goals

- Be accurate before being comprehensive.
- Optimize for onboarding and day-to-day implementation work.
- Keep docs short enough to read end to end.

## File Roles

- `README.md`
  - quick start
  - command reference
  - doc map
- `docs/architecture.md`
  - current code structure
  - ownership boundaries
  - where to work
- `docs/ui-spec.md`
  - current user-visible behavior
- `docs/design-style.md`
  - reusable visual rules
- `docs/engineering-guidelines.md`
  - coding, testing, and quality expectations

## Writing Rules

- Write the current state, not the history of how the code got there.
- Prefer stable guidance over implementation trivia.
- Each document should stand on its own.
- Link behavior to real files or modules when that improves orientation.
- Use headings and bullet lists.
- Keep one document focused on one job.

## Avoid

- stale milestone language
- historical ledgers in onboarding docs
- generic instructions copied from other stacks
- long prose when a short bullet list is enough

## Update Rule

If a change affects behavior, ownership, or the expected way to work in the repo, update the relevant doc in the same change.
