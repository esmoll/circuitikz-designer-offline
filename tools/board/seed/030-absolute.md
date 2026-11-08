---
id: "030"
title: "coords/absolute.ts — (x,y) plus the cm/px conversion"
track: coords
pool: local
wave: 2
size: S
deps: ["000"]
writes:
  - src/scripts/import/coords/absolute.ts
---

## Contract

```ts
import type { CoordResolver, Point } from "../types"

export const PX_PER_CM = 4800 / 127 // 37.795275590551185
export const resolveAbsolute: CoordResolver
export const toDesignerPoint: (p: Point) => { x: number; y: number }
```

## Units

The designer stores SVG pixels with **y pointing down**. TikZ is centimetres
with **y pointing up**. The app's own exporter does:

```ts
tikz = (px * 127 / 4800, -py * 127 / 4800)   // utils/impSVGNumber.ts, toTikzString
```

so the importer must invert it:

```ts
toDesignerPoint = (p) => ({ x: p.x * PX_PER_CM, y: -p.y * PX_PER_CM })
```

Every handler that emits `points` calls `toDesignerPoint`. `Point` inside the
importer is always centimetres, TikZ orientation.

## Input

`resolveAbsolute(token, index, ctx)` receives the whole argument string and an
index at which a coordinate may start.

## Rules

- Accept `(x,y)` with optional whitespace: `(1.6,3.4)`, `( 1.6 , 3.4 )`,
  `(-0.5,2)`.
- Numbers may carry a unit: `cm` (default), `mm`, `pt`, `in`, `px`. Convert to
  centimetres: `1in = 2.54cm`, `1pt = 2.54/72cm`, `1mm = 0.1cm`,
  `1px = 2.54/96cm`.
- Return `null` when the token at `index` is not `(` or when the content is not
  two comma-separated numbers — do **not** throw and do **not** consume.
- On success: `point` in cm, `next` = index just after `)`, `lastPoint` = point.
- A parenthesised name such as `(VT)` is **not** this resolver's job: return
  `null` for non-numeric content (card `032` handles it).

## Acceptance

```bash
npm run test:import
```

Fixtures (compare with tolerance `1e-6`):

| input | expected point | expected next |
| --- | --- | --- |
| `(0,0)` at 0 | `{x:0,y:0}` | `5` |
| `(1.6,-3.4)` at 0 | `{x:1.6,y:-3.4}` | `10` |
| `(10mm,1in)` at 0 | `{x:1,y:2.54}` | length |
| `(VT)` at 0 | `null` | — |
| `to[L]` at 0 | `null` | — |

And `toDesignerPoint({x:1,y:-1})` → `{x:37.795275590551185, y:37.795275590551185}`.

## Out of scope

`++`, named coordinates, `calc` expressions, anchors — cards `031`–`035`.