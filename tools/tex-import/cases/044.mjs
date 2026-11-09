/**
 * Card 044 - commands/textNodes.ts
 *
 * Standalone `\node[..] at (x,y) {text}`: the corpus shapes from `buck.tex`, the
 * resolver chain (absolute and calc), the anchor table (single- and multi-word
 * TikZ names, plus the once-per-file warning for an unknown one), the dropped
 * `text=<colour>`, TeX sizing-wrapper removal, `\\` to newline, and the
 * disjointness with the pole handler from card 043.
 */

export const id = "044"

export async function run(ctx) {
	const { textNodeHandler } = ctx.require("./../.build/src/scripts/import/commands/textNodes.js")
	const { circleHandler } = ctx.require("./../.build/src/scripts/import/commands/circles.js")
	const { PX_PER_CM } = ctx.require("./../.build/src/scripts/import/coords/absolute.js")

	const makeCtx = () => ({
		settings: {
			european: false,
			rpvoltages: false,
			bipolesLength: 1,
			inductorStyle: null,
			defaultLineWidth: null,
			defaultColor: null,
		},
		colors: {},
		coords: { named: new Map(), anchors: null, lastPoint: null, bipolesLength: 1 },
		report: [],
	})

	const cmd = (options, arguments_, line = 1, kind = "node") => ({
		kind,
		options,
		arguments: arguments_,
		line,
		source: "\\node[" + options + "]" + arguments_ + ";",
	})

	const countReason = (report, reason) => report.filter((warning) => warning.reason === reason).length

	const colourReason = "label colour of text node (text=) not imported"
	const anchorReason = "anchor of text node not known"
	const positionReason = "position of text node not resolvable"

	const expectNode = (components, why) => {
		ctx.assert(components.length === 1, `${why}: expected 1 component, got ${components.length}`)
		const component = components[0]
		ctx.assert(component.type === "node", `${why}: type ${JSON.stringify(component.type)}, expected "node"`)
		ctx.assert(component.label !== undefined, `${why}: component has no label`)
		return component
	}

	// --- buck.tex: the canonical shape ------------------------------------
	{
		const build = makeCtx()
		const statement = cmd("anchor=east, text=grp", " at (0.0,2.4) {$V_{in}$}", 7)
		ctx.assert(textNodeHandler.canHandle(statement), "`\\node[anchor=east, text=grp] at (0.0,2.4) {$V_{in}$};` must be handled")

		const component = expectNode(textNodeHandler.handle(statement, build), "buck.tex text node")
		ctx.approx(component.position.x, 0, 1e-9)
		ctx.approx(component.position.y, -2.4 * PX_PER_CM, 1e-9)
		ctx.approx(component.position.y, -90.70866, 1e-4)
		ctx.assert(component.label.value === "$V_{in}$", `label ${JSON.stringify(component.label.value)}, expected "$V_{in}$"`)
		ctx.assert(component.label.anchor === "east", `anchor ${JSON.stringify(component.label.anchor)}, expected "east"`)

		// exactly one warning, and it is about text=grp
		ctx.assert(build.report.length === 1, `expected exactly one warning, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].reason === colourReason, `reason ${JSON.stringify(build.report[0].reason)}`)
		ctx.assert(/text=/.test(build.report[0].reason), "the colour warning must mention text=")
		ctx.assert(build.report[0].line === 7, `warning line ${build.report[0].line}, expected 7`)

		// the resolved position is committed, as TikZ would use it for `+`
		ctx.approx(build.coords.lastPoint.x, 0)
		ctx.approx(build.coords.lastPoint.y, 2.4)
	}

	// --- calc coordinates: $(L1)+(0,0.35)$ ---------------------------------
	{
		const build = makeCtx()
		build.coords.named.set("L1", { x: 1, y: 1 })
		const statement = cmd("above", " at ($(L1)+(0,0.35)$) {$L_1$}", 8)
		ctx.assert(textNodeHandler.canHandle(statement), "`\\node[above] at ($(L1)+(0,0.35)$) {$L_1$};` must be handled")

		const component = expectNode(textNodeHandler.handle(statement, build), "calc text node")
		ctx.approx(component.position.x, PX_PER_CM, 1e-9)
		ctx.approx(component.position.y, -1.35 * PX_PER_CM, 1e-9)
		ctx.assert(component.label.value === "$L_1$", `label ${JSON.stringify(component.label.value)}`)
		ctx.assert(component.label.anchor === "north", `[above] must map to "north", got ${JSON.stringify(component.label.anchor)}`)
		ctx.assert(build.report.length === 0, `calc text node must not warn, got ${JSON.stringify(build.report)}`)
		ctx.approx(build.coords.lastPoint.y, 1.35)
	}

	// --- anchors: single-word, multi-word, explicit `anchor=` --------------
	{
		const cases = [
			["above left", "northwest"],
			["below right", "southeast"],
			["above right", "northeast"],
			["below left", "southwest"],
			["left", "west"],
			["right", "east"],
			["below", "south"],
			["anchor=north east", "northeast"],
			["anchor=south west", "southwest"],
			["anchor=center", "center"],
			["anchor=South", "south"],
			["anchor={above left}", "northwest"],
		]

		for (const [options, expected] of cases) {
			const build = makeCtx()
			const component = expectNode(textNodeHandler.handle(cmd(options, " at (1,1) {$+$}"), build), `anchor ${options}`)
			ctx.assert(
				component.label.anchor === expected,
				`${options}: anchor ${JSON.stringify(component.label.anchor)}, expected ${JSON.stringify(expected)}`
			)
			ctx.assert(build.report.length === 0, `${options} must not warn, got ${JSON.stringify(build.report)}`)
		}

		// a bare direction never beats an explicit anchor
		const build = makeCtx()
		const component = expectNode(textNodeHandler.handle(cmd("above, anchor=west", " at (0,0) {$a$}"), build), "anchor precedence")
		ctx.assert(component.label.anchor === "west", `explicit anchor must win, got ${JSON.stringify(component.label.anchor)}`)
	}

	// --- unknown anchor: undefined anchor, one warning per file -----------
	{
		const build = makeCtx()
		const component = expectNode(textNodeHandler.handle(cmd("anchor=text", " at (1,1) {$a$}", 9), build), "unknown anchor")
		ctx.assert(component.label.anchor === undefined, `unknown anchor must stay undefined, got ${JSON.stringify(component.label.anchor)}`)
		ctx.assert(countReason(build.report, anchorReason) === 1, `expected one anchor warning, got ${JSON.stringify(build.report)}`)

		// a second, different unknown anchor in the same file must not repeat it
		textNodeHandler.handle(cmd("anchor=base", " at (2,1) {$b$}", 10), build)
		textNodeHandler.handle(cmd("above left, anchor=foo", " at (3,1) {$c$}", 11), build)
		ctx.assert(
			countReason(build.report, anchorReason) === 1,
			`anchor warning must appear once per file, got ${countReason(build.report, anchorReason)}`
		)
		ctx.assert(build.report.length === 1, `unexpected extra warnings: ${JSON.stringify(build.report)}`)
	}

	// --- text=<colour>: once per file, never a failure ---------------------
	{
		const build = makeCtx()
		const first = expectNode(textNodeHandler.handle(cmd("text=grp", " at (0,0) {$a$}", 4), build), "text=grp")
		ctx.assert(first.label.value === "$a$", "the text must survive the dropped colour")
		textNodeHandler.handle(cmd("anchor=east, text=red", " at (1,0) {$b$}", 5), build)
		ctx.assert(
			countReason(build.report, colourReason) === 1,
			`colour warning must appear once per file, got ${countReason(build.report, colourReason)}`
		)
		ctx.assert(build.report.length === 1, `unexpected extra warnings: ${JSON.stringify(build.report)}`)
	}

	// --- TeX sizing wrappers and `\\` line breaks -------------------------
	{
		const build = makeCtx()
		const statement = cmd("align=center", String.raw`at (2,3) {\footnotesize $50\%$\\duty}`, 12)
		const component = expectNode(textNodeHandler.handle(statement, build), "footnotesize + line break")
		const expected = String.raw`$50\%$` + "\n" + "duty"
		ctx.assert(component.label.value === expected, `label ${JSON.stringify(component.label.value)}, expected ${JSON.stringify(expected)}`)
		ctx.assert(build.report.length === 0, `align=center must not warn, got ${JSON.stringify(build.report)}`)
	}
	{
		const build = makeCtx()
		const component = expectNode(
			textNodeHandler.handle(cmd("", String.raw`at (0,0) {\small $a$\strut}`, 13), build),
			"small + strut"
		)
		ctx.assert(component.label.value === "$a$", `label ${JSON.stringify(component.label.value)}, expected "$a$"`)
	}
	{
		const build = makeCtx()
		const component = expectNode(
			textNodeHandler.handle(cmd("", String.raw`at (0,0) {\scriptsize $b$\\[1ex]$c$}`, 14), build),
			"scriptsize + line break with skip"
		)
		ctx.assert(
			component.label.value === "$b$\n$c$",
			`label ${JSON.stringify(component.label.value)}, expected "$b$\\n$c$"`
		)
	}
	{
		// inner braces and single-backslash commands survive untouched
		const build = makeCtx()
		const component = expectNode(
			textNodeHandler.handle(cmd("", String.raw`at (0,0) {$\frac{a}{b}$ 50\%}`, 15), build),
			"math with inner braces"
		)
		ctx.assert(
			component.label.value === String.raw`$\frac{a}{b}$ 50\%`,
			`label ${JSON.stringify(component.label.value)}`
		)
	}

	// --- a coordinate inside the label is not the position ----------------
	{
		const build = makeCtx()
		const component = expectNode(
			textNodeHandler.handle(cmd("above", " at (1,1) {$f(0,0)$}", 16), build),
			"coordinate-looking label text"
		)
		ctx.approx(component.position.x, PX_PER_CM, 1e-9)
		ctx.approx(component.position.y, -PX_PER_CM, 1e-9)
		ctx.assert(component.label.value === "$f(0,0)$", `label ${JSON.stringify(component.label.value)}`)
	}

	// --- disjointness with card 043 ---------------------------------------
	{
		const build = makeCtx()
		const pole = cmd("circ", " at (1,1){}")
		ctx.assert(!textNodeHandler.canHandle(pole), "`\\node[circ] at (1,1){}` must not be handled here")
		ctx.assert(circleHandler.canHandle(pole), "`\\node[circ] at (1,1){}` belongs to card 043")
		ctx.assert(textNodeHandler.handle(pole, build).length === 0, "a pole must emit nothing here")
		ctx.assert(build.report.length === 0, `a rejected pole must not warn, got ${JSON.stringify(build.report)}`)

		const namedPole = cmd("ocirc, name=o1", " at (2,1){}")
		ctx.assert(!textNodeHandler.canHandle(namedPole), "a pole with extra options still belongs to card 043")
		ctx.assert(circleHandler.canHandle(namedPole), "circles must claim `\\node[ocirc, name=o1] at (2,1){}`")

		// a pole shape carrying text is out of scope for 043 and becomes text
		const labelledPole = cmd("circ", " at (0,0){$+$}")
		ctx.assert(!circleHandler.canHandle(labelledPole), "circles leaves a labelled node alone")
		ctx.assert(textNodeHandler.canHandle(labelledPole), "a labelled pole becomes a text node here")
		const component = expectNode(textNodeHandler.handle(labelledPole, build), "labelled pole")
		ctx.assert(component.label.value === "$+$", `label ${JSON.stringify(component.label.value)}`)
	}

	// --- nothing to place --------------------------------------------------
	{
		const build = makeCtx()

		// no `at` -> cards 045 own path labels, standalone text needs a position
		const noPosition = cmd("above", " {$+$}")
		ctx.assert(!textNodeHandler.canHandle(noPosition), "a node without `at` has no position to place the text at")
		ctx.assert(textNodeHandler.handle(noPosition, build).length === 0, "a node without `at` must emit nothing")

		// empty text
		const empty = cmd("above", " at (1,1){}")
		ctx.assert(textNodeHandler.handle(empty, build).length === 0, "empty text must emit nothing")

		// empty text and no `at`: the pole-marker spelling
		const marker = cmd("", "{}")
		ctx.assert(!textNodeHandler.canHandle(marker), "`\\node{}` must not be handled here")
		ctx.assert(textNodeHandler.handle(marker, build).length === 0, "`\\node{}` must emit nothing")

		ctx.assert(build.report.length === 0, `empty nodes must not warn, got ${JSON.stringify(build.report)}`)
	}

	// --- unresolvable `at`: [] plus one warning, never a throw ------------
	{
		const build = makeCtx()
		const statement = cmd("above", String.raw` at (\xc,4.6) {$x$}`, 23)
		ctx.assert(textNodeHandler.canHandle(statement), "the position is missing, not the text")
		const components = textNodeHandler.handle(statement, build)
		ctx.assert(components.length === 0, `unresolvable at must emit nothing, got ${components.length}`)
		ctx.assert(countReason(build.report, positionReason) === 1, `expected one position warning, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].line === 23, `warning line ${build.report[0].line}, expected 23`)

		// an unknown relative coordinate is unresolvable too
		const relative = cmd("above", " at (++(0,1)) {$y$}", 24)
		ctx.assert(textNodeHandler.handle(relative, build).length === 0, "a relative move without a current point must emit nothing")
		ctx.assert(countReason(build.report, positionReason) === 2, `expected a second position warning, got ${JSON.stringify(build.report)}`)
	}

	// --- malformed input must not throw ------------------------------------
	{
		const build = makeCtx()
		for (const arguments_ of ["", "(", "at", "at (", "at (0,0)", "{}", "at (0,0){{}", "at (0,0) {$a$}"]) {
			for (const options of ["", "above", "anchor=", "circ", "text=grp"]) {
				const statement = cmd(options, arguments_)
				textNodeHandler.canHandle(statement) // must never throw
				const out = textNodeHandler.handle(statement, build)
				ctx.assert(Array.isArray(out), `handle must return an array for ${JSON.stringify([options, arguments_])}`)
			}
		}

		ctx.assert(!textNodeHandler.canHandle(null), "a null command must not throw")
		ctx.assert(textNodeHandler.handle(null, build).length === 0, "a null command must emit nothing")
		ctx.assert(!textNodeHandler.canHandle(cmd("above", " at (0,0) {$a$}", 1, "draw")), "kind draw is card 041/042 territory")
		ctx.assert(!textNodeHandler.canHandle(cmd("above", " at (0,0) {$a$}", 1, "unknown")), "kind unknown is out of scope")
		ctx.assert(textNodeHandler.handle(cmd("above", " at (0,0) {$a$}", 1, "draw"), build).length === 0, "a draw must emit nothing here")
	}

	// --- review round: bare sub-node anchors and text= colours ---
	{
		// (VS.G) reaches resolveAnchor once it sits in the chain; the named map
		// holds the component point, the anchor resolver knows the symbol pin.
		const bc = makeCtx()
		bc.coords.named.set("VS", { x: 1, y: 0 })
		bc.coords.anchors = { resolve: (node, anchor) => (node === "VS" && anchor === "G" ? { x: 1.2, y: 0.3 } : null) }
		const out = textNodeHandler.handle(cmd("anchor=west", "at (VS.G) {УЭ}"), bc)
		ctx.assert(out.length === 1, `(VS.G): expected 1 text node, got ${out.length}`)
		ctx.approx(out[0].position.x, 1.2 * PX_PER_CM, 1e-6)
		ctx.approx(out[0].position.y, -0.3 * PX_PER_CM, 1e-6)
		ctx.assert(bc.report.length === 0, `(VS.G): no warning expected, got ${JSON.stringify(bc.report)}`)
	}
	{
		// a dotted anchor with no resolver degrades to the component centre
		const bc = makeCtx()
		bc.coords.named.set("VS", { x: 1, y: 0 })
		const out = textNodeHandler.handle(cmd("anchor=west", "at (VS.G) {УЭ}"), bc)
		ctx.assert(out.length === 1, `(VS.G) without anchors: expected 1 text node, got ${out.length}`)
		ctx.approx(out[0].position.x, PX_PER_CM, 1e-6)
		ctx.approx(out[0].position.y, 0, 1e-6)
	}
	{
		// text=grp with a known named colour maps onto label.color, no warning
		const bc = makeCtx()
		bc.colors = { grp: "#2e6e8c", ink: "#1f2a33" }
		const out = textNodeHandler.handle(cmd("anchor=west, text=grp", "at (1,1) {$x$}"), bc)
		ctx.assert(out.length === 1, `known text colour: expected 1 node, got ${out.length}`)
		ctx.assert(out[0].label.color === "#2e6e8c", `known text colour must set label.color, got ${JSON.stringify(out[0].label)}`)
		ctx.assert(bc.report.length === 0, `known text colour: no warning expected, got ${JSON.stringify(bc.report)}`)
	}
	{
		// an unknown colour name keeps the once-per-file warning
		const bc = makeCtx()
		const out = textNodeHandler.handle(cmd("anchor=west, text=grp", "at (1,1) {$x$}"), bc)
		ctx.assert(out.length === 1, `unknown text colour: expected 1 node, got ${out.length}`)
		ctx.assert(out[0].label.color === undefined, `unknown text colour must not set label.color, got ${JSON.stringify(out[0].label)}`)
		ctx.assert(bc.report.length === 1 && bc.report[0].reason.startsWith("label colour"), `unknown text colour: expected the colour warning, got ${JSON.stringify(bc.report)}`)
	}
}
