---
id: "041"
title: "commands/wires.ts — -- chains into wire components"
track: mapping
pool: remote
wave: 4
size: M
deps: ["021", "030"]
writes:
  - src/scripts/import/commands/wires.ts
---

## Contract

```ts
import type { BuildContext, CommandHandler, ComponentSaveObject } from "../types"

export const wireHandler: CommandHandler
```

Emit `WireSaveObject` from `src/scripts/components/wireComponent.ts`:

```ts
{
  type: "wire",
  points: [{x, y}, {x, y}],   // designer pixels
  directions: ["--"],          // one entry per segment
}
```

## Composition rule

Handlers are **additive**: `dispatch.ts` runs every handler whose `canHandle`
returns true and concatenates the results. So `canHandle` means "this command
contains at least one element of my kind", not "I own the whole command".

```
canHandle(cmd) := cmd.kind === "draw" && splitPath(cmd.arguments).some(el => el.kind === "op" && el.text === "--")
```

## Rules

- Walk `splitPath(cmd.arguments)`. For every `coord, op("--"), coord` triple emit
  one wire with the two points.
- A chain `(a) -- (b) -- (c)` emits **two** wires, not one polyline: the designer
  edits wires segment-wise.
- A coordinate is resolved with the chain, in this order, first non-null wins:
  `resolveAbsolute`, `resolveRelative`, `resolveNamed`, `resolveCalcOffset`,
  `resolveCalcPartway`. Commit `ctx.coords.lastPoint` from the result.
- Points are converted with `toDesignerPoint` from `../coords/absolute`.
- If a coordinate in a `--` pair cannot be resolved: skip **that wire**, push a
  warning with the statement line and the raw text, continue with the chain.
- `-|` / `|-` appearing as `op`: emit a straight wire plus one warning
  `{reason: "orthogonal wire approximated as straight"}`.
- Do not emit anything for `--` that is directly followed by `to[...]` (there is
  no coordinate to attach to).

## Acceptance

```bash
npm run test:import
```

- `\draw (0,0) -- (1,0);` → exactly 1 wire, `points` = `[{0,0},{37.795…,0}]`,
  `directions: ["--"]`.
- `\draw (0,0) -- (1,0) -- (1,1);` → 2 wires.
- `\draw (0,0) to[L] (1,0);` → 0 wires from this handler.
- `\draw (0,0) -- (A);` with unknown `A` → 0 wires, 1 warning, `skipped` not empty.
- Corpus total: after full import, the number of `type: "wire"` objects in
  `buck.tex` equals the number of `--` sequences with resolvable ends.

## Out of scope

`to[...]` bipoles (`042`), pole dots (`043`), arrows, curves.