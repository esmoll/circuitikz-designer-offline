---
id: "054"
title: "saveController.ts — dispatch by file extension and show the report"
track: pipeline
pool: local
wave: 6
size: M
deps: ["052", "053"]
writes:
  - src/scripts/controllers/saveController.ts
---

## Goal

When the user picks a `.tex`, `.tikz` or `.pgf` file, run the importer and load
the result through the existing JSON path. JSON files keep working exactly as
before.

## Current code

`src/scripts/controllers/saveController.ts`, inside `loadFile`:

```ts
let inputstring = evt.target.result instanceof ArrayBuffer ? "" : evt.target.result
const input = JSON.parse(inputstring)
if (!("version" in input)) { … }
this.loadFromJSON(input, true)
this.loadModal.hide()
```

## Change

```ts
let inputstring = evt.target.result instanceof ArrayBuffer ? "" : evt.target.result

const lower = file.name.toLowerCase()
const isTex = lower.endsWith(".tex") || lower.endsWith(".tikz") || lower.endsWith(".pgf")
if (isTex) {
	const { saveFile, result } = texToSaveFile(inputstring, file.name)
	this.loadFromJSON(saveFile, true)
	this.showImportReport(result)      // see below
	this.loadModal.hide()
	return
}

let input: SaveFileFormat
try {
	input = JSON.parse(inputstring)
} catch {
	this.loadMessage.textContent = "error: not a JSON save file"
	return
}
if (!("version" in input)) { …unchanged… }
this.loadFromJSON(input, true)
this.loadModal.hide()
```

Add the private method:

```ts
private showImportReport(result: ImportResult) {
	const { summary, details } = formatImportReport(result)
	this.loadMessage.textContent = details.length
		? `${summary} — ${details.length} skipped line(s) shown in the console`
		: summary
	if (details.length) console.warn("[tex import] skipped lines:\n" + details.join("\n"))
}
```

## Rules

- Keep the "Remove existing components" checkbox behaviour: `loadFromJSON`
  already handles it, the importer must not duplicate that logic.
- Import `texToSaveFile` from `../import` (the facade) and `formatImportReport`
  from `../import/report`. No other imports from `../import/*` — the internals
  stay private.
- Do not touch `loadFromJSON`, `save`, `toJson` or the modal markup.
- A JSON file with a broken body must produce the message above, not an uncaught
  exception (this is a pre-existing bug; fix it here because the same code path
  now serves two formats).

## Acceptance

- `npm run build` passes.
- Manual: `npm run start`, load `tests/fixtures/tex/buck.tex` → components appear,
  modal closes, message reads `imported N, skipped 0`.
- Manual: load a JSON export → behaves exactly as before.
- Manual: load `cell.tex` → `imported 0, skipped 1`, no crash, no dialog stack.

## Out of scope

`src/pages/index.html` (card `053`), the report text itself (card `055`), drag and
drop handling beyond the `accept` attribute.