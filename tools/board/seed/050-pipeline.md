---
id: "050"
title: "import/pipeline.ts — compose the preprocess stages"
track: pipeline
pool: remote
wave: 5
size: S
deps: ["010", "011", "012", "013"]
writes:
  - src/scripts/import/pipeline.ts
---

## Contract

```ts
import type { TextDoc } from "./types"

export function preprocess(text: string, file: string): TextDoc
```

## Composition order

```ts
const stages: PreprocessStage[] = [stripComments, collectColors, applySettings, expandForeach]
```

`expandForeach` runs **last** so the loop body is expanded after comments and
settings are gone (a `%` inside a loop body would otherwise be copied N times).

## Base document

```ts
const doc: TextDoc = {
	text,
	colors: {},
	settings: {
		european: false,
		rpvoltages: false,
		bipolesLength: 1.0,
		inductorStyle: null,
		defaultLineWidth: null,
		defaultColor: null,
	},
	warnings: [],
}
```

## Also strip document scaffolding

After the stages, remove these lines (keep the line count by blanking them, so
warnings keep pointing at the right line):

- `\documentclass…`
- `\usepackage…` (all of them, `circuitikz` already consumed by `013`)
- `\usetikzlibrary…`, `\setmainfont…`, `\newcommand…`, `\renewcommand…`
- `\begin{document}` / `\end{document}`
- `\begin{tikzpicture}…` / `\end{tikzpicture}`
- `\begin{circuitikz}…` / `\end{circuitikz}`

Nothing else is removed here — statement parsing belongs to `020`.

## Rules

- Pure function: no I/O, no globals, no mutation of the input string beyond
  creating the doc.
- `doc.warnings` from all stages are concatenated in stage order.
- `file` is not stored in `TextDoc`; it only exists so callers can log. Do not
  invent a new field in `types.ts` — if you need the name later, take it as a
  parameter in `052`.

## Acceptance

```bash
npm run test:import
```

- `preprocess(readFileSync("tests/fixtures/tex/buck.tex", "utf8"), "buck.tex")`
  returns a `TextDoc` with `settings.european === true`, `colors.ink` defined,
  no `\ctikzset`, no `\definecolor`, no `\foreach`, and `\draw` statements intact.
- The same for all 23 circuitikz files: zero exceptions, warnings array may be
  non-empty but must not contain "unexpected".
- `cell.tex`: returns a doc whose text still contains `\node[block]` — it is not
  this stage's job to reject it.

## Out of scope

Tokenizing, building components, deciding whether the document is supported
(card `052`).