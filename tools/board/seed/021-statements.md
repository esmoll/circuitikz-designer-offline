---
id: "021"
title: "scanner/statements.ts — split path arguments into elements"
track: scanner
pool: remote
wave: 3
size: M
deps: ["020"]
writes:
  - src/scripts/import/scanner/statements.ts
---

## Contract

```ts
import type { RawCommand } from "../types"

export type PathElement =
	| { kind: "coord"; text: string }              // "(1.6,3.4)", "++(0,-0.5)", "$(A)+(0,1)$"
	| { kind: "op"; text: string }                 // "--"
	| { kind: "to"; options: string }              // "to[L, l=$L_1$]" → "L, l=$L_1$"
	| { kind: "node"; options: string; at?: string; content: string } // trailing node

export function splitPath(arguments_: string): PathElement[]
```

## Goal

Turn `(0,0) to[L, name=L1] (2,0) -- (2,1) node[circ]{}` into an ordered list of
elements. This is the boundary between "characters" and "circuit": cards `041`
and `042` iterate over the result instead of touching the raw string.

## Rules

- Scanning is left to right; leading/trailing whitespace is dropped.
- `coord`: a token that starts with `(`, `++(`, `+(` or `$(`. Take the balanced
  text as-is — **do not** interpret it here. `$…$` closes at the matching `$`.
- `op`: `--`, `-|`, `|-`. The corpus only contains `--`; return the others
  too, the caller decides.
- `to`: `to[<opts>]` — `options` is the bracket content without brackets.
  `to` without brackets (`to (2,0)`) is also possible: `options: ""`.
- `node`: `node[<opts>] <optional "at <coord>"> {<content>}` — options may be
  absent. `content` is the brace content **with** braces stripped. `at` keeps
  the raw coordinate text (`"(1,2)"`), including the parentheses.
- Everything is balanced-aware: `node[left] {$\frac{a}{b}$}` does not end early.
- Unknown token that is not one of the above: return an element
  `{ kind: "op", text: <token> }` and let the caller warn — never throw.
- Empty input → `[]`.

## Acceptance

```bash
npm run test:import
```

Fixtures (exact element lists):

1. `(0,0) to[L, l={$L_1$}] (2,0)` → `coord`, `to`, `coord`, and the `to`
   options are `L, l={$L_1$}`.
2. `(0,0) -- (1,0) node[circ]{}` → `coord`, `op("--")`, `coord`, `node` with
   options `circ`, content `""`.
3. `++(0,-0.5) to[R] ++(1,0)` → three elements, `to` options `R`.
4. `$(VT.G)+(0,-0.55)$ to[C] (2,2)` → `coord` text preserved verbatim.
5. `node[above left] {$+$}` (no `at`) → `node`, `at` undefined.

## Out of scope

Interpreting coordinates, resolving symbols, building components.