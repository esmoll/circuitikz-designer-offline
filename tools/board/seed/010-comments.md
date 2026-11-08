---
id: "010"
title: "preprocess/comments.ts — strip % comments, keep line numbers"
track: preprocess
pool: local
wave: 2
size: S
deps: ["000"]
writes:
  - src/scripts/import/preprocess/comments.ts
---

## Contract

```ts
import type { PreprocessStage } from "../types"

export const stripComments: PreprocessStage
```

## Goal

Remove LaTeX comments before any parsing, without ever changing the number of
lines: every downstream warning reports `line`, and an off-by-one makes the
import report useless.

## Rules

- A `%` starts a comment **unless** it is escaped as `\%` (odd number of
  backslashes before it). `\%` must survive untouched.
- Comment text is removed, the trailing newline is preserved. A line consisting
  only of a comment becomes an empty line, not a deleted line.
- Trim trailing whitespace from each line, collapse runs of spaces/tabs outside
  of `{...}` and `[...]` to a single space. Inside braces and brackets keep the
  text as written (labels contain meaningful spacing).
- `doc.text` is replaced; `doc.colors`, `doc.settings`, `doc.warnings` are passed
  through untouched.
- Real corpus example (`tests/fixtures/tex/buck.tex`):

  ```
  \draw (0,0) to[L, l=$L_1$, name=L1] (2,0); % inductor
  ```
  becomes
  ```
  \draw (0,0) to[L, l=$L_1$, name=L1] (2,0);
  ```

## Acceptance

```bash
npm run test:import
```

Add a case in `tools/tex-import/run.mjs` fixtures (`comments` group) proving:

- `a % b` → `a`;
- `50\% duty` stays `50\% duty`;
- the output has the same number of `\n` as the input;
- `tests/fixtures/tex/*.tex` all still contain a `\draw` after the stage.

## Out of scope

`\foreach`, colours, `\ctikzset`, any parsing of commands.