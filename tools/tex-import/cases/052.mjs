// Card 052 — index.ts: the public texToSaveFile facade, end to end.
// Unit checks that run the whole pipeline (preprocess, tokenize, buildComponents)
// over the real corpus fixtures. Runs automatically via `npm run test:import`.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "052"

// tests/fixtures/tex sits three levels up from tools/tex-import/cases.
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "fixtures", "tex")

function readFixture(name) {
	return fs.readFileSync(path.join(FIXTURES, name), "utf8")
}

function fixtureNames() {
	return fs
		.readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".tex"))
		.sort()
}

function census(components) {
	const counts = {}
	for (const c of components) {
		counts[c.type] = (counts[c.type] || 0) + 1
	}
	return counts
}

export async function run(ctx) {
	// the compiled facade itself is the module under test
	ctx.assert(ctx.importer !== null, `ctx.importer must be the compiled index facade, got ${String(ctx.importer)}`)
	ctx.assert(typeof ctx.importer.texToSaveFile === "function", `facade must export texToSaveFile, got ${typeof ctx.importer.texToSaveFile}`)
	const { texToSaveFile } = ctx.importer
	const names = fixtureNames()

	// cell.tex — plain-TikZ block diagram: unsupported document, empty save file, settings still parsed
	{
		const { saveFile, result } = texToSaveFile(readFixture("cell.tex"), "cell.tex")
		ctx.assert(saveFile.components.length === 0, `cell.tex must produce no components, got ${saveFile.components.length}`)
		ctx.assert(result.skipped.length === 1, `cell.tex must report exactly one warning, got ${result.skipped.length}`)
		ctx.assert(result.skipped[0].reason.includes("unsupported document"), `cell.tex warning must name the unsupported document, got ${JSON.stringify(result.skipped[0].reason)}`)
		ctx.assert(result.skipped[0].line === 1, `cell.tex warning must sit on line 1, got ${result.skipped[0].line}`)
		ctx.assert(result.skipped[0].text === "", `cell.tex warning must carry no text, got ${JSON.stringify(result.skipped[0].text)}`)
		ctx.assert(result.settings.european === false, `cell.tex loads plain tikz — settings.european must stay false, got ${result.settings.european}`)
		ctx.approx(result.settings.bipolesLength, 1.0, 1e-9)
	}

	// buck.tex — card acceptance plus the current exact reality, so regressions scream.
	// The 1 remaining warning is the documented deviation (the (name.anchor) chain gap tracked on cards 041/051; the bipoles/thickness and text= holes were closed by the 013/044 review rounds) from the aspirational "skipped === 0";
	// one per line below, each naming its owning card.
	{
		const { saveFile, result } = texToSaveFile(readFixture("buck.tex"), "buck.tex")
		ctx.assert(saveFile.version === "0.1", `saveFile.version must be "0.1", got ${JSON.stringify(saveFile.version)}`)
		ctx.assert(saveFile.components.length === 27, `buck.tex must produce 27 components (card acceptance: more than 0), got ${saveFile.components.length}`)
		const counts = census(saveFile.components)
		ctx.assert(counts.wire === 7 && counts.path === 5 && counts.node === 15, `buck census must be {wire: 7, path: 5, node: 15}, got ${JSON.stringify(counts)}`)
		ctx.assert(result.skipped.length === 1, `buck.tex must report exactly 1 warning, got ${result.skipped.length}`)
		const [anchor] = result.skipped
		// (b) card 051 — the resolveAnchor chain gap: (VT.G) cannot be resolved, wire skipped
		ctx.assert(anchor.line === 30, `buck warning (b) must sit on line 30, got ${anchor.line}`)
		ctx.assert(anchor.text === "(VT.G)", `buck warning (b) must name the unresolvable (VT.G) coordinate, got ${JSON.stringify(anchor.text)}`)
		ctx.assert(anchor.reason === "coordinate could not be resolved; wire skipped", `buck warning (b) must be card 051's wire-skipped warning, got ${JSON.stringify(anchor.reason)}`)
	}

	// saveFile.components is the SAME array reference as result.components — no copy
	{
		const { saveFile, result } = texToSaveFile(readFixture("buck.tex"), "buck.tex")
		ctx.assert(saveFile.components === result.components, "saveFile.components must be the same array reference as result.components")
	}

	// corpus sweep — all 24 fixtures: never throws, version and tikzSettings shape,
	// exactly one unsupported document (cell.tex), the other 23 with components,
	// every warning shaped
	{
		ctx.assert(names.length === 24, `corpus must hold 24 .tex fixtures, got ${names.length}`)
		const badVersion = []
		const badSettings = []
		const unsupported = []
		const emptyButSupported = []
		const badWarnings = []
		for (const name of names) {
			let outcome = null
			try {
				outcome = texToSaveFile(readFixture(name), name)
			} catch (error) {
				ctx.assert(false, `texToSaveFile must not throw on ${name}, got ${error.message}`)
			}
			if (outcome.saveFile.version !== "0.1") badVersion.push(`${name}: ${JSON.stringify(outcome.saveFile.version)}`)
			if (typeof outcome.saveFile.tikzSettings !== "object" || outcome.saveFile.tikzSettings === null) badSettings.push(name)
			const docUnsupported = outcome.result.skipped.some((s) => s.reason.includes("unsupported document"))
			if (docUnsupported) unsupported.push(name)
			else if (outcome.saveFile.components.length < 1) emptyButSupported.push(`${name}: ${outcome.saveFile.components.length}`)
			for (const w of outcome.result.skipped) {
				const shapedLineReason = typeof w.line === "number" && w.line >= 1 && typeof w.reason === "string" && w.reason.length > 0
				const shapedText = typeof w.text === "string" && (w.text.length > 0 || (w.line === 1 && w.text === ""))
				if (!shapedLineReason || !shapedText) badWarnings.push(`${name}: ${JSON.stringify(w)}`)
			}
		}
		ctx.assert(badVersion.length === 0, `every saveFile.version must be "0.1", got ${badVersion.join("; ")}`)
		ctx.assert(badSettings.length === 0, `every saveFile.tikzSettings must be a non-null object, got ${badSettings.join("; ")}`)
		ctx.assert(unsupported.length === 1 && unsupported[0] === "cell.tex", `exactly cell.tex must report the unsupported document, got ${JSON.stringify(unsupported)}`)
		ctx.assert(emptyButSupported.length === 0, `every other file must produce at least 1 component, got ${emptyButSupported.join("; ")}`)
		ctx.assert(badWarnings.length === 0, `every warning needs line >= 1, non-empty text (or the cell.tex {line: 1, text: ""} shape) and a reason, got ${badWarnings.join("; ")}`)
	}

	// aggregate sanity — the whole pipeline end to end across the corpus (current: 923)
	{
		let total = 0
		for (const name of names) {
			if (name === "cell.tex") continue
			total += texToSaveFile(readFixture(name), name).saveFile.components.length
		}
		ctx.assert(total > 400, `components across the 23 circuitikz files must exceed 400, got ${total}`)
	}

	// garbage input never throws — index.ts coerces a non-string text to "" before
	// preprocessing, so null lands in the unsupported branch, not in an empty save file
	{
		const empty = texToSaveFile("", "empty.tex")
		ctx.assert(empty.saveFile.components.length === 0, `empty source must produce no components, got ${empty.saveFile.components.length}`)
		ctx.assert(empty.result.skipped.length === 1 && empty.result.skipped[0].reason.includes("unsupported document"), `empty source must return the unsupported shape, got ${JSON.stringify(empty.result.skipped)}`)
		const nul = texToSaveFile(null, "null.tex")
		ctx.assert(nul.saveFile.components.length === 0, `null source must produce no components, got ${nul.saveFile.components.length}`)
		ctx.assert(nul.result.skipped.length === 1, `null source must report exactly one warning, got ${nul.result.skipped.length}`)
		ctx.assert(nul.result.skipped[0].line === 1 && nul.result.skipped[0].text === "" && nul.result.skipped[0].reason.includes("unsupported document"), `null must return the exact unsupported shape, got ${JSON.stringify(nul.result.skipped)}`)
		// a file with no ctikzset and no text nodes is fully clean — the corpus warnings
		// come from real corpus features, not from the pipeline
		const tiny = texToSaveFile("\\draw (0,0) -- (1,0);", "tiny.tex")
		const counts = census(tiny.saveFile.components)
		ctx.assert(tiny.saveFile.components.length === 1 && counts.wire === 1, `a bare wire draw must yield exactly 1 wire, got ${JSON.stringify(counts)}`)
		ctx.assert(tiny.result.skipped.length === 0, `a clean file must produce no warnings, got ${JSON.stringify(tiny.result.skipped)}`)
	}

	// determinism — two runs over the same source share no state
	{
		const source = readFixture("buck.tex")
		const first = texToSaveFile(source, "buck.tex")
		const second = texToSaveFile(source, "buck.tex")
		ctx.assert(first.saveFile.components.length === second.saveFile.components.length, `two runs must yield equal component counts, got ${first.saveFile.components.length} and ${second.saveFile.components.length}`)
		ctx.assert(first.result.skipped.length === second.result.skipped.length, `two runs must yield equal skipped lengths, got ${first.result.skipped.length} and ${second.result.skipped.length}`)
	}
}
