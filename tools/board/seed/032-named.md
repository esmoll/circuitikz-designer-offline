---
id: "032"
title: "coords/named.ts — (name) references and name registration"
track: coords
pool: local
wave: 3
size: S
deps: ["030"]
writes:
  - src/scripts/import/coords/named.ts
---

## Contract

```ts
import type { CoordContext, CoordResolver, Point } from "../types"

export const resolveNamed: CoordResolver
export function registerName(ctx: CoordContext, name: string, point: Point): void
```

## Semantics

A path element `(A)` refers to the point stored when a component named `A` was
placed. `(A)` is **not** a coordinate pair, so `absolute` returns `null` for it
and this resolver owns the case.

## Rules

- Matches `(<identifier>)` where identifier is `[A-Za-z][A-Za-z0-9_]*` or
  contains `.` / `-` (e.g. `VT`, `L1`, `R_2`). A dot means a sub-node anchor —
  that is card `033`; **return `null` here** when the identifier contains `.`
  so the anchor resolver can take it.
- Unknown name: return `null`, do not throw. The caller records
  `{reason: "unknown coordinate name"}` and skips the statement.
- `point` = the reference point of that component (its first point for a path
  symbol, its position for a node).
- `lastPoint` = that point (a named reference does move the current point, as in
  TikZ).
- `registerName` overwrites silently — later definitions win, matching TikZ.
- `ctx.named` is a `Map<string, Point>` in centimetres.

## Acceptance

```bash
npm run test:import
```

Fixtures:

- `ctx.named = {A: {1,2}}`, input `(A)` → point `{1,2}`, `next` past `)`.
- input `(A.B)` at the same index → `null`.
- input `(B)` with empty map → `null`, no throw.
- `registerName(ctx, "L1", {0,0})` then `(L1)` resolves.
- Real corpus: `name=VT` on a `to[V]` element followed later by `(VT)` must
  produce the same point as the source path's endpoint.

## Out of scope

Anchor syntax `(VT.G)` — card `033`. Calc syntax — cards `034`, `035`.