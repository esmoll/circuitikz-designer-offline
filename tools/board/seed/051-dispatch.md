---
id: "051"
title: "import/dispatch.ts — run handlers, build the ImportResult"
track: pipeline
pool: remote
wave: 5
size: M
deps: ["030", "031", "032", "033", "034", "035", "041", "042", "043", "044", "045"]
writes:
  - src/scripts/import/dispatch.ts
---

## Contract

```ts
import type { ImportResult, RawCommand, TextDoc } from "./types"

export function buildComponents(commands: RawCommand[], doc: TextDoc): ImportResult
```

## Handler order

```ts
const handlers: CommandHandler[] = [wireHandler, bipoleHandler, circleHandler, textNodeHandler]
```

Handlers are **additive** (see card `041`): every handler whose `canHandle`
returns true contributes its components, in this order. After collecting, call
`applyLabels(componentsForThisCommand, cmd, ctx)` once.

## BuildContext

```ts
const ctx: BuildContext = {
	settings: doc.settings,
	colors: doc.colors,
	report: doc.warnings,      // warnings are pushed into the same array
	coords: {
		named: new Map(),
		anchors: makeAnchorResolver(...),   // from 033, built lazily
		lastPoint: null,
		bipolesLength: doc.settings.bipolesLength,
	},
}
```

`ctx.coords` must be **per document**, not per command: names registered in one
`\draw` are referenced by later ones (`name=VT` then `(VT)`), so it lives for the
whole `buildComponents` call.

## Rules

- `kind: "unknown"` commands (including `\path`, `\fill`, and the leftovers of a
  failed `\foreach`) → one warning each:
  `{line, text: cmd.source, reason: "unsupported command"}`; continue.
- A `draw` command that produced **no** components and contains `to[` → warning
  `{reason: "statement produced no components"}`.
- Warnings must be deduplicated per `(line, reason)` so a broken statement that
  four handlers all reject does not produce four identical lines.
- Deterministic order: components in document order, handlers in the order above.
- Never throw. A single bad statement must not abort the file.

## Acceptance

```bash
npm run test:import
```

- A hand-written 5-statement fixture (wire, bipole with label, pole, text node,
  unknown `\fill`) yields exactly 4 components and 1 warning.
- `ctx.coords.named` survives across commands: `\draw (0,0) to[V, name=VT] (1,0);`
  followed by `\draw (VT) to[R] (2,0);` places the resistor starting at `{1,0}`.
- Duplicate warnings are collapsed (assert warning count, not just presence).
- Corpus smoke test: `buildComponents` runs on all 23 circuitikz files without an
  exception; `skipped` may be non-empty at this stage (labels/poles are still
  being wired up).

## Out of scope

Preprocessing, tokenizing, the public `texToSaveFile` facade (card `052`).