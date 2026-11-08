// Card 055 — import/report.ts: the imported/skipped summary and console details.
// Unit checks for the pure formatter. Runs automatically via `npm run test:import`.

import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "055"

// compiled module under test, next to index.js in tools/.build
// (absolute: ctx.require resolves relative paths against tools/tex-import/run.mjs)
const REPORT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".build", "src", "scripts", "import", "report.js")

export async function run(ctx) {
	const { formatImportReport } = ctx.require(REPORT)

	// shape — the module exposes exactly the contracted function
	{
		ctx.assert(typeof formatImportReport === "function", `report must export formatImportReport, got ${typeof formatImportReport}`)
	}

	// card acceptance (a) — nothing skipped, no details
	{
		const report = formatImportReport({ skipped: [], components: new Array(42) })
		ctx.assert(report.summary === "imported 42, skipped 0", `clean summary must be "imported 42, skipped 0", got ${JSON.stringify(report.summary)}`)
		ctx.assert(Array.isArray(report.details) && report.details.length === 0, `clean report must have no details, got ${JSON.stringify(report.details)}`)
	}

	// card acceptance (b) — duplicates collapse, details sort by line, (×N) is appended
	{
		const skipped = [
			{ line: 10, text: "\\draw (0,0) to[Xyz] (1,0);", reason: 'unknown symbol "Xyz"' },
			{ line: 5, text: "\\draw (0,0) to[Q] (1,0);", reason: "unknown bipole" },
			{ line: 10, text: "\\draw (0,1) to[Xyz] (1,1);", reason: 'unknown symbol "Xyz"' },
		]
		const report = formatImportReport({ skipped, components: [] })
		ctx.assert(report.summary === "imported 0, skipped 3", `summary must count raw warnings, got ${JSON.stringify(report.summary)}`)
		ctx.assert(report.details.length === 2, `duplicates must collapse to 2 details, got ${report.details.length}: ${JSON.stringify(report.details)}`)
		ctx.assert(report.details[0].startsWith("line 5: "), `details must be sorted by line, first entry got ${JSON.stringify(report.details[0])}`)
		ctx.assert(report.details[1].startsWith("line 10: "), `details must be sorted by line, second entry got ${JSON.stringify(report.details[1])}`)
		ctx.assert(report.details[1].endsWith("(×2)"), `the collapsed duplicate must carry (×2), got ${JSON.stringify(report.details[1])}`)
		ctx.assert(!report.details[0].includes("(×"), `a single warning must carry no multiplier, got ${JSON.stringify(report.details[0])}`)
		// the multiplier goes last, after the source text
		ctx.assert(report.details[1].includes("to[Xyz] (1,0); (×2)"), `the multiplier must follow the text, got ${JSON.stringify(report.details[1])}`)
	}

	// card acceptance (c) — an empty statement text renders as <no source line>
	{
		const report = formatImportReport({
			skipped: [{ line: 1, text: "", reason: "block diagram / unsupported document" }],
			components: [],
		})
		ctx.assert(report.summary === "imported 0, skipped 1", `cell.tex summary must be "imported 0, skipped 1", got ${JSON.stringify(report.summary)}`)
		ctx.assert(report.details.length === 1, `cell.tex must have one detail, got ${report.details.length}`)
		ctx.assert(report.details[0] === "line 1: block diagram / unsupported document — <no source line>", `empty text must render <no source line>, got ${JSON.stringify(report.details[0])}`)
	}

	// empty document — the only summary that carries the extra note
	{
		const report = formatImportReport({ skipped: [], components: [] })
		ctx.assert(report.summary === "imported 0, skipped 0 (empty document)", `empty summary must be "imported 0, skipped 0 (empty document)", got ${JSON.stringify(report.summary)}`)
		ctx.assert(report.details.length === 0, `empty document must have no details, got ${JSON.stringify(report.details)}`)
	}

	// detail shape and truncation — `line <n>: <reason> — <text>`, text capped at 80 chars
	{
		const long = "\\draw " + "x".repeat(200) + ";"
		const report = formatImportReport({
			skipped: [{ line: 37, text: long, reason: 'unknown symbol "Xyz"' }],
			components: [],
		})
		const [detail] = report.details
		ctx.assert(detail.startsWith('line 37: unknown symbol "Xyz" — \\draw '), `detail must follow "line <n>: <reason> — <text>", got ${JSON.stringify(detail)}`)
		const text = detail.slice(detail.indexOf(" — ") + 3)
		ctx.assert(text.length <= 80, `detail text must be truncated to 80 chars, got ${text.length}`)
		ctx.assert(text.length >= 79, `a long text must fill the budget, got ${text.length}`)
		// no trailing whitespace survives the cut
		ctx.assert(text === text.trimEnd(), `truncated text must not end in whitespace, got ${JSON.stringify(text)}`)
	}

	// multi-line statement text is flattened to one console row
	{
		const report = formatImportReport({
			skipped: [{ line: 9, text: "\\draw (0,0)\n\tto[R]\n\t(1,0);", reason: "bad" }],
			components: [],
		})
		ctx.assert(!/\n/.test(report.details[0]), `a detail must stay on one line, got ${JSON.stringify(report.details[0])}`)
		ctx.assert(report.details[0].includes("\\draw (0,0) to[R] (1,0);"), `whitespace must be collapsed, got ${JSON.stringify(report.details[0])}`)
	}

	// different reasons on the same line are not duplicates
	{
		const report = formatImportReport({
			skipped: [
				{ line: 4, text: "a", reason: "r1" },
				{ line: 4, text: "b", reason: "r2" },
			],
			components: [],
		})
		ctx.assert(report.details.length === 2, `same line, different reasons must stay 2 details, got ${report.details.length}`)
	}

	// purity — the formatter does not print on its own and does not mutate the result
	{
		const skipped = [{ line: 2, text: "t", reason: "r" }]
		const input = { skipped, components: [] }
		const originalConsole = { warn: console.warn, log: console.log, error: console.error, info: console.info }
		const calls = []
		console.warn = console.log = console.error = console.info = (...args) => calls.push(args)
		try {
			formatImportReport(input)
		} finally {
			Object.assign(console, originalConsole)
		}
		ctx.assert(calls.length === 0, `formatImportReport must not print, got ${calls.length} console call(s)`)
		ctx.assert(input.skipped.length === 1 && input.skipped[0].line === 2, "formatImportReport must not mutate its input")
	}

	// no Cyrillic in the summary — the console is cp866
	{
		const report = formatImportReport({
			skipped: [{ line: 31, text: "ШИМ", reason: "label colour of text node ignored" }],
			components: new Array(3),
		})
		ctx.assert(!/[\u0400-\u04FF]/.test(report.summary), `summary must stay ASCII, got ${JSON.stringify(report.summary)}`)
		// ...but source text is quoted as-is in the details
		ctx.assert(report.details[0].includes("ШИМ"), `details must quote the source verbatim, got ${JSON.stringify(report.details[0])}`)
	}
}