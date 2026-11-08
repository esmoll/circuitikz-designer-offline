// Card 012 — preprocess/foreach.ts: expand \foreach loops by text substitution.
// Unit checks for the expandForeach stage. Runs automatically via `npm run test:import`.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "012"

function makeDoc(source) {
	return {
		text: source,
		colors: {},
		settings: {
			european: false,
			rpvoltages: false,
			bipolesLength: 1.0,
			inductorStyle: null,
			defaultLineWidth: null,
			defaultColor: null,
		},
		warnings: [],
	}
}

export async function run(ctx) {
	const { expandForeach } = ctx.require("../.build/src/scripts/import/preprocess/foreach.js")

	const count = (text, sub) => text.split(sub).length - 1

	// checks 7-9 demand that the stage never throws; capture one so it can be asserted on
	const expandQuietly = (source) => {
		const doc = makeDoc(source)
		try {
			return { d: expandForeach(doc), threw: null }
		} catch (error) {
			return { d: doc, threw: error }
		}
	}

	// single variable, three items
	{
		const source = "\\foreach \\x in {1, 2, 3}{\\draw (\\x,0) -- (\\x,1);}\n"
		const d = expandForeach(makeDoc(source))
		ctx.assert(count(d.text, "\\draw") === 3, `three items must produce three \\draw statements, got ${count(d.text, "\\draw")}`)
		ctx.assert(d.text.includes("\\draw (1,0) -- (1,1);") && d.text.includes("\\draw (2,0) -- (2,1);") && d.text.includes("\\draw (3,0) -- (3,1);"), `values 1, 2 and 3 must be substituted in order, got ${JSON.stringify(d.text)}`)
		ctx.assert(!/\\x(?![a-zA-Z])/.test(d.text), "no \\x control word may remain after expansion")
		ctx.assert(!d.text.includes("\\foreach"), "the \\foreach construct itself must be gone")
		ctx.assert(!d.text.includes("{") && !d.text.includes("}"), "the body braces must be removed")
	}

	// three variables — the real vsi3ph.tex shape, math label kept verbatim
	{
		const source = [
			"\\foreach \\xc/\\yph/\\xoff in {3.2/3.2/3.9, 4.0/3.2/4.7}{",
			"  \\draw (\\xc,0) to[V, l=$V_1$] (\\xc,\\yph);",
			"  \\draw (\\xc,\\yph) to[D] (\\xoff,\\yph);",
			"}",
			"",
		].join("\n")
		const d = expandForeach(makeDoc(source))
		ctx.assert(count(d.text, "\\draw") === 4, `two items must produce two copies of the two-line body, got ${count(d.text, "\\draw")} \\draw statements`)
		ctx.assert(d.text.includes("to[V, l=$V_1$] (3.2,3.2)") && d.text.includes("to[D] (3.9,3.2)"), `first copy must carry item 3.2/3.2/3.9, got ${JSON.stringify(d.text)}`)
		ctx.assert(d.text.includes("(4.0,0)") && d.text.includes("to[D] (4.7,3.2)"), "second copy must carry item 4.0/3.2/4.7")
		ctx.assert(count(d.text, "l=$V_1$") === 2, `math label l=$V_1$ must stay intact in every copy, got ${count(d.text, "l=$V_1$")}`)
		ctx.assert(d.text.indexOf("(3.2,0)") < d.text.indexOf("(4.0,0)"), "copies must be concatenated in list order")
	}

	// prefix variable names — \x must not eat \xa, in either declaration order
	{
		const d = expandForeach(makeDoc("\\foreach \\x/\\xa in {1/2}{\\node at (\\x,\\xa){};}\n"))
		ctx.assert(d.text.includes("\\node at (1,2){};"), `both prefix variables must be substituted, got ${JSON.stringify(d.text)}`)
		ctx.assert(!/\\x(?![a-zA-Z])/.test(d.text) && !/\\xa(?![a-zA-Z])/.test(d.text), "no \\x or \\xa control word may remain")
		ctx.assert(!d.text.includes("2a") && !d.text.includes("1a"), "the shorter variable must not corrupt the longer one into 2a or 1a")
	}
	{
		const d = expandForeach(makeDoc("\\foreach \\xa/\\x in {2/1}{\\node at (\\x,\\xa){};}\n"))
		ctx.assert(d.text.includes("\\node at (1,2){};"), `swapped declaration order must keep the mapping \\xa=2, \\x=1, got ${JSON.stringify(d.text)}`)
		ctx.assert(!d.text.includes("2a") && !d.text.includes("1a"), "\\xa must never degrade into 2a")
	}

	// integer range item
	{
		const d = expandForeach(makeDoc("\\foreach \\x in {1,...,3}{\\draw (\\x,0);}\n"))
		ctx.assert(count(d.text, "\\draw") === 3, `range 1,...,3 must expand to three copies, got ${count(d.text, "\\draw")}`)
		ctx.assert(d.text.includes("\\draw (1,0);") && d.text.includes("\\draw (2,0);") && d.text.includes("\\draw (3,0);"), `range values 1, 2 and 3 must be substituted, got ${JSON.stringify(d.text)}`)
		ctx.assert(!d.text.includes("\\foreach"), "the range loop construct must be gone")
	}

	// non-integer range — whole loop stays, one warning
	{
		const source = "\\foreach \\x in {0.5,...,3.5}{\\draw (\\x,0);}\n"
		const d = expandForeach(makeDoc(source))
		ctx.assert(d.text === source, "a non-integer range must leave the whole loop unexpanded")
		ctx.assert(d.warnings.length === 1, `exactly one warning for a non-integer range, got ${d.warnings.length}`)
	}

	// arity mismatch — short item skipped with one warning, rest still expanded
	{
		const d = expandForeach(makeDoc("\\foreach \\a/\\b in {1/2, 9}{\\draw (\\a,\\b);}\n"))
		ctx.assert(d.warnings.length === 1, `exactly one warning for the arity mismatch, got ${d.warnings.length}`)
		ctx.assert(d.text.includes("\\draw (1,2);"), `item 1/2 must still expand, got ${JSON.stringify(d.text)}`)
		ctx.assert(!d.text.includes("9"), "the short item 9 must be skipped")
		ctx.assert(!/\\a(?![a-zA-Z])/.test(d.text) && !/\\b(?![a-zA-Z])/.test(d.text), "no \\a or \\b may remain in the expanded part")
	}

	// unterminated \foreach — untouched, one warning, no throw
	{
		const source = "\\foreach \\x in {1,2}{\\draw (\\x,0) -- (\\x,1);"
		const { d, threw } = expandQuietly(source)
		ctx.assert(threw === null, `unterminated \\foreach must not throw, got ${threw}`)
		ctx.assert(d.text === source, "unterminated \\foreach must leave the text untouched")
		ctx.assert(d.warnings.length === 1, `exactly one warning for the unterminated loop, got ${d.warnings.length}`)
	}

	// malformed \foreach (missing "in") — untouched, one warning, no throw
	{
		const source = "\\foreach \\x {1,2}{\\draw (\\x,0);}\n"
		const { d, threw } = expandQuietly(source)
		ctx.assert(threw === null, `malformed \\foreach must not throw, got ${threw}`)
		ctx.assert(d.text === source, "a \\foreach without an `in` keyword must leave the text untouched")
		ctx.assert(d.warnings.length === 1, `exactly one warning for the malformed loop, got ${d.warnings.length}`)
	}

	// nested \foreach inside the body — out of scope, untouched, one warning, no throw
	{
		const source = "\\foreach \\x in {1,2}{\\foreach \\y in {3,4}{\\draw (\\x,\\y);}}\n"
		const { d, threw } = expandQuietly(source)
		ctx.assert(threw === null, `nested \\foreach must not throw, got ${threw}`)
		ctx.assert(d.text === source, "a nested loop must be left unexpanded")
		ctx.assert(d.warnings.length === 1, `exactly one warning for the nested loop, got ${d.warnings.length}`)
	}

	// body brace styles — adjacent and spaced
	{
		const d = expandForeach(makeDoc("\\foreach \\a in {1}{\\draw (\\a,0);}\\foreach \\b in {2} {\\draw (\\b,1);}\n"))
		ctx.assert(d.text.includes("\\draw (1,0);"), `the loop with an adjacent body brace must expand, got ${JSON.stringify(d.text)}`)
		ctx.assert(d.text.includes("\\draw (2,1);"), "the loop with a spaced body brace must expand")
		ctx.assert(!d.text.includes("\\foreach"), "both loops must be gone after one pass")
		ctx.assert(!/\\a(?![a-zA-Z])/.test(d.text) && !/\\b(?![a-zA-Z])/.test(d.text), "no \\a or \\b may remain")
	}

	// line count may grow — exactly one approximation note when it does
	{
		const source = "\\foreach \\x in {1, 2, 3, 4}{\n  \\draw (\\x,0);\n  \\draw (\\x,1);}\n\\draw (9,9);\n"
		const d = expandForeach(makeDoc(source))
		ctx.assert(d.text.split("\n").length > source.split("\n").length, "a multi-line body with more items than construct lines must grow the line count")
		ctx.assert(count(d.text, "\\draw") === 9, `four items must produce eight loop \\draw copies plus the outer one, got ${count(d.text, "\\draw")}`)
		ctx.assert(!d.text.includes("\\foreach"), "the construct must be fully consumed")
		ctx.assert(d.warnings.length === 1, `exactly one note for the changed line count, got ${d.warnings.length}`)
		ctx.assert(/approx/i.test((d.warnings[0] || {}).reason || ""), `the note must mention approximate line numbers, got ${JSON.stringify((d.warnings[0] || {}).reason)}`)
	}

	// no \foreach — a no-op document stays completely clean
	{
		const source = "\\draw (0,0) to[R] (2,0);\n\\node[circ] at (1,1) {};\n"
		const d = expandForeach(makeDoc(source))
		ctx.assert(d.text === source, "a document without \\foreach must come back unchanged")
		ctx.assert(d.warnings.length === 0, `a no-op document must add no warnings, got ${JSON.stringify(d.warnings)}`)
	}

	// single-line loop, line count equal — no note
	{
		const source = "\\foreach \\x in {7}{\\draw (\\x,0);}\n"
		const d = expandForeach(makeDoc(source))
		ctx.assert(d.text === "\\draw (7,0);\n", `a one-item one-line loop must expand in place, got ${JSON.stringify(d.text)}`)
		ctx.assert(d.text.split("\n").length === source.split("\n").length, "the line count must stay equal")
		ctx.assert(d.warnings.length === 0, `no note when the line count is unchanged, got ${JSON.stringify(d.warnings)}`)
	}

	// two independent loops expand in one pass, in document order
	{
		const source = "\\foreach \\a in {1, 2}{\\draw (\\a,0) to[R] (\\a,1);}\n\\foreach \\b in {3, 4}{\\draw (\\b,2) to[C] (\\b,3);}\n"
		const d = expandForeach(makeDoc(source))
		ctx.assert(count(d.text, "to[R]") === 2 && count(d.text, "to[C]") === 2, `both loops must expand in one pass, got ${JSON.stringify(d.text)}`)
		ctx.assert(d.text.includes("\\draw (1,0) to[R] (1,1);") && d.text.includes("\\draw (2,0) to[R] (2,1);"), "the first loop must substitute 1 and 2")
		ctx.assert(d.text.includes("\\draw (3,2) to[C] (3,3);") && d.text.includes("\\draw (4,2) to[C] (4,3);"), "the second loop must substitute 3 and 4")
		ctx.assert(d.text.indexOf("to[R]") < d.text.indexOf("to[C]"), "the loops must appear in document order")
		ctx.assert(!d.text.includes("\\foreach"), "the \\foreach constructs must be gone")
	}

	// fixture sweep — every corpus file must pass through the stage safely
	{
		const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "fixtures", "tex")
		const names = fs
			.readdirSync(fixturesDir)
			.filter((name) => name.endsWith(".tex"))
			.sort()
		ctx.assert(names.length > 0, `fixture directory not found or empty: ${fixturesDir}`)
		for (const name of names) {
			const source = fs.readFileSync(path.join(fixturesDir, name), "utf8")
			const d = expandForeach(makeDoc(source))
			const varWords = [...source.matchAll(/\\foreach\s+((?:\\[a-zA-Z]+(?:\/\s*)?)+)/g)]
				.flatMap((match) => match[1].split("/"))
				.map((word) => word.trim())
				.filter((word) => word.startsWith("\\"))
				.map((word) => word.slice(1))
			if (varWords.length > 0) {
				for (const word of varWords) {
					const survivor = new RegExp("\\\\" + word + "(?![a-zA-Z])")
					ctx.assert(!survivor.test(d.text), `${name}: loop variable \\${word} must not survive expansion`)
				}
			} else {
				ctx.assert(d.text === source, `${name}: without \\foreach the text must come back unchanged`)
			}
			for (const warning of d.warnings) {
				ctx.assert(typeof warning.line === "number" && warning.line >= 1, `${name}: warning line must be a number >= 1`)
				ctx.assert(typeof warning.text === "string" && warning.text.length > 0, `${name}: warning text must be non-empty`)
				ctx.assert(typeof warning.reason === "string" && warning.reason.length > 0, `${name}: warning reason must be non-empty`)
			}
		}
	}
}
