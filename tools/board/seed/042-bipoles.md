---
id: "042"
title: "commands/bipoles.ts — to[SYM] into path symbol components"
track: mapping
pool: remote
wave: 4
size: L
deps: ["040", "030"]
writes:
  - src/scripts/import/commands/bipoles.ts
---

## Contract

```ts
import type { BuildContext, CommandHandler, ComponentSaveObject } from "../types"

export const bipoleHandler: CommandHandler
```

Emit `PathSymbolSaveObject` from `src/scripts/components/pathSymbolComponent.ts`:

```ts
{
  type: "path",
  id: "<tikzName>",          // exactly what resolveSymbol() returned
  points: [{x, y}, {x, y}],  // designer pixels, start then end
  poles?: { start?: string; end?: string },
  options?: string[],
}
```

`id` is the `tikzName` of the symbol — `applyJson` resolves it with
`MainController.instance.symbols.find(s => s.tikzName == saveObject.id)`.

## Rules

- For each `to[<options>]` element: start = the previous resolved coordinate,
  end = the next resolved coordinate. If either is missing → skip this element
  with a warning.
- Symbol = the **first** comma-separated option that is not a `key=value` pair
  and is not a directional keyword (`above`, `below`, `left`, `right`, `midway`,
  `near start`, …). Examples:
  - `to[L, l=$L_1$]` → `L`
  - `to[R]` → `R`
  - `to[european resistor, l=$R$]` → `european resistor`
  - `to[D*, l=$D$]` → `D` (trailing `*` is a style marker, strip it)
  Pass it to `resolveSymbol(symbol, ctx.settings)`. `null` → warning
  `{reason: "unknown symbol <name>"}`, skip.
- Orientation is implied by the two points; do **not** rotate or scale.
- Poles: only if the options contain `*-*`, `*-`, `-*`, `o-*`, `*-o`, `o-o`
  (map `*` → `circ`, `o` → `ocirc`; a bare `-` means no pole on that end).
  Everything else leaves `poles` undefined.
- `name=<id>` (also `name/<id>`) → `registerName(ctx.coords, id, startPoint)`
  **and** set `name` on the save object (the designer keeps nameable metadata).
- Do not emit labels here — card `045` reads the same `to[...]` options.
- Resolve coordinates with the same chain as `041` and convert with
  `toDesignerPoint`.

## Acceptance

```bash
npm run test:import
```

- `\draw (0,0) to[L, l=$L_1$, name=L1] (2,0);` → one component,
  `id: "european inductor"` (with `european: true`), `points` length 2,
  and `(L1)` resolves afterwards to the start point.
- `\draw (0,0) to[Tnigfete, name=VT] (0,-1);` → `id: "nigfete"`.
- `\draw (0,0) to[Ty] (1,0);` → `id: "full thyristor"`.
- `\draw (0,0) to[Xyz] (1,0);` → 0 components, 1 warning, no throw.
- Corpus: 149 `to[...]` occurrences resolve to 149 components with zero unknown
  symbols (count them in `run.mjs` and print the total).

## Out of scope

Labels and their anchors (`045`), colour application, `short`, `open`, arrows.