---
id: "035"
title: "coords/calcPartway.ts — $(A)!t!(B)$ interpolation"
track: coords
pool: remote
wave: 4
size: S
deps: ["030"]
writes:
  - src/scripts/import/coords/calcPartway.ts
---

## Contract

```ts
import type { CoordResolver } from "../types"

export const resolveCalcPartway: CoordResolver
```

## Grammar

```
$ ( <refA> ) ! <number> ! ( <refB> ) $
```

`<refA>` / `<refB>` are identifiers stored in `ctx.named` (optionally with
`.anchor` — resolve through `ctx.anchors` when present). `<number>` is a factor,
usually `0.5`.

## Result

```
point = A + t * (B - A)
```

## Rules

- Return `null` (no throw) when either end is unknown, or when the factor is not
  a finite number.
- `t` may be outside `[0,1]` — do not clamp.
- `lastPoint` = result; `next` just past the closing `$`.
- Units in `t` are not allowed; if one is present, warn and return `null`.

## Acceptance

```bash
npm run test:import
```

With `named = {A: {0,0}, B: {2,2}}`:

| input | expected |
| --- | --- |
| `$(A)!0.5!(B)$` | `{1, 1}` |
| `$(A)!0!(B)$` | `{0, 0}` |
| `$(A)!2!(B)$` | `{4, 4}` |
| `$(A)!0.5!(Z)$` | `null` |
| `$(A)+(0,1)$` | `null` |

Real corpus: `cell.tex` uses this form, but it is out of scope for the run — the
resolver must still behave correctly when tested in isolation.

## Out of scope

`!(angle)!`, `!near start!`, projection (`!a!b:(c)!`), calc with offsets.