---
id: "033"
title: "coords/anchors.ts — sub-node anchors (VT.G, VT.D, VT.S)"
track: coords
pool: remote
wave: 4
size: M
deps: ["003", "032"]
writes:
  - src/scripts/import/coords/anchors.ts
---

## Contract

```ts
import type { AnchorResolver, CoordContext, CoordResolver } from "../types"

export const resolveAnchor: CoordResolver
export function makeAnchorResolver(ctx: CoordContext): AnchorResolver
```

## What `docs/anchor-map.md` gives you

Read that file first. It answers, with source citations, how a pin name
(`G`, `D`, `S`, `A`, `K`, `+`, `-`) maps to a point offset inside a symbol.
If the verdict is `RESOLVABLE`, implement the real offset. If it is
`RESOLVABLE WITH ALIAS`, apply the alias table. If `NOT RESOLVABLE`, fall back to
the component reference point and record a warning — the doc states the exact
rule to follow.

## Semantics

`(VT.G)` = the `G` anchor of the component registered as `VT`.

## Rules

- Recognise `(<name>.<anchor>)` where `<name>` is a plain identifier from
  `ctx.named`. Anchor part is `[A-Za-z+-]+`.
- Look the component up via `ctx.named`; if missing → `null`.
- Ask `ctx.anchors.resolve(node, anchor)` for the offset; `null` → return the
  component's own point and push a warning
  `{reason: "anchor <a> of <n> not resolvable, using component centre"}`.
- `lastPoint` = resolved point, `next` past `)`.
- `makeAnchorResolver` reads the pin geometry from the symbol table once and
  returns a closure — no per-call SVG parsing, no I/O.

## Acceptance

```bash
npm run test:import
```

- With a stub `AnchorResolver` returning `{1,-1}` for `(VT, "G")`:
  `(VT.G)` at index 0 → `{1,-1}`, next past `)`.
- Missing node `(QQ.G)` → `null`, no throw.
- Unknown anchor `(VT.Z)` → component point + exactly one warning.
- Real corpus: all 12 files containing `(X.Y)` produce **zero** skipped
  statements caused by anchor resolution.

## Out of scope

`calc` syntax around anchors (`$(VT.G)+(…)`) — that is card `034`, which calls
`ctx.anchors.resolve` itself. Do not modify component classes.