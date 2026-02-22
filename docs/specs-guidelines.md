# Writing Specs

Specs are instructions for coding agents. They define what to build, why, and how to verify it's done.

## Structure

### 1. Goal

State what the spec achieves in 2-3 sentences. Include a usage example if relevant.

### 2. Problem / Context (optional)

Explain _why_ this is needed. What problem does it solve? What's the intent?

### 3. Deliverables

Be explicit. Communicate clearly:

- architecture decisions (ie, use this library, and replace that library, ..),
- design decisions (ie, will implement this module, and refactor that module, etc..),
- data models decisions (ie, add model X, modify model X to do Y, etc),
- tests decisions (ie, add unit test for this component, include this scenario and this scenario, etc),
- code changes decisions (refactor that code, make this code more clean, add this here, etc..),
- etc.

**Don't give vague instructions like "make it work" or "add tests"**

### 4. Acceptance Criteria

Checkboxes for what "done" means. Include:

- Functional requirements
- Quality gates (`pnpm test`, `pnpm check`)
- Edge cases

### 5. File Summary

Quick reference of new/modified files.

### 6. Open Questions / Resolved Decisions

Document unknowns and decisions made during spec writing.

## Guidelines

### Code in Specs

- Code in spec is for **reference only**
- Use to clarify intent, not as actual implementation
- Communicate this clearly in the spec so agent wont copy-paste it blindly

### Completeness

Specs should strive to be **complete and unambiguous**. However:

- If a spec is unclear or incomplete, the coding agent **MUST ask clarifying questions**
- Don't assume—ask
- Better to clarify upfront than fix mistakes later
- Communicate this clearly in the spec so agent will do it.

### Quality Actions

Always require:

- `pnpm test` - tests pass
- `pnpm check` - linting/formatting pass

### Naming

Use sequential IDs: `0001-project-setup.md`, `0002-db-scaffolding.md`, etc.
