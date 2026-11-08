---
id: "055"
title: "import/report.ts — format the imported/skipped summary"
track: pipeline
pool: local
wave: 6
size: S
deps: ["052"]
writes:
  - src/scripts/import/report.ts
---

## Contract

```ts
import type { ImportResult } from "./types"

export function formatImportReport(result: ImportResult): {
	summary: string   // one line, shown in the load modal
	details: string[] // one entry per skipped line, for the console
}
```

## Rules

- `summary` is English, CLI-safe, no Cyrillic:
  - nothing skipped: `imported 42, skipped 0`
  - with skips: `imported 40, skipped 2`
  - nothing imported and nothing skipped: `imported 0, skipped 0 (empty document)`
- `details` entries, one per warning, sorted by line:
  ```
  line 37: unknown symbol "Xyz" — \draw (0,0) to[Xyz] (1,0);
  ```
  Format: `line <n>: <reason> — <text truncated to 80 chars>`.
- Text that is empty (synthetic warnings such as the `cell.tex` rejection) is
  rendered as `<no source line>` instead of a dangling dash.
- Duplicate `(line, reason)` pairs are collapsed; count them and append
  `(×N)` when a duplicate was dropped.
- Pure function: no `console`, no DOM, no I/O. The caller prints.

## Acceptance

```bash
npm run test:import
```

- `formatImportReport({skipped: [], components: new Array(42)})` →
  `summary === "imported 42, skipped 0"`, `details.length === 0`.
- Three warnings on lines 10, 5, 10 (same reason) →
  `details` has 2 entries, sorted `line 5`, `line 10`, and the second carries
  `(×2)`.
- Warning with `text: ""` renders `<no source line>`.

## Out of scope

Printing, modal markup, translating to Russian — the UI string is English here on
purpose (the console is cp866).