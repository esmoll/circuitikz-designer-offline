/**
 * The public entry point of the .tex importer.
 *
 * `saveController.ts` (card `054`) imports exactly one symbol from here —
 * `texToSaveFile` — so nothing else from `src/scripts/import/` is re-exported.
 * The module must run under plain Node (`npm run test:import`): no DOM, no
 * SVG.js, no app singletons, no `console.*` — reporting is card `055`'s job
 * and the caller reads the file.
 *
 * @module import/index
 */

import type { GlobalTikzSettings } from "../components/environmentVariableController"
import type { SaveFileFormat } from "../controllers/saveController"
import { buildComponents } from "./dispatch"
import { preprocess } from "./pipeline"
import { tokenize } from "./scanner/lexer"
import type { ImportResult } from "./types"

/**
 * The save-file version this module emits, mirroring `currentSaveVersion` in
 * `../controllers/saveController.ts`.
 *
 * That value is not imported here on purpose: the controller pulls bootstrap
 * (and through `../internal` the whole app graph), whose module-level
 * `document` access cannot run under plain Node — and this module must
 * (`npm run test:import`). Keep the two in sync.
 *
 * @readonly
 */
const currentSaveVersion = "0.1"

/** What the importer hands to `SaveController.loadFromJSON`. */
export type TexImportOutcome = {
	saveFile: SaveFileFormat
	result: ImportResult
}

/**
 * True when the preprocessed text looks like a circuitikz drawing.
 *
 * Supported means it places bipoles (`to[...]`) or draws wires between
 * numeric coordinates (`(0,0) -- ++(1,0)`). A plain-TikZ block diagram joins
 * *named* nodes with `--` (`(set) -- (vyp)`) and never uses `to[`, so the
 * digit-before-`)` requirement keeps it out — the `--` of `(set) -- (vyp)`
 * must not look like a wire.
 *
 * @param text - the preprocessed document text
 */
function looksLikeCircuitikz(text: string): boolean {
	return text.includes("to[") || /\d\s*\)\s*--/.test(text)
}

/**
 * Converts a `.tex` source into a designer save file.
 *
 * The pipeline is preprocess (card `050`) → tokenize (`020`) →
 * buildComponents (`051`). A document that is not a circuitikz drawing at all
 * (e.g. the `cell.tex` block diagram) returns an empty save file with one
 * `unsupported document` warning instead of throwing, so the caller can show
 * it as a normal "0 imported, N skipped" report.
 *
 * @param text - the raw contents of a `.tex` file
 * @param fileName - the file name, for the caller's logging only
 * @returns the save file plus the importer's own result (settings, colours, warnings)
 */
export function texToSaveFile(text: string, fileName: string): TexImportOutcome {
	const doc = preprocess(typeof text === "string" ? text : "", fileName)

	if (!looksLikeCircuitikz(doc.text)) {
		return {
			saveFile: {
				version: currentSaveVersion,
				tikzSettings: {} as GlobalTikzSettings,
				components: [],
			},
			result: {
				components: [],
				skipped: [{ line: 1, text: "", reason: "block diagram / unsupported document" }],
				settings: doc.settings,
				colors: doc.colors,
			},
		}
	}

	const commands = tokenize(doc)
	const result = buildComponents(commands, doc)
	const saveFile: SaveFileFormat = {
		version: currentSaveVersion,
		tikzSettings: {} as GlobalTikzSettings,
		components: result.components,
	}

	return { saveFile, result }
}
