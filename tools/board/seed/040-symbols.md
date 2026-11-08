---
id: "040"
title: "symbols/index.ts — circuitikz name to designer symbol"
track: mapping
pool: local
wave: 2
size: S
deps: ["000"]
writes:
  - src/scripts/import/symbols/index.ts
---

## Contract

```ts
import type { GlobalSettings } from "../types"

export type SymbolKind = "path" | "node"
export type ResolvedSymbol = { tikz: string; kind: SymbolKind }

export function resolveSymbol(name: string, settings: GlobalSettings): ResolvedSymbol | null
export const ALIASES: Record<string, (settings: GlobalSettings) => ResolvedSymbol | null>
```

## Verified vocabulary

These ten symbols cover all 24 corpus files (occurrence count in brackets):
`L` (35), `C` (25), `Ty` (21), `R` (20), `D` (20), `Tnigfete` (15),
`generic` (6), `V` (5), `sV` (2), `battery1` (1), plus `circ` and `ocirc`
as `node[...]` shapes.

Every target name below was confirmed to exist as a `tikz="…"` attribute in
`src/data/symbols.svg` (402 names total). Do not invent others.

## Table to implement

| input | condition | resolved `tikz` | kind |
| --- | --- | --- | --- |
| `R` | `settings.european` | `european resistor` | path |
| `R` | otherwise | `american resistor` | path |
| `L` | `settings.inductorStyle === "american"` | `american inductor` | path |
| `L` | otherwise | `european inductor` | path |
| `C` | — | `capacitor` | path |
| `V` | `settings.european` | `european voltage source` | path |
| `V` | otherwise | `american voltage source` | path |
| `sV` | — | `sinusoidal voltage source` | path |
| `D` | — | `full diode` | path |
| `Ty` | — | `full thyristor` | path |
| `Tnigfete` | — | `nigfete` | path |
| `generic` | — | `generic` | path |
| `battery1` | — | `battery1` | path |
| `circ` | — | `circ` | node |
| `ocirc` | — | `ocirc` | node |

Names that already exist verbatim in `symbols.svg` (e.g. `european resistor`,
`sinusoidal voltage source`) resolve to themselves — accept the full name as
input as well as the short alias.

## Rules

- Lookup is case-sensitive for words (`Generic` ≠ `generic`) but the corpus is
  consistent; unknown names return `null` — never throw.
- `ALIASES` maps the short circuitikz keys to a function of `GlobalSettings`.
  `resolveSymbol` first tries `ALIASES`, then the literal SVG name.
- No I/O in this module: it must not read `symbols.svg` at runtime. The table is
  data, hard-coded.

## Acceptance

```bash
npm run test:import
```

A check in `tools/tex-import/run.mjs` must:

1. read every `tikz="…"` value out of `src/data/symbols.svg`;
2. call `resolveSymbol` for all twelve inputs above under
   `{european: true, inductorStyle: null}` and under
   `{european: false, inductorStyle: "american"}`;
3. assert every returned `tikz` is present in the SVG name set;
4. assert unknown input `Xyz` returns `null`.

Output line: `symbols: 15/15 resolve, 0 unknown`.

## Out of scope

Reading options from `to[...]` (card `042`), pole placement, colours, labels.