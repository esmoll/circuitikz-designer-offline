---
id: "031"
title: "coords/relative.ts — ++(dx,dy) and +(dx,dy)"
track: coords
pool: local
wave: 3
size: S
deps: ["030"]
writes:
  - src/scripts/import/coords/relative.ts
---

## Contract

```ts
import type { CoordResolver } from "../types"

export const resolveRelative: CoordResolver
```

Import `resolveAbsolute` from `./absolute` for the numeric part — do not
re-implement number parsing.

## Semantics

- `++(dx,dy)` — relative to the **current point**, and the current point
  **moves** to the result.
- `+(dx,dy)` — relative to the current point, but the current point **stays**.
- Both may carry units inside the parentheses (`++(0,-0.5)`, `++(10mm,0)`).

```
ctx.lastPoint = A
resolveRelative("++(0,-0.5)", 0, ctx) → point = A + (0,-0.5), lastPoint = that
resolveRelative("+(0,-0.5)", 0, ctx)  → point = A + (0,-0.5), lastPoint = A
```

## Rules

- Return `null` if the token at `index` is neither `++` nor `+` followed by `(`.
- Return `null` (no throw) if `ctx.lastPoint` is `null` — a relative move with no
  current point is a broken document; the caller records the warning.
- `next` points just past the closing `)`.
- Do not mutate `ctx` inside the resolver; the caller commits `lastPoint` from
  the returned `CoordResult`. (`CoordResult.lastPoint` carries the value.)

## Acceptance

```bash
npm run test:import
```

Fixtures with `ctx.lastPoint = {x: 1, y: 2}`:

| input | point | lastPoint |
| --- | --- | --- |
| `++(0,-0.5)` | `{1, 1.5}` | `{1, 1.5}` |
| `+(0,-0.5)` | `{1, 1.5}` | `{1, 2}` |
| `++(10mm,10mm)` | `{2, 3}` | `{2, 3}` |
| `(0,0)` | `null` | — |
| `++(0,0)` with `lastPoint: null` | `null` | — |

Real-corpus check: `buck.tex` and 8 other files use `++`; after the coordinate
engine is wired, their drawings must contain no `++` left in `skipped[]`.

## Out of scope

Absolute, named, `calc` — cards `030`, `032`, `034`, `035`.