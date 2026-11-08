/**
 * Card 050 - import/pipeline.ts
 *
 * `preprocess()` composing the four stages: the `buck.tex` acceptance case,
 * the stage order (comments before `\foreach`, warnings in stage order), the
 * scaffolding blanking, purity, and a sweep over the 23 circuitikz fixtures.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "050"

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "fixtures", "tex")

/** A line that carries a `\draw` statement, as opposed to a comment about one. */
const isDrawLine = (line) => line.trim().startsWith("\\draw")

export async function run(ctx) {
	const { preprocess } = ctx.require("./../.build/src/scripts/import/pipeline.js")

	const read = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8")

	// --- the card's acceptance case: buck.tex ------------------------------
	{
		const source = read("buck.tex")
		const doc = preprocess(source, "buck.tex")

		ctx.assert(doc.settings.european === true, `buck.tex must be european, got ${JSON.stringify(doc.settings)}`)
		ctx.assert(
			typeof doc.colors.ink === "string" && /^#[0-9a-f]{6}$/.test(doc.colors.ink),
			`buck.tex must define the ink colour, got ${JSON.stringify(doc.colors)}`
		)
		ctx.assert(doc.colors.ink === "#1f2a33", `ink is RGB 31,42,51 -> #1f2a33, got ${JSON.stringify(doc.colors.ink)}`)
		ctx.assert(
			typeof doc.colors.grp === "string",
			`every \definecolor must be collected, got ${JSON.stringify(doc.colors)}`
		)

		for (const token of ["\\ctikzset", "\\definecolor", "\\foreach"]) {
			ctx.assert(!doc.text.includes(token), `buck.tex must not keep ${token} after preprocess`)
		}
		for (const token of [
			"\\documentclass",
			"\\usepackage",
			"\\usetikzlibrary",
			"\\setmainfont",
			"\\begin{document}",
			"\\end{document}",
			"\\begin{tikzpicture}",
			"\\end{tikzpicture}",
		]) {
			ctx.assert(!doc.text.includes(token), `the scaffolding line ${token} must be blanked`)
		}

		// every \draw statement survives, trimmed (the comment stage squeezes
		// the whitespace outside braces and brackets)
		const processed = new Set(doc.text.split("\n").map((line) => line.trim()))
		const draws = source.split("\n").filter(isDrawLine)
		ctx.assert(draws.length > 0, "buck.tex must contain \\draw statements")
		for (const line of draws) {
			ctx.assert(processed.has(line.trim()), `the statement ${JSON.stringify(line.trim())} must survive preprocess`)
		}
		ctx.assert(doc.text.includes("to[L, l_=$L$]"), "the inductor statement must stay readable")
	}

	// --- defaults on a bare snippet ----------------------------------------
	{
		const doc = preprocess("\\draw (0,0) -- (1,0);\n", "bare.tex")
		ctx.assert(doc.text.includes("\\draw (0,0) -- (1,0);"), `text: ${JSON.stringify(doc.text)}`)
		ctx.assert(
			JSON.stringify(doc.settings) ===
				JSON.stringify({
					european: false,
					rpvoltages: false,
					bipolesLength: 1.0,
					inductorStyle: null,
					defaultLineWidth: null,
					defaultColor: null,
				}),
			`default settings: ${JSON.stringify(doc.settings)}`
		)
		ctx.assert(JSON.stringify(doc.colors) === "{}", `no colours in a bare snippet, got ${JSON.stringify(doc.colors)}`)
		ctx.assert(Array.isArray(doc.warnings) && doc.warnings.length === 0, `no warnings, got ${JSON.stringify(doc.warnings)}`)
	}

	// --- scaffolding is blanked, not deleted: line count is stable --------
	{
		const source = "\\documentclass{standalone}\n\\begin{document}\n\\draw (0,0) -- (1,0);\n\\end{document}\n"
		const doc = preprocess(source, "small.tex")
		ctx.assert(doc.text.split("\n").length === source.split("\n").length, "blanking scaffolding must keep the line count")
		ctx.assert(doc.text.split("\n")[2] === "\\draw (0,0) -- (1,0);", `the statement moved: ${JSON.stringify(doc.text.split("\n")[2])}`)
	}

	// --- comments are stripped before \foreach is expanded ----------------
	{
		const source = "\\foreach \\x in {1,2} {\n  \\draw (\\x,0) -- (\\x,1); % SECRET\n}\n"
		const doc = preprocess(source, "loop.tex")
		ctx.assert(!doc.text.includes("SECRET"), "a comment inside a loop body must not be copied with the body")
		ctx.assert(
			(doc.text.match(/\\draw /g) || []).length === 2,
			`the loop must expand to two draws, got ${JSON.stringify(doc.text)}`
		)
		ctx.assert(!doc.text.includes("\\foreach"), "the loop itself is gone after preprocessing")
	}

	// --- warnings are concatenated in stage order -------------------------
	{
		// colors (stage 2) before settings (stage 3)
		const source = "\\definecolor{bad}{cmyk}{0,0,0,0}\n\\ctikzset{bogus=1}\n"
		const doc = preprocess(source, "warnings.tex")
		ctx.assert(doc.warnings.length >= 2, `expected two warnings, got ${JSON.stringify(doc.warnings)}`)
		ctx.assert(
			doc.warnings[0].reason.includes("colour model"),
			`the colours stage must warn first, got ${JSON.stringify(doc.warnings)}`
		)
		ctx.assert(
			doc.warnings[1].reason.includes("ctikzset"),
			`the settings stage must follow the colours stage, got ${JSON.stringify(doc.warnings)}`
		)
	}

	// --- purity: two calls yield the same document ------------------------
	{
		const source = read("buck.tex")
		const first = preprocess(source, "buck.tex")
		const second = preprocess(source, "buck.tex")
		ctx.assert(first !== second, "each call must return a new TextDoc")
		ctx.assert(JSON.stringify(first) === JSON.stringify(second), "preprocess must be pure: two calls must be equal")
		ctx.assert(preprocess(source, "buck.tex").text === first.text, "the input must not be consumed by the first call")
	}

	// --- corpus sweep: the 23 circuitikz fixtures -------------------------
	{
		const names = fs.readdirSync(FIXTURES).filter((name) => name.endsWith(".tex")).sort()
		ctx.assert(names.length > 1, `no .tex fixtures found at ${FIXTURES}`)

		let processedCount = 0
		let warnings = 0
		let unexpected = []
		let loops = 0
		let lineDrift = []
		const failures = []

		for (const name of names) {
			if (name === "cell.tex") continue // plain TikZ block diagram, out of scope
			const source = read(name)
			let doc
			try {
				doc = preprocess(source, name)
			} catch (error) {
				failures.push(`${name}: ${error.message}`)
				continue
			}
			processedCount += 1
			warnings += doc.warnings.length
			for (const warning of doc.warnings) {
				if (warning.reason.includes("unexpected")) unexpected.push(`${name}:${warning.line}: ${warning.reason}`)
			}
			if (doc.text.includes("\\foreach")) loops += 1

			// Blanking never changes the line count. Only a \foreach expansion can,
			// and it says so itself; such a file is reported, not treated as a bug.
			const drifted = doc.text.split("\n").length !== source.split("\n").length
			if (drifted) lineDrift.push(name)
			ctx.assert(
				!drifted || doc.warnings.some((warning) => warning.reason.includes("changed the line count")),
				`${name}: the line count changed without a foreach warning`
			)
			ctx.assert(doc.text.split("\n").length >= 1, `${name}: empty output`)
		}

		ctx.assert(failures.length === 0, `preprocess threw on ${failures.length} fixture(s): ${JSON.stringify(failures)}`)
		ctx.assert(processedCount === 23, `expected 23 circuitikz fixtures, processed ${processedCount}`)
		ctx.assert(unexpected.length === 0, `no warning may say "unexpected", found ${JSON.stringify(unexpected)}`)
		ctx.assert(loops === 0, `${loops} fixture(s) still contain \\foreach after preprocessing`)

		console.log(
			`fixtures: ${processedCount} processed, ${failures.length} exceptions, ${warnings} warnings, ` +
				`${unexpected.length} "unexpected", ${loops} with \\foreach, line drift: ${lineDrift.length ? lineDrift.join(",") : "0"}`
		)
	}

	// --- cell.tex is not rejected here ------------------------------------
	{
		const doc = preprocess(read("cell.tex"), "cell.tex")
		ctx.assert(doc.text.includes("\\node[block]"), "cell.tex must keep \\node[block]: rejecting it is card 052's job")
		ctx.assert(!doc.text.includes("\\documentclass") && !doc.text.includes("\\usetikzlibrary"), "cell.tex scaffolding is blanked")
	}
}