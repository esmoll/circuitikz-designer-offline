// Card 013 — preprocess/ctikzset.ts: global style into GlobalSettings.
// Unit checks for the applySettings stage. Runs automatically via `npm run test:import`.

export const id = "013"

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
	const { applySettings } = ctx.require("../.build/src/scripts/import/preprocess/ctikzset.js")

	// \usepackage options
	{
		const d = applySettings(makeDoc("\\usepackage[european, RPvoltages]{circuitikz}\n\\draw (0,0) to[R] (2,0);\n"))
		ctx.assert(d.settings.european === true, "european option must set settings.european")
		ctx.assert(d.settings.rpvoltages === true, "RPvoltages option must set settings.rpvoltages")
		ctx.assert(d.text === "\n\\draw (0,0) to[R] (2,0);\n", "consumed usepackage line is blanked, other text intact")
	}
	{
		const d = applySettings(makeDoc("\\usepackage{circuitikz}\n"))
		ctx.assert(d.settings.european === false && d.settings.rpvoltages === false, "no options — both stay false")
	}
	{
		const d = applySettings(makeDoc("\\usepackage{amsmath}\n\\usepackage{tikz}\n"))
		ctx.assert(d.settings.european === false, "non-circuitikz usepackage lines are not consumed")
		ctx.assert(d.text.includes("amsmath"), "other packages stay in the text")
	}

	// bipoles/length unit conversion
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/length=1.0cm}\n"))
		ctx.approx(d.settings.bipolesLength, 1.0, 1e-9)
		ctx.assert(d.warnings.length === 0, `clean ctikzset — no warnings, got ${JSON.stringify(d.warnings)}`)
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/length=10mm}\n"))
		ctx.approx(d.settings.bipolesLength, 1.0, 1e-9)
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/length=28.45274pt}\n"))
		ctx.approx(d.settings.bipolesLength, 28.45274 * (2.54 / 72.27), 1e-9)
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/length=0.5in}\n"))
		ctx.approx(d.settings.bipolesLength, 1.27, 1e-9)
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/length=1.2cm}\n\\ctikzset{bipoles/length=0.8cm}\n"))
		ctx.approx(d.settings.bipolesLength, 0.8, 1e-9, "last \\ctikzset wins")
	}

	// inductor style
	{
		const d = applySettings(makeDoc("\\ctikzset{inductor=american}\n"))
		ctx.assert(d.settings.inductorStyle === "american", "inductor=american recorded")
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{inductor=european}\n"))
		ctx.assert(d.settings.inductorStyle === "european", "inductor=european recorded")
	}
	ctx.assert(applySettings(makeDoc("\\ctikzset{bipoles/length=1cm}\n")).settings.inductorStyle === null, "no inductor key — style stays null")

	// unknown keys warn once per key per file; recognised colour keys stay silent
	{
		const d = applySettings(makeDoc("\\ctikzset{foo/bar=1}\n\\ctikzset{foo/bar=2}\n"))
		ctx.assert(d.warnings.length === 1, `duplicate unknown key warns once, got ${d.warnings.length}`)
		ctx.assert(d.warnings[0].text === "foo/bar", "warning names the key")
		ctx.assert(typeof d.warnings[0].line === "number" && d.warnings[0].line >= 1, "warning carries a line number")
		ctx.assert(d.warnings[0].reason.length > 0, "warning carries a reason")
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{foo/bar=1}\n\\ctikzset{other/key=2}\n"))
		ctx.assert(d.warnings.length === 2, `distinct unknown keys warn individually, got ${d.warnings.length}`)
	}
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/thickness=0.9}\n\\ctikzset{diodes/fill=ink}\n\\ctikzset{diodes/empty=bg}\n"))
		ctx.assert(d.warnings.length === 0, `bipoles/thickness is recognised and silent (review round), diodes colour keys silent, got ${JSON.stringify(d.warnings)}`)
	}

	// comma splitting outside braces and combined statements
	{
		const d = applySettings(makeDoc("\\ctikzset{bipoles/length=1.2cm, inductor=european}\n"))
		ctx.approx(d.settings.bipolesLength, 1.2, 1e-9)
		ctx.assert(d.settings.inductorStyle === "european", "comma-separated keys both applied")
		ctx.assert(d.warnings.length === 0, "combined statement is clean")
	}

	// tikzpicture options
	{
		const d = applySettings(makeDoc("\\begin{tikzpicture}[line width=1.0pt, color=ink, font=\\small]\n\\draw (0,0);\n\\end{tikzpicture}\n"))
		ctx.assert(d.settings.defaultLineWidth === "1.0pt", "line width kept as written")
		ctx.assert(d.settings.defaultColor === "ink", "colour recorded")
		ctx.assert(d.warnings.length === 0, "font and other tikz keys are silent")
		ctx.assert(d.text.startsWith("\n\\draw (0,0);"), "consumed begin line blanked, body kept")
	}
	{
		// cell.tex-style multiline options with nested braces
		const source = [
			"\\begin{tikzpicture}[",
			"  line width=1.0pt, color=ink, font=\\small,",
			"  block/.style={draw=ink, fill=light, rounded corners=2pt,",
			"                minimum height=1.05cm, inner sep=5pt, align=center},",
			"  >={Stealth}]",
			"  \\node[block] (a) {A};",
			"\\end{tikzpicture}",
			"",
		].join("\n")
		const d = applySettings(makeDoc(source))
		ctx.assert(d.settings.defaultLineWidth === "1.0pt", "multiline options: line width found")
		ctx.assert(d.settings.defaultColor === "ink", "multiline options: colour found")
		ctx.assert(d.warnings.length === 0, "multiline options: no spurious warnings")
		ctx.assert(d.text.split("\n").length === source.split("\n").length, "line count preserved")
		ctx.assert(d.text.includes("\\node[block] (a) {A};"), "body survives")
		ctx.assert(!d.text.includes("block/.style"), "multiline option block removed")
	}

	// malformed / unterminated statements are left alone
	{
		const source = "\\ctikzset{bipoles/length=1.0cm\n\\draw (0,0);\n"
		const d = applySettings(makeDoc(source))
		ctx.assert(d.text === source, "unterminated \\ctikzset stays untouched")
	}

	// statements are blanked by document position, not by the order the passes
	// run in: a \ctikzset placed after \begin{tikzpicture} must not shift the
	// earlier span and corrupt the body.
	{
		const source = [
			"\\begin{tikzpicture}[line width=1.0pt]",
			"  \\draw (0,0) to[R] (2,0);",
			"\\end{tikzpicture}",
			"\\ctikzset{bipoles/length=0.8cm}",
			"\\draw (3,0) to[R] (5,0);",
			"",
		].join("\n")
		const d = applySettings(makeDoc(source))
		ctx.approx(d.settings.bipolesLength, 0.8, 1e-9)
		ctx.assert(d.settings.defaultLineWidth === "1.0pt", "picture options still applied")
		ctx.assert(d.text === "\n  \\draw (0,0) to[R] (2,0);\n\\end{tikzpicture}\n\n\\draw (3,0) to[R] (5,0);\n", `out-of-order spans: body corrupted, got ${JSON.stringify(d.text)}`)
	}
}
