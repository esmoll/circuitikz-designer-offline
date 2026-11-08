---
id: "043"
title: "commands/circles.ts — node[circ] and node[ocirc] poles"
track: mapping
pool: local
wave: 4
size: S
deps: ["040"]
writes:
  - src/scripts/import/commands/circles.ts
---

## Contract

```ts
import type { BuildContext, CommandHandler, ComponentSaveObject } from "../types"

export const circleHandler: CommandHandler
```

Emit `NodeSymbolSaveObject` (`src/scripts/components/nodeSymbolComponent.ts`):

```ts
{
  type: "node",
  id: "circ" | "ocirc",     // tikzName, verified present in symbols.svg
  position: { x, y },       // designer pixels
  name?: string,
}
```

## Input shapes

```latex
\draw (0,0) -- (1,0) node[circ]{};
\node[ocirc] at (2,1){};
\draw (0,0) to[L] (1,0) node[circ, name=dot1]{};
```

`circ` is a filled junction dot, `ocirc` an open one. They mark connection
points, so **every** occurrence must survive the import.

## Rules

- Two detection paths, both required:
  1. a `node` element inside `splitPath(...)` whose options are exactly one of
     `circ` / `ocirc` (optionally plus `name=…`), with no `at` and empty content;
  2. a standalone `\node[circ|ocirc] at (x,y){}` command.
- Position: for path nodes, the **last resolved coordinate** before the node
  element (the anchor the dot sits on). If no coordinate is available → warning.
- `name=<id>` → `registerName(ctx.coords, id, point)` and `name` on the object.
- Options other than the pole shape and `name` (e.g. `circ, color=ink`) still
  produce the dot; ignore the rest silently except `color`, which gets a warning
  (`{reason: "colour of pole not imported"}`) once per file.
- Never emit a text node for `{}` content.

## Acceptance

```bash
npm run test:import
```

- `\draw (0,0) -- (1,0) node[circ]{};` → 1 component, `id: "circ"`,
  `position ≈ {37.795…, 0}`.
- `\node[ocirc, name=o1] at (2,1){};` → 1 component `id: "ocirc"`, name `o1`,
  position `{75.59…, -37.795…}`.
- `\node[circ, color=ink] at (0,0){};` → 1 component + 1 colour warning.
- Corpus: the number of `node[circ]` + `node[ocirc]` occurrences equals the
  number of imported `circ`/`ocirc` components.

## Out of scope

Other pole shapes (`diamondpole`, `squarepole`), wires connecting to them,
label handling.