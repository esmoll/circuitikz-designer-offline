---
id: "034"
title: "coords/calcOffset.ts — $(ref)+(dx,dy)$ and $(ref)-(dx,dy)$"
track: coords
pool: remote
wave: 3
size: S
deps: ["030"]
writes:
  - src/scripts/import/coords/calcOffset.ts
---

## Contract

```ts
import type { CoordResolver } from "../types"

export const resolveCalcOffset: CoordResolver
```

Import `resolveAbsolute` from `./absolute` for the offset pair.

## Input shape (real, from `buck.tex`)

```latex
\draw (VT.S) to[battery1] ($(VT.S)+(0,-0.9)$);
\node[above] at ($(L1)+(0,0.35)$) {$L_1$};
```

10 corpus files use this form; it is how sub-node labels are offset.

## Grammar

```
$ ( <ref> ) + ( dx , dy ) $      |      $ ( <ref> ) - ( dx , dy ) $
<ref> := identifier [ '.' anchor ]     e.g.  VT   |  VT.G  |  L1
```

## Rules

- Recognise the `$(` prefix. Inside, the inner `(<ref>)` is **not** a
  coordinate pair — parse the identifier and optional `.anchor` textually.
- Resolve `<ref>` in this order:
  1. `ctx.anchors.resolve(node, anchor)` when a `.` is present and
     `ctx.anchors` is not `null`;
  2. `ctx.named.get(ref)` for a plain identifier.
  If both fail → `null`.
- Apply `+` or `-` componentwise, then the offset parentheses via
  `resolveAbsolute` (units allowed: `(0,-0.9)`, `(10mm,0)`).
- `lastPoint` = result; `next` just past the closing `$`.
- Do **not** mutate `ctx.named`.

## Acceptance

```bash
npm run test:import
```

Fixtures with `named = {VT: {2,2}}`:

| input | expected |
| --- | --- |
| `$(VT)+(0,-0.5)$` | `{2, 1.5}` |
| `$(VT)-(0,0.5)$` | `{2, 1.5}` |
| `$(VT)+(10mm,0)$` | `{3, 2}` |
| `$(VT.Q)+(0,1)$` with no anchor resolver | `null` |
| `(VT)` | `null` |

## Out of scope

`!t!` interpolation (card `035`), `$ (A) + (B)$` where the offset is a named
point, node distance operators (`above=of`).