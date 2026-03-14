# Fold Controls Exploration

## Goal

Document two UI options for adding fold controls directly on code lines in the output Monaco editor.
This file is exploratory. It describes the user-facing behavior and tradeoffs only.

## Problem / Context

Current fold controls live in the gutter.
We want to evaluate whether fold controls can also appear on the code line itself, without being inserted into the text content or blocking it.

## Options

### 1. Code-Anchored Inline Controls

- The fold control appears visually attached to the line's code content.
- It sits near the foldable expression on that line, such as beside an opening `{` or `[` or near the end of the rendered code for that line.
- The control is visually separate from the text, but it moves with the code as the editor scrolls horizontally and vertically.
- This is the closest match to editors that show fold affordances embedded in the reading flow of the code.

#### Advantages

- Feels directly associated with the expression being collapsed or expanded.
- Keeps the interaction localized to the code structure itself.
- Matches the mental model of "this token opens a foldable block."

#### Tradeoffs

- On very long lines, the control can move out of view with the text.
- If placed too close to content, it can feel visually crowded.
- If placed at the end of the line, the control position may vary significantly across lines, which can reduce scanning consistency.

### 2. Viewport-Anchored Floating Controls

- The fold control appears aligned with the relevant line, but floats at the right edge of the visible editor area instead of sitting inside the text flow.
- The control stays in a consistent horizontal position while tracking the line vertically.
- The control is visually overlaid on the editor rather than embedded in the code content.
- This is the closer match to the idea of a floating affordance that does not block or shift the code text.

#### Advantages

- Keeps controls visible even when lines are long or horizontally scrolled.
- Produces a consistent right-side action lane, which is easier to scan.
- Avoids changing the apparent spacing or structure of the code line.

#### Tradeoffs

- Feels less native to the code itself and more like a secondary overlay.
- Adds a custom interaction layer on top of the editor rather than extending the code presentation directly.
- Can feel disconnected from the exact token or bracket that owns the foldable region if the visual connection is too subtle.

## Evaluation Focus

- Whether the control feels clearly associated with the foldable block.
- Whether the control stays readable and discoverable on long lines.
- Whether the control avoids covering text.
- Whether the control feels visually consistent with the existing gutter fold affordances.

## Open Questions / Resolved Decisions

- Resolved: both approaches are feasible enough to prototype.
- Open question: which approach feels better in practice for dense JSON-like output.
