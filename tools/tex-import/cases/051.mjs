// Card 051 — import/dispatch.ts: run handlers, build the ImportResult.
// Unit checks for buildComponents over the tokenized statements. Runs
// automatically via `npm run test:import`.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "051"

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "fixtures", "tex")

function makeDoc(source) {
	return {
		text: source,
		colors: {},
		settings: {
			european: true,
			rpvoltages: true,
			bipolesLength: 1.0,
			inductorStyle: "american",
			defaultLineWidth: "1.0pt",
			defaultColor: "ink",
		},
		warnings: [],
	}
}

export async function run(ctx) {
	const { buildComponents } = ctx.require("../.build/src/scripts/import/dispatch.js")
	const { tokenize } = ctx.require("../.build/src/scripts/import/scanner/lexer.js")
	const { preprocess } = ctx.require("../.build/src/scripts/import/pipeline.js")

	// five-statement acceptance fixture: wire, labeled bipole, pole, text node,
	// unsupported \fill. circles.ts accepts a bare trailing `node[ocirc]{}`, but
	// with `to[generic]` kept on the same statement card 042 would add its
	// bipole too — the pole statement drops the `to`, leaving exactly one pole.
	{
		const doc = makeDoc("\\draw (0,0) -- (1,0);\n\\draw (1,0) to[R, l=$R_1$] (2,0);\n\\draw (2,0) node[ocirc]{};\n\\node at (1,1) {A};\n\\fill (0,0) circle (1pt);\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)

		ctx.assert(result.components.length === 4, `exactly 4 components, got ${result.components.length}: ${JSON.stringify(result.components.map((c) => c.type))}`)
		ctx.assert(
			result.components[0].type === "wire",
			`the first component must be the wire of line 1, got ${JSON.stringify(result.components[0].type)}`
		)
		ctx.assert(
			Array.isArray(result.components[0].directions) && result.components[0].directions[0] === "--",
			`the wire must carry directions ["--"], got ${JSON.stringify(result.components[0].directions)}`
		)
		ctx.assert(
			result.components[1].type === "path",
			`the second component must be the bipole path, got ${JSON.stringify(result.components[1].type)}`
		)
		ctx.assert(
			result.components[1].id === "european resistor",
			`R with european:true must resolve to the european resistor, got ${JSON.stringify(result.components[1].id)}`
		)
		ctx.assert(
			result.components[1].label && result.components[1].label.value === "$R_1$",
			`the bipole must carry the l= label value, got ${JSON.stringify(result.components[1].label)}`
		)
		ctx.assert(
			result.components[1].label && result.components[1].label.otherSide === false,
			`the l= label must sit on the default side, got ${JSON.stringify(result.components[1].label)}`
		)
		ctx.assert(
			result.components[2].type === "node" && result.components[2].id === "ocirc",
			`the third component must be the ocirc pole, got ${JSON.stringify(result.components[2])}`
		)
		ctx.assert(
			result.components[3].type === "node" && result.components[3].label && result.components[3].label.value === "A",
			`the fourth component must be the text node A, got ${JSON.stringify(result.components[3])}`
		)
		ctx.assert(result.skipped.length === 1, `exactly 1 warning, got ${JSON.stringify(result.skipped)}`)
		ctx.assert(
			result.skipped[0].reason === "unsupported command",
			`the \\fill must be reported as unsupported, got ${JSON.stringify(result.skipped[0].reason)}`
		)
		ctx.assert(result.skipped[0].line === 5, `the \\fill warning must carry line 5, got ${JSON.stringify(result.skipped[0].line)}`)
	}

	// named coordinates survive across commands. bipoles.ts registers name=VT at
	// the START of the bipole — (0,0) here — and that registered point is what
	// the resistor of the second statement starts from. With a per-command
	// coordinate context (VT) would resolve to nothing: no resistor at all, or
	// one starting at the previous statement's last point (x = 4800/127).
	{
		const doc = makeDoc("\\draw (0,0) to[V, name=VT] (1,0);\n\\draw (VT) to[R] (2,0);\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		const resistors = result.components.filter((c) => c.type === "path" && c.id === "european resistor")

		ctx.assert(
			resistors.length === 1,
			`exactly one resistor component, got ${JSON.stringify(result.components.map((c) => c.type + " " + (c.id || "")))}`
		)
		ctx.approx(resistors[0].points[0].x, 0, 1e-6, "the resistor must start at the registered VT point (x = 0)")
		ctx.approx(resistors[0].points[0].y, 0, 1e-6, "the resistor must start at the registered VT point (y = 0)")
		ctx.assert(result.skipped.length === 0, `the named reference must resolve without warnings, got ${JSON.stringify(result.skipped)}`)
	}

	// unknown symbol: two DIFFERENT reasons must survive the per-(line, reason)
	// dedupe. Card 045's pairing warning also lands on this statement, so only
	// the presence of both contracted reasons is asserted, not the total count.
	{
		const doc = makeDoc("\\draw (0,0) to[zzz] (1,0);\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		const unknown = result.skipped.find((w) => w.reason === "unknown symbol zzz")
		const empty = result.skipped.find((w) => w.reason === "statement produced no components")

		ctx.assert(result.components.length === 0, `an unknown symbol must emit nothing, got ${JSON.stringify(result.components)}`)
		ctx.assert(
			unknown !== undefined && unknown.line === 1,
			`the unknown symbol must be reported with line 1, got ${JSON.stringify(result.skipped)}`
		)
		ctx.assert(
			empty !== undefined && empty.line === 1,
			`the empty statement must be reported with line 1, got ${JSON.stringify(result.skipped)}`
		)
	}

	// duplicate warnings collapse per (line, reason)
	{
		const doc = makeDoc("\\fill (0,0) circle (1pt); \\fill (0,0) circle (1pt);")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		ctx.assert(
			result.skipped.length === 1,
			`same-line duplicates must collapse to one warning, got ${JSON.stringify(result.skipped)}`
		)
	}
	{
		const doc = makeDoc("\\fill (0,0) circle (1pt);\n\\fill (0,0) circle (1pt);")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		ctx.assert(result.skipped.length === 2, `different lines must keep two warnings, got ${JSON.stringify(result.skipped)}`)
	}

	// anchor flushing with line rewrite. The resolver is consulted through the
	// calc spelling `$(VT.Q)+(0,0)$` — the token shape resolveCalcOffset owns; a
	// bare `(VT.Q)` reaches no resolver in the wire handler chain. Q is not a
	// nigfete pin, so the resolver degrades to the component point and records
	// the fallback warning with line 0; dispatch rewrites it to line 2.
	{
		const doc = makeDoc("\\draw (0,0) to[Tnigfete, name=VT] (1,0);\n\\draw $(VT.Q)+(0,0)$ -- (2,2);\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		const wires = result.components.filter((c) => c.type === "wire")

		ctx.assert(
			wires.length === 1,
			`the second statement must still yield a wire, got ${JSON.stringify(result.components.map((c) => c.type))}`
		)
		ctx.approx(wires[0].points[0].x, 0, 1e-6, "the anchor must degrade to the component point (x = 0)")
		ctx.approx(wires[0].points[0].y, 0, 1e-6, "the anchor must degrade to the component point (y = 0)")
		ctx.assert(result.skipped.length === 1, `exactly the flushed anchor warning, got ${JSON.stringify(result.skipped)}`)
		ctx.assert(
			result.skipped[0].line === 2,
			`the flushed warning must carry the statement's line 2, got ${JSON.stringify(result.skipped[0])}`
		)
		ctx.assert(
			result.skipped[0].reason.includes("not resolvable"),
			`the fallback reason must say "not resolvable", got ${JSON.stringify(result.skipped[0].reason)}`
		)
	}

	// the result shares the document's references
	{
		const doc = makeDoc("\\draw (0,0) -- (1,0);\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		ctx.assert(result.skipped === doc.warnings, `skipped must be doc.warnings itself`)
		ctx.assert(result.settings === doc.settings, `settings must be doc.settings itself`)
		ctx.assert(result.colors === doc.colors, `colors must be doc.colors itself`)
	}

	// deterministic order: components follow the statements' line numbers
	{
		const doc = makeDoc("\\draw (0,0) -- (1,0);\n\\draw (1,0) to[R] (2,0);\n\\draw (2,0) node[ocirc]{};\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)

		ctx.assert(
			result.components.length === 3,
			`one component per statement, got ${JSON.stringify(result.components.map((c) => c.type))}`
		)
		ctx.assert(
			result.components[0].type === "wire",
			`the wire of line 1 must come first, got ${JSON.stringify(result.components[0].type)}`
		)
		ctx.assert(
			result.components[1].type === "path",
			`the path of line 2 must follow it, got ${JSON.stringify(result.components[1].type)}`
		)
		ctx.assert(
			result.components[2].type === "node",
			`the pole of line 3 must come last, got ${JSON.stringify(result.components[2].type)}`
		)
	}

	// never throws: garbage input returns cleanly
	{
		const doc = makeDoc("")
		const result = buildComponents([{ kind: "draw", options: "", arguments: null, line: 1, source: "x" }], doc)
		ctx.assert(
			Array.isArray(result.components) && result.components.length === 0,
			`garbage arguments must return cleanly, got ${JSON.stringify(result.components)}`
		)
		ctx.assert(result.skipped === doc.warnings, `the garbage statement must share the document report`)
	}
	{
		const doc = makeDoc("")
		const result = buildComponents([], doc)
		ctx.assert(
			Array.isArray(result.components) && result.components.length === 0,
			`an empty command list must return cleanly, got ${JSON.stringify(result.components)}`
		)
	}
	{
		// \draw (0,0) -- ; — a trailing op has no pair: wires.ts skips it
		// silently, so the round-trip must neither throw nor fabricate a wire.
		const doc = makeDoc("\\draw (0,0) -- ;\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		ctx.assert(
			Array.isArray(result.components) && result.components.length === 0,
			`a dangling op must not fabricate a wire, got ${JSON.stringify(result.components)}`
		)
	}
	{
		// a dangling `to[...]` does record warnings instead of throwing.
		const doc = makeDoc("\\draw (0,0) to[R] ;\n")
		const cmds = tokenize(doc)
		const result = buildComponents(cmds, doc)
		const dropped = result.skipped.some((w) => w.reason === "to element without start or end coordinate")
		ctx.assert(
			result.components.length === 0,
			`a dangling to must not fabricate a component, got ${JSON.stringify(result.components)}`
		)
		ctx.assert(
			dropped,
			`a dangling to must record a warning instead of throwing, got ${JSON.stringify(result.skipped)}`
		)
	}

	// corpus smoke: the full chain — preprocess, tokenize, dispatch — over all
	// 24 fixtures, none of which may throw
	{
		const names = fs.readdirSync(FIXTURES).filter((name) => name.endsWith(".tex")).sort()
		ctx.assert(names.length === 24, `the corpus must hold 24 fixtures, got ${names.length}`)
		ctx.assert(names.includes("cell.tex"), `cell.tex must be part of the corpus`)

		const failures = []
		const malformed = []
		let processed = 0
		let total = 0

		for (const name of names) {
			const source = fs.readFileSync(path.join(FIXTURES, name), "utf8")
			let result = null
			try {
				const doc = preprocess(source, name)
				const cmds = tokenize(doc)
				result = buildComponents(cmds, doc)
			} catch (error) {
				failures.push(`${name}: ${error.message}`)
				continue
			}
			processed += 1
			ctx.assert(Array.isArray(result.components), `${name}: components must be an array, got ${typeof result.components}`)
			for (const warning of result.skipped) {
				const ok =
					typeof warning.line === "number" &&
					warning.line >= 1 &&
					typeof warning.text === "string" &&
					warning.text.length > 0 &&
					typeof warning.reason === "string" &&
					warning.reason.length > 0
				if (!ok) malformed.push(`${name}:${warning.line}: ${JSON.stringify(warning)}`)
			}
			if (name !== "cell.tex") {
				ctx.assert(
					result.components.length >= 1,
					`${name}: must yield at least 1 component, got ${result.components.length}`
				)
				total += result.components.length
			}
		}

		ctx.assert(failures.length === 0, `the import chain threw on ${JSON.stringify(failures)}`)
		ctx.assert(processed === 24, `every fixture must run the full chain, processed ${processed}`)
		ctx.assert(
			malformed.length === 0,
			`every warning must carry line >= 1, text and reason, got ${JSON.stringify(malformed)}`
		)
		ctx.assert(total > 100, `the 23 circuitikz fixtures must yield more than 100 components in total, got ${total}`)

		console.log(`dispatch corpus: ${processed} files, ${total} components, ${failures.length} exceptions, ${malformed.length} malformed warnings`)
	}
}
