---
id: "044"
title: "commands/textNodes.ts — standalone \node at (x,y) {text}"
track: mapping
pool: local
wave: 3
size: M
deps: ["021"]
writes:
  - src/scripts/import/commands/textNodes.ts
---

## Contract

```ts
import type { BuildContext, CommandHandler, ComponentSaveObject } from "../types"

export const textNodeHandler: CommandHandler
```

Emit `{ type: "node", position: {x, y}, label: { value, anchor? } }` — the
`NodeSaveObject` shape from `src/scripts/components/nodeComponent.ts`.
`position` is in **designer pixels**: call `toDesignerPoint` from
`../coords/absolute`.

## Input shape (real, from `buck.tex`)

```latex
\node[anchor=east, text=grp] at (0.0,2.4) {$V_{in}$};
\node[above] at ($(L1)+(0,0.35)$) {$L_1$};
\node[align=center] at (2,3) {\footnotesize $50\%$\\duty};
```

## Rules

- `canHandle`: `cmd.kind === "node"` and the arguments contain ` at ` — and the
  option list does **not** consist solely of a pole shape (`circ`, `ocirc`) —
  those are card `043`.
- `handle`:
  1. read `at <coord>` from the arguments; resolve it with the chain
     `resolveAbsolute` → `resolveRelative` → `resolveNamed` → `resolveCalcOffset`
     → `resolveCalcPartway` (import them directly, in that order). If all return
     `null`, push a warning and return `[]`.
  2. take the trailing `{...}` as the label text, strip the outer braces, keep
     MathJax content untouched (`$V_{in}$` stays as written).
  3. drop TeX sizing wrappers that the designer cannot render
     (`\footnotesize`, `\small`, `\strut`) — the designer has its own font size.
  4. map `anchor=<dir>` to the designer anchor **key** using the table in
     `src/scripts/components/nodeComponent.ts` (`basicDirections`): `east`,
     `west`, `north`, `south`, `northeast`, `northwest`, `southeast`,
     `southwest`, `center`, `default`. Multi-word TikZ names (`above left`,
     `below right`) map to `northwest` etc. Unknown → leave `anchor` undefined
     and warn once per file.
  5. `text=<colour>` is not representable in `PositionedLabel` — warn once per
     file, do not fail.
- Line breaks `\\` inside the label are kept as `\n` in `value`.
- Empty text (`{}`) with no `at` → `[]` (a pole marker, not text).

## Acceptance

```bash
npm run test:import
```

- `\node[anchor=east, text=grp] at (0.0,2.4) {$V_{in}$};` →
  one component, `type: "node"`, `position ≈ {0, -90.71}`, label value `$V_{in}$`,
  anchor `east`, and exactly one warning about `text=grp`.
- `\node[above] at ($(L1)+(0,0.35)$) {$L_1$};` resolves through calc and yields
  a positive-then-shifted position.
- `\node[circ] at (1,1){};` is **not** handled here (must return `[]` from
  `canHandle`, so `circles` gets it).

## Out of scope

Poles (`043`), labels attached to `to[...]` paths (`045`), rotation. Do not edit
`nodeComponent.ts`.