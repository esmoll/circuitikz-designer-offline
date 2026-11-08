---
id: "020"
title: "scanner/lexer.ts — tokenizer for draw/node statements"
track: scanner
pool: remote
wave: 2
size: M
deps: ["000"]
writes:
  - src/scripts/import/scanner/lexer.ts
---

## Contract

```ts
import type { RawCommand, TextDoc } from "../types"

export function tokenize(doc: TextDoc): RawCommand[]
```

## Goal

Cut the preprocessed document into statements. This is the only place that knows
about `;`, brackets and nesting — every module above it works on `RawCommand`.

## Grammar to support

```
statement := '\' name options? arguments ';'
name      := letters            (\draw, \node, \path, \fill, \foreach …)
options   := '[' balanced ']'   (optional, immediately after the name)
arguments := balanced text until the first ';' at nesting depth 0
```

Nesting to track, all three kinds, independently:

- `[...]` — path options, `to[L, l=$x$]`;
- `{...}` — node text, `node[above] {$+$}`;
- `$...$` and `$$...$$` — maths inside labels; `;` and `,` inside are literal.

Braces and brackets may nest arbitrarily: `l={$R_1$}`, `node[left] {$\frac{a}{b}$}`.

## Output

One `RawCommand` per statement, in document order:

```ts
{
  kind: "draw" | "node" | "unknown",  // "unknown" for \path, \fill, \foreach, …
  options: string,                     // "[line width=1pt]" → "line width=1pt", or ""
  arguments: string,                   // "draw (0,0) to[L] (2,0)" → "(0,0) to[L] (2,0)"
  line: number,                        // 1-based line where the statement starts
  source: string                       // the original statement text, trimmed
}
```

`arguments` excludes the command name and the options block; `source` includes
everything up to and including `;`? — **no**, excluding the terminating `;`.

## Rules

- A `\` that is not followed by letters is not a command (`\%`, `\\`, `\{`).
- Unbalanced brackets/braces at end of input: emit a `RawCommand` with
  `kind: "unknown"` for the remaining text **and** do not throw. The caller turns
  it into a warning; the parser must survive.
- Comments are already stripped by card `010`; `%` is literal here.
- Line numbers must survive preprocessed text that keeps its line count. If a
  statement spans lines, `line` is the line of its `\`.

## Acceptance

```bash
npm run test:import
```

Required fixtures:

- `\draw (0,0) to[L, l={$L_1$}, name=L1] (2,0);` → one command, options `""`,
  arguments `(0,0) to[L, l={$L_1$}, name=L1] (2,0)`.
- `\node[circ] at (1,2){};` → `kind: "node"`, options `circ`.
- A statement containing `;` inside `{...}` does not split.
- All 24 files in `tests/fixtures/tex/` tokenize without an exception and the
  count of `\draw`+`\node` statements equals the count of `;`-terminated
  statements that start with those commands.

## Out of scope

Splitting the arguments into path elements (`--`, `to[...]`, coordinates) — that
is `commands/*` plus `scanner/statements.ts` (card `021`).