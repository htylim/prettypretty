# Design Style Guide

## Purpose

This file defines the reusable visual patterns for the app.

Use existing patterns before creating new ones.

## Visual Direction

- VS Code-inspired desktop tooling aesthetic
- edge-to-edge layout
- low-chrome toolbar
- Monaco as the visual center of the app

## Tokens

- Theme tokens live in `src/renderer/styles/tailwind.css`
- use `:root` and `:root[data-theme='dark']`
- do not hardcode colors, fonts, radii, or spacing when a shared token already exists

## Core Patterns

### Toolbar

- use `.toolbar`
- full-width bar
- bottom border only
- no card-style container framing

### Buttons

- use `.btn` for toolbar actions
- do not create per-action color variants for normal toolbar controls
- icon-only buttons must have `aria-label`
- buttons should include `title` when a shortcut exists

### Segmented Controls

- use `.segmented`, `.seg`, `.seg-active`, `.seg-inactive`
- use them for binary mode switches such as input/output and light/dark

### Dropdowns

- use `.dropdown`, `.dropdown-trigger`, `.dropdown-panel`, `.dropdown-option`
- custom dropdowns only; do not use native `<select>` in the toolbar

### Inline Text Actions

- use link styling for inline sentence actions such as the empty-state `Click`
- do not style inline actions like toolbar buttons

## Editors

- Input and output both use Monaco
- output is read-only
- input and output should share the same editor preference direction unless there is a documented exception
- output mode uses inline fold controls instead of Monaco gutter fold controls
- output inline fold controls must look like UI controls, not source text

## Accessibility

- interactive controls must support keyboard focus
- use visible `:focus-visible` treatment
- disabled controls should be subdued but still legible

## Update Rule

When a reusable UI pattern changes:

- update this file
- update `docs/ui-spec.md` if behavior changed
- update tests that lock the pattern
