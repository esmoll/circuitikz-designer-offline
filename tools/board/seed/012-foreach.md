---
id: "012"
title: "preprocess/foreach.ts — expand \foreach loops by text substitution"
track: preprocess
pool: remote
wave: 3
size: M
deps: ["010"]
writes:
  - src/scripts/import/preprocess/foreach.ts
---

## Contract

```ts
import type { PreprocessStage } from "../types"

export const expandForeach: PreprocessStage
```

## Why this is not optional

Six corpus files (all three-phase circuits) are built entirely from a loop. Without
expansion they parse to almost nothing, so this card gates the biggest files.

## Input shape (real, from `vsi3ph.tex`)

```latex
\foreach \xc/\yph/\xoff in {3.2/3.2/3.9, 4.0/3.2/4.7, 4.8/3.2/5.5}{
  \draw (\xc,0) to[V, l=$V_1$] (\xc,\yph);
  \draw (\xc,\yph) to[D] (\xoff,\yph);
}
```

## Rules

- Forms to support:
  - `\foreach \a in {v1, v2, v3}{body}`
  - `\foreach \a/\b in {v1/w1, v2/w2}{body}`
  - three or more variables (`\a/\b/\c`) — the corpus uses three.
- Items are split on commas **at brace depth 0 inside the list**; each item is
  split on `/` into one value per variable.
- Substitution is textual on the control word: `\a` is replaced by the value,
  `\ab` is **not** (match the longest control word that exists in the list).
- The body is repeated once per item, concatenated in order, and replaces the
  whole `\foreach …{…}` construct.
- Braces of the body are removed; inner statements are kept verbatim.
- A range item `1,...,5` may appear: expand with step 1 if both ends are
  integers, otherwise leave the loop unexpanded and record one warning.
- Arity mismatch (fewer values than variables in an item): record a warning,
  skip that item, keep the rest.
- Unterminated `\foreach` (no matching closing brace): leave the text untouched,
  one warning. Never throw.
- **Line count is allowed to grow.** Add a note to `doc.warnings` only when the
  line count actually changed, so the report can say "line numbers after
  expansion are approximate".

## Acceptance

```bash
npm run test:import
```

Fixtures:

- 3-item, 3-variable loop → exactly 3 copies, with `\xc` etc. replaced;
- a loop whose body contains `\draw … to[L, l={$L_{1}$}] …;` keeps the label intact;
- `\foreach` with a bad arity → 1 warning, other items still expanded;
- after the stage, names matching `/\\[a-z]+/` for the loop variables no longer
  occur in the text.

## Out of scope

`\pgfmathsetmacro`, `\pgfplotsforeachungrouped`, nested loops (none in corpus —
warn and leave unexpanded), `evaluate=` expressions.