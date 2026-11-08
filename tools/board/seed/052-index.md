---
id: "052"
title: "import/index.ts — public facade texToSaveFile()"
track: pipeline
pool: remote
wave: 5
size: S
deps: ["050", "051"]
writes:
  - src/scripts/import/index.ts
---

## Contract

```ts
import type { SaveFileFormat } from "../controllers/saveController"
import type { ImportResult } from "./types"

export type TexImportOutcome = {
	saveFile: SaveFileFormat
	result: ImportResult
}

export function texToSaveFile(text: string, fileName: string): TexImportOutcome
```

## Pipeline

```ts
const doc = preprocess(text, fileName)
const commands = tokenize(doc)
const result = buildComponents(commands, doc)
const saveFile: SaveFileFormat = {
	version: currentSaveVersion,     // from ../controllers/saveController
	tikzSettings: {} as GlobalTikzSettings,  // from ../components/environmentVariableController
	components: result.components,
}
return { saveFile, result }
```

## Support check — the `cell.tex` case

Before building, decide whether the document is a circuitikz drawing at all:

- Supported: the preprocessed text contains at least one `to[` **or** at least
  one `--` between coordinates.
- Not supported: neither is present (a plain-TikZ block diagram such as
  `cell.tex`, which uses `\node[block] … ; positioning` and `->`).

For an unsupported document return:

```ts
{
  saveFile: { version: currentSaveVersion, tikzSettings: {} as GlobalTikzSettings, components: [] },
  result: { components: [], skipped: [{ line: 1, text: "", reason: "block diagram / unsupported document" }], settings: doc.settings, colors: doc.colors }
}
```

Do **not** throw. The caller (`054`) shows this as a normal "0 imported, N skipped"
report.

## Rules

- No `console.*` calls in this module — reporting is `055`'s job.
- No I/O: the caller reads the file.
- Re-export nothing from the internal modules; `index.ts` is the only public entry
  point so that `saveController.ts` imports exactly one symbol.
- Keep the module free of app singletons (`MainController`, `CanvasController`):
  this file must run under plain Node in `npm run test:import`.

## Acceptance

```bash
npm run test:import
```

- `texToSaveFile(buckSource, "buck.tex")` → `saveFile.components.length > 0`,
  `result.skipped.length === 0`.
- `texToSaveFile(cellSource, "cell.tex")` → `components.length === 0`,
  `skipped[0].reason` contains "unsupported document".
- The module imports cleanly under Node (no DOM, no SVG.js) — proven by the fact
  that `run.mjs` executes it.

## Out of scope

UI wiring (`054`), report formatting (`055`), filesystem access.