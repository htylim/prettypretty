# Writing Specs

Specs are instructions for coding agents. They define what to build, why, and how to verify it's done.

## Structure

### 1. Current State

Explain the current state. _Why_ this is needed. What problem does it solve?

### 2. Desired end state

State what the desired end state should be. Include examples if relevant.

### 3. Patterns To Follow

Mention (and show) the existing patterns in code that should be used here to achieve the desired state.

### 4. Deliverables

Be explicit. Communicate clearly all the decisions. Use headings to separate them:

**architecture decisions**

- use this library
- replace that library...

**design decisions**

- will implement this module
- refactor that module, etc..

**data models decisions**

- add model X,
- modify model X to do Y, etc..

**tests decisions**

- add unit test for this component
- include this scenario and this scenario, etc..

**code changes decisions**

- refactor that code
- make this code more clean, etc..

- etc.

**Don't give vague instructions like "make it work" or "add tests"**

### 5. Acceptance Criteria

Checkboxes for what "done" means. Include:

- Functional requirements
- Quality gates
- Edge cases

### 6. File Summary

Quick reference of new/modified files.

### 7. Open Questions / Resolved Decisions

Document unknowns and decisions made during spec writing.

## Guidelines

### Goal of a Spec file.

The goal of a spec file is to communicate a desired outcome, in depth and clearly.
To be easily read so it can be easily reviewed and understood.
An spec might include technical info or include technical work but is not an implementation plan. The goal of a spec is to be the input for an implementation plan.

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

- `pnpm check` is the required non-E2E gate.
- Run `pnpm test:e2e` for user-visible or Electron runtime changes.
- Every renderer module/component must have a corresponding unit test file.

Exception for documentation-only work:

- If the implementation only changes documentation files, do not require `pnpm check`, `pnpm test`, or `pnpm test:e2e`.

### Naming

Use sequential numeric IDs with zero padding: `0001-project-setup.md`, `0002-db-scaffolding.md`, etc.
