---
id: "011"
title: "preprocess/colors.ts — collect \definecolor into a name map"
track: preprocess
pool: local
wave: 2
size: S
deps: ["000"]
writes:
  - src/scripts/import/preprocess/colors.ts
---

## Contract

```ts
import type { PreprocessStage } from "../types"

export const collectColors: PreprocessStage
```

## Goal

Turn LaTeX colour definitions into CSS colours so that `color=ink`, `draw=grp`
and `text=grp` can be applied to imported components.

## Input seen in the corpus

```latex
\definecolor{ink}{RGB}{31,42,51}
\definecolor{grp}{HTML}{1F2A33}
\definecolor{acc}{rgb}{0.12,0.16,0.20}
```

22 of 24 files define colours; the two names above cover almost everything.

## Rules

- Supported models: `RGB` (0–255 integers), `rgb` (floats 0–1), `HTML`
  (6 hex digits), `gray` (0–1 float). Anything else: record a warning and skip
  that colour, do not throw.
- Store as CSS: `#rrggbb`, lowercase. `rgb` and `gray` are rounded to the
  nearest integer per channel.
- `doc.colors` is **merged**, not replaced: keep colours collected earlier.
- Colour definitions stay in `doc.text`? No — replace the whole
  `\definecolor{...}{...}{...}` declaration with an empty string, but keep the
  line count unchanged (same trick as `comments.ts`).
- Real example: `\definecolor{ink}{RGB}{31,42,51}` → `{ "ink": "#1f2a33" }`.

## Acceptance

```bash
npm run test:import
```

Fixtures must cover: `RGB` → `#1f2a33`; `HTML` → `#1f2a33`; `rgb` →
`#1f2a33` for `0.122,0.165,0.2` (document the rounding); unknown model → one
warning, no throw, other colours still collected.

## Out of scope

Applying colours to components (cards `041`–`045`), `\color` switches inside a
path, `xcolor` expressions like `ink!50!white`.