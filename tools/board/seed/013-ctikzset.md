---
id: "013"
title: "preprocess/ctikzset.ts — global style into GlobalSettings"
track: preprocess
pool: remote
wave: 2
size: M
deps: ["000"]
writes:
  - src/scripts/import/preprocess/ctikzset.ts
---

## Contract

```ts
import type { PreprocessStage } from "../types"

export const applySettings: PreprocessStage
```

## Goal

Recover the global drawing style so imported components look like the original:
symbol flavour (`european` / `american`), pole voltage style, dipole length and
the default line width/colour.

## What the corpus contains

```latex
\usepackage[european, RPvoltages]{circuitikz}
\ctikzset{bipoles/length=1.0cm}
\ctikzset{diodes/fill=ink}
\ctikzset{inductor=american}
\begin{tikzpicture}[line width=1.0pt, color=ink, font=\small]
```

23 of 24 files use `european, RPvoltages`; 23 have at least one `\ctikzset`;
most set `bipoles/length` to `1.0cm` or `0.8cm`.

## Rules

- `\usepackage[<opts>]{circuitikz}`: `european` → `settings.european = true`,
  `RPvoltages` → `settings.rpvoltages = true`. Absent file → both false.
- `\ctikzset{key=value, key2=value2}`: split on commas **outside** braces.
  Recognised keys, everything else becomes a warning (one per unknown key, once
  per file — deduplicate):
  - `bipoles/length` — parse with unit: `cm`, `mm`, `pt` (1pt = 1/72.27 in),
    `in`. Store **centimetres** in `settings.bipolesLength`. Default `1.0`.
  - `inductor` — `american` | `european` → `settings.inductorStyle`.
  - `diodes/fill`, `diodes/empty` — record nothing here (they are colour
    references handled by the mapping cards), but do not warn.
- `\begin{tikzpicture}[...]`: from the optional argument take
  `line width=<v>` → `settings.defaultLineWidth` (string as written, e.g. `1.0pt`)
  and `color=<name>` → `settings.defaultColor`. Other keys (`font=\small`) are
  ignored silently.
- Settings accumulate across matches; last one wins.
- Statements consumed here are also removed from `doc.text` (replace with an
  empty line, keep line count), so later stages never see them.

## Acceptance

```bash
npm run test:import
```

Fixtures must prove, per file in `tests/fixtures/tex/`:

- `european` is `true` for the 23 circuitikz files;
- `bipolesLength` equals the value declared in the file (default `1.0`);
- `inductorStyle` is `european` when `\ctikzset{inductor=european}` is present,
  and `null` otherwise;
- an unknown key such as `\ctikzset{foo/bar=1}` yields exactly one warning.

## Out of scope

Per-path options (`to[european resistor]`), colours, `\tikzset`, styles.