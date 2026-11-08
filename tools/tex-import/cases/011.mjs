/**
 * Card 011 - preprocess/colors.ts
 *
 * Unit checks for `\definecolor` collection. The stage is a leaf, so it is
 * loaded straight from the compiled tree instead of through the `index.js`
 * facade (card 052).
 */

export const id = "011"

export async function run(ctx) {
	const { collectColors } = ctx.require("./../.build/src/scripts/import/preprocess/colors.js")

	const makeDoc = (text, colors = {}) => ({
		text,
		colors: { ...colors },
		settings: {
			european: false,
			rpvoltages: false,
			bipolesLength: 1,
			inductorStyle: null,
			defaultLineWidth: null,
			defaultColor: null,
		},
		warnings: [],
	})

	const lineCount = (text) => text.split("\n").length

	const expectColor = (text, name, css, why) => {
		const doc = collectColors(makeDoc(text))
		ctx.assert(doc.colors[name] === css, `${why}: expected ${name}=${css}, got ${JSON.stringify(doc.colors[name])}`)
		ctx.assert(!/\\definecolor/.test(doc.text), `${why}: the declaration must be removed from the text, got ${JSON.stringify(doc.text)}`)
		return doc
	}

	// --- the fixture table from the card ---------------------------------
	const rgb = expectColor("\\definecolor{ink}{RGB}{31,42,51}", "ink", "#1f2a33", "RGB")
	ctx.assert(lineCount(rgb.text) === 1, "RGB: blanking must not drop lines")

	expectColor("\\definecolor{grp}{HTML}{1F2A33}", "grp", "#1f2a33", "HTML")

	// rgb floats are rounded per channel: 0.122*255=31.11 -> 31,
	// 0.165*255=42.075 -> 42, 0.2*255=51 -> 51.
	expectColor("\\definecolor{acc}{rgb}{0.122,0.165,0.2}", "acc", "#1f2a33", "rgb")

	// gray replicates the single channel: 0.5*255=127.5 -> 128 = 0x80.
	expectColor("\\definecolor{mid}{gray}{0.5}", "mid", "#808080", "gray")
	expectColor("\\definecolor{black}{gray}{0}", "black", "#000000", "gray 0")
	expectColor("\\definecolor{white}{gray}{1}", "white", "#ffffff", "gray 1")

	// --- merging ----------------------------------------------------------
	const merged = collectColors(makeDoc("\\definecolor{ink}{RGB}{31,42,51}", { old: "#abcdef" }))
	ctx.assert(merged.colors.old === "#abcdef", "merge: earlier colours must survive")
	ctx.assert(merged.colors.ink === "#1f2a33", "merge: the new colour must be added")
	ctx.assert(Object.keys(merged.colors).length === 2, `merge: expected 2 colours, got ${JSON.stringify(merged.colors)}`)

	const overridden = collectColors(makeDoc("\\definecolor{ink}{RGB}{255,255,255}", { ink: "#000000" }))
	ctx.assert(overridden.colors.ink === "#ffffff", "merge: a later definition of the same name must win")

	// The stage is a pure transformation: the caller's document is untouched.
	const input = makeDoc("\\definecolor{ink}{RGB}{31,42,51}", { old: "#abcdef" })
	const snapshot = JSON.stringify(input)
	collectColors(input)
	ctx.assert(JSON.stringify(input) === snapshot, "the input document must not be mutated")

	// --- tolerant syntax ---------------------------------------------------
	const spaced = expectColor("\\definecolor { ink } { RGB } { 31 , 42 , 51 }", "ink", "#1f2a33", "whitespace")
	ctx.assert(typeof spaced.colors.ink === "string", "whitespace: colour missing")

	const lower = expectColor("\\definecolor{ink}{RGB}{31,42,51}\\definecolor{grp}{gray}{0.2}", "ink", "#1f2a33", "two on one line")
	ctx.assert(lower.colors.grp === "#333333", `two on one line: expected grp=#333333, got ${JSON.stringify(lower.colors)}`)

	const hash = expectColor("\\definecolor{grp}{HTML}{#1f2a33}", "grp", "#1f2a33", "HTML with a leading #")
	ctx.assert(hash.colors.grp === "#1f2a33", "HTML with a leading #")

	// Text around the declaration is preserved.
	const withText = collectColors(makeDoc("\\draw (0,0); \\definecolor{ink}{RGB}{31,42,51} \\draw (1,0);"))
	ctx.assert(withText.text.includes("\\draw (0,0);"), `surrounding text lost: ${JSON.stringify(withText.text)}`)
	ctx.assert(withText.text.includes("\\draw (1,0);"), `surrounding text lost: ${JSON.stringify(withText.text)}`)

	// A multi-line declaration keeps its lines so later line numbers stay right.
	const multi = collectColors(makeDoc("a\n\\definecolor{ink}\n  {RGB}\n  {31,42,51}\nb"))
	ctx.assert(multi.colors.ink === "#1f2a33", `multi-line: got ${JSON.stringify(multi.colors)}`)
	ctx.assert(lineCount(multi.text) === 5, `multi-line: expected 5 lines, got ${lineCount(multi.text)}`)
	ctx.assert(multi.text.split("\n")[0] === "a", "multi-line: first line moved")
	ctx.assert(multi.text.split("\n")[4] === "b", "multi-line: last line moved")

	// --- warnings, never throws -------------------------------------------
	const unsupported = collectColors(makeDoc("\\definecolor{bad}{CMYK}{0,0,0,1}\n\\definecolor{ink}{RGB}{31,42,51}"))
	ctx.assert(unsupported.warnings.length === 1, `unknown model: expected 1 warning, got ${JSON.stringify(unsupported.warnings)}`)
	ctx.assert(unsupported.warnings[0].line === 1, `unknown model: warning must be on line 1, got ${unsupported.warnings[0].line}`)
	ctx.assert(/CMYK/.test(unsupported.warnings[0].text), `unknown model: warning text should quote the declaration, got ${JSON.stringify(unsupported.warnings[0])}`)
	ctx.assert(unsupported.colors.bad === undefined, "unknown model: the colour must not be collected")
	ctx.assert(unsupported.colors.ink === "#1f2a33", "unknown model: later colours must still be collected")
	ctx.assert(!/CMYK/.test(unsupported.text), "unknown model: the declaration must still be removed from the text")

	const cases = [
		["\\definecolor{x}{RGB}{256,0,0}", "out-of-range RGB"],
		["\\definecolor{x}{RGB}{31,42}", "too few RGB channels"],
		["\\definecolor{x}{RGB}{31.5,42,51}", "non-integer RGB channel"],
		["\\definecolor{x}{rgb}{1.5,0,0}", "out-of-range rgb channel"],
		["\\definecolor{x}{gray}{2}", "out-of-range gray"],
		["\\definecolor{x}{HTML}{1F2A3}", "short HTML"],
		["\\definecolor{x}{HTML}{1F2A33FF}", "long HTML"],
		["\\definecolor{}{RGB}{31,42,51}", "empty colour name"],
	]
	for (const [source, why] of cases) {
		const doc = collectColors(makeDoc(source))
		ctx.assert(doc.warnings.length === 1, `${why}: expected 1 warning, got ${JSON.stringify(doc.warnings)}`)
		ctx.assert(Object.keys(doc.colors).length === 0, `${why}: no colour should be collected, got ${JSON.stringify(doc.colors)}`)
	}

	// An unterminated declaration warns and is left in place rather than
	// swallowing the rest of the document.
	const unterminated = collectColors(makeDoc("\\definecolor{ink}{RGB}{31,42,51\n\\draw (0,0);"))
	ctx.assert(unterminated.warnings.length === 1, `unterminated: expected 1 warning, got ${JSON.stringify(unterminated.warnings)}`)
	ctx.assert(unterminated.text.includes("\\draw (0,0);"), "unterminated: the rest of the document must survive")
	ctx.assert(Object.keys(unterminated.colors).length === 0, "unterminated: no colour should be collected")

	// A macro whose name merely starts with \definecolor is not a declaration.
	const lookalike = collectColors(makeDoc("\\definecolorx{y}{RGB}{1,2,3}"))
	ctx.assert(lookalike.warnings.length === 0, `lookalike: expected no warnings, got ${JSON.stringify(lookalike.warnings)}`)
	ctx.assert(lookalike.text === "\\definecolorx{y}{RGB}{1,2,3}", "lookalike: the text must be untouched")

	// Warnings of earlier stages are preserved, and the new one is appended.
	const earlier = makeDoc("\\definecolor{x}{CMYK}{0,0,0,1}")
	earlier.warnings.push({ line: 9, text: "earlier", reason: "kept" })
	const appended = collectColors(earlier)
	ctx.assert(appended.warnings.length === 2, `warnings: expected 2, got ${JSON.stringify(appended.warnings)}`)
	ctx.assert(appended.warnings[0].reason === "kept", "warnings: the earlier warning must come first")
}