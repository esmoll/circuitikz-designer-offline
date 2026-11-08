---
id: "003"
title: "anchor map — how circuitikz anchors (VT.G, VT.D, VT.S) map to designer pins"
track: contract
pool: remote
wave: 1
size: M
deps: []
writes:
  - docs/anchor-map.md
---

## Goal

Answer one question with evidence: **can `(VT.G)` inside a `\\draw` be resolved to a
point without changing any component class?** Twelve of the 24 corpus files
reference sub-node anchors, so the whole coordinate engine depends on this.

## Where to look

- `src/scripts/components/componentSymbol.ts` — `ComponentSymbol.pins`,
  `Variant.pins`, `parseAnchor`. This is where pin names come from.
- `src/data/symbols.svg` — the `<g>` groups carry `tikz=` and anchor metadata;
  pins are declared per symbol/variant.
- `src/scripts/components/nodeSymbolComponent.ts` — `snappingPoints` built from
  `componentVariant.pins` with `new SnapPoint(this, pin.name, ...)`.
- `src/scripts/components/pathSymbolComponent.ts` — same for two-terminal parts.

## What to produce

`docs/anchor-map.md` containing:

1. **Mechanism** — one paragraph: where pin names are parsed from, and how a pin
   name becomes a point in world coordinates (which offset is applied:
   `point.add(variant.mid)`).
2. **Table** with one row per symbol actually used by the corpus:

   | TikZ symbol | `symbols.svg` entry | designer pin names | circuitikz anchors covered |
   | --- | --- | --- | --- |
   | `nigfete` | … | … | `G`, `D`, `S` |
   | `thyristor` | … | … | `G`, `A`, `K` |
   | `european voltage source` | … | … | `+`, `-` |
   | … | | | |

   Cover at least: `nigfete`, `thyristor`, `european voltage source`,
   `capacitor`, `european resistor`, `american inductor`, `full diode`,
   `empty diode`, `battery1`, `circ`, `ocirc`.
3. **Verdict**, one of:
   - `RESOLVABLE` — anchor name exists as a pin name (case-insensitive match ok);
   - `RESOLVABLE WITH ALIAS` — pin exists under a different name; give the alias;
   - `NOT RESOLVABLE` — the geometry is not available at import time; state what
     would have to change.
4. **Fallback rule** for `NOT RESOLVABLE` symbols: place the endpoint at the
   component's centre and record a warning. Write the rule as one sentence so
   `coords/anchors.ts` can implement it verbatim.

## Evidence requirement

Do not guess. For each verdict, quote the exact source line (file + line number)
that proves the pin name. A table row without a quoted source is not acceptable.

## Acceptance

- `docs/anchor-map.md` exists, has the four sections, and every row cites a file
  and line number.
- `grep -c "NOT RESOLVABLE" docs/anchor-map.md` reflects the real answer, not a
  placeholder.
- No source files modified: `git diff --name-only` is exactly `docs/anchor-map.md`.

## Out of scope

Writing any code in `src/`. Changing pin names, `symbols.svg` or component classes.