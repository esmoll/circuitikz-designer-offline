---
id: "000"
title: "import/types.ts — frozen contracts for the .tex importer"
track: contract
pool: remote
wave: 1
size: S
deps: []
writes:
  - src/scripts/import/types.ts
---

## Goal

Create the single contract file that every other import module compiles against.
Nothing else in the run may change it; if a signature is wrong, raise it on the
board instead of editing this file.

## Content to write verbatim

Path: `src/scripts/import/types.ts`

```ts
import type { ComponentSaveObject } from "../components/circuitComponent"

export type Point = { x: number; y: number }

export type GlobalSettings = {
	european: boolean
	rpvoltages: boolean
	bipolesLength: number // cm, default 1.0
	inductorStyle: "american" | "european" | null
	defaultLineWidth: string | null
	defaultColor: string | null
}

export type TextDoc = {
	text: string
	colors: Record<string, string>
	settings: GlobalSettings
	warnings: ImportWarning[]
}

export type PreprocessStage = (doc: TextDoc) => TextDoc

export type CoordContext = {
	named: Map<string, Point>
	anchors: AnchorResolver | null
	lastPoint: Point | null
	bipolesLength: number // cm
}

export type CoordResult = {
	point: Point // cm, TikZ orientation (y up)
	next: number // index in the token string just after the coordinate
	lastPoint: Point
}

export type CoordResolver = (token: string, index: number, ctx: CoordContext) => CoordResult | null

export type AnchorResolver = {
	resolve(node: string, anchor: string): Point | null
}

export type RawCommand = {
	kind: "draw" | "node" | "unknown"
	options: string
	arguments: string
	line: number
	source: string
}

export type BuildContext = {
	settings: GlobalSettings
	colors: Record<string, string>
	coords: CoordContext
	report: ImportWarning[]
}

export type CommandHandler = {
	canHandle(cmd: RawCommand): boolean
	handle(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[]
}

export type ImportWarning = { line: number; text: string; reason: string }

export type ImportResult = {
	components: ComponentSaveObject[]
	skipped: ImportWarning[]
	settings: GlobalSettings
	colors: Record<string, string>
}
```

## Rules

- Units in `Point` are **centimetres in TikZ orientation (y up)**. The designer
  stores pixels with y down; conversion happens only in `coords/absolute.ts`.
- `ComponentSaveObject` is `{ type: string; selected?: boolean }` and lives in
  `src/scripts/components/circuitComponent.ts`. Import it as a **type only** so
  this file stays free of runtime dependencies.
- Do not add runtime code, helpers or re-exports to this file.

## Acceptance

```bash
npx tsc --noEmit -p tsconfig.json
```

must pass with no errors mentioning `src/scripts/import/types.ts`.

## Out of scope

Implementation of any resolver, scanner or handler. Only the declarations above.