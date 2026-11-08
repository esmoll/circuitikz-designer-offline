/**
 * Card 042 - commands/bipoles.ts
 *
 * `to[SYM, ...]` inside a `\draw`: symbol resolution (short keys, full names,
 * the trailing `*` style marker), poles, `name=` registration plus the
 * `setSymbol` hook, the two-point output, and the skip-with-warning paths.
 * A corpus sweep over `tests/fixtures/tex` counts `to` elements against the
 * components the handler actually emits.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "042"

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "fixtures", "tex")

/** Warning reasons the handler owns, spelled as in the module. */
const UNKNOWN_PREFIX = "unknown symbol "
const NO_COORDINATES = "to element without start or end coordinate"

export async function run(ctx) {
	const { bipoleHandler } = ctx.require("./../.build/src/scripts/import/commands/bipoles.js")
	const { PX_PER_CM } = ctx.require("./../.build/src/scripts/import/coords/absolute.js")
	const { resolveNamed } = ctx.require("./../.build/src/scripts/import/coords/named.js")
	const { makeAnchorResolver } = ctx.require("./../.build/src/scripts/import/coords/anchors.js")
	const { splitPath } = ctx.require("./../.build/src/scripts/import/scanner/statements.js")
	const { tokenize } = ctx.require("./../.build/src/scripts/import/scanner/lexer.js")
	const { stripComments } = ctx.require("./../.build/src/scripts/import/preprocess/comments.js")
	const { expandForeach } = ctx.require("./../.build/src/scripts/import/preprocess/foreach.js")

	const settings = (overrides = {}) => ({
		european: true,
		rpvoltages: false,
		bipolesLength: 1,
		inductorStyle: null,
		defaultLineWidth: null,
		defaultColor: null,
		...overrides,
	})

	const makeCtx = (overrides) => ({
		settings: settings(overrides),
		colors: {},
		coords: { named: new Map(), anchors: null, lastPoint: null, bipolesLength: 1 },
		report: [],
	})

	const cmd = (cargs, line = 1) => ({
		kind: "draw",
		options: "",
		arguments: cargs,
		line,
		source: "\\draw " + cargs + ";",
	})

	const expectOne = (components, why) => {
		ctx.assert(components.length === 1, `${why}: expected 1 component, got ${components.length}`)
		return components[0]
	}

	const expectPoint = (actual, expected, why) => {
		ctx.approx(actual.x, expected.x, 1e-9)
		ctx.approx(actual.y, expected.y, 1e-9)
	}

	// --- the card's acceptance cases --------------------------------------
	{
		// `\draw (0,0) to[L, l=$L_1$, name=L1] (2,0);`
		const build = makeCtx()
		const component = expectOne(
			bipoleHandler.handle(cmd("(0,0) to[L, l=$L_1$, name=L1] (2,0)"), build),
			"to[L, l=$L_1$, name=L1]"
		)

		ctx.assert(component.type === "path", `type ${JSON.stringify(component.type)}, expected "path"`)
		ctx.assert(
			component.id === "european inductor",
			`id ${JSON.stringify(component.id)}, expected "european inductor" (european: true, no inductor style)`
		)
		ctx.assert(component.points.length === 2, `points length ${component.points.length}, expected 2`)
		expectPoint(component.points[0], { x: 0, y: 0 }, "start point")
		expectPoint(component.points[1], { x: 2 * PX_PER_CM, y: 0 }, "end point")
		ctx.assert(component.name === "L1", `name ${JSON.stringify(component.name)}, expected "L1"`)
		ctx.assert(component.poles === undefined, `a plain bipole must not carry poles, got ${JSON.stringify(component.poles)}`)
		ctx.assert(component.options === undefined, `the label option must not leak into options, got ${JSON.stringify(component.options)}`)
		ctx.assert(build.report.length === 0, `a plain bipole must not warn, got ${JSON.stringify(build.report)}`)

		// the name resolves to the START of the bipole, as the card requires
		const stored = build.coords.named.get("L1")
		ctx.assert(stored !== undefined, "name=L1 must be registered in ctx.coords.named")
		expectPoint(stored, { x: 0, y: 0 }, "(L1) must be the start point")
		const resolved = resolveNamed("(L1)", 0, build.coords)
		ctx.assert(resolved !== null, "(L1) must resolve after the bipole registered it")
		expectPoint(resolved.point, { x: 0, y: 0 }, "(L1) resolution")

		// and the current point moves to the end, as in TikZ
		expectPoint(build.coords.lastPoint, { x: 2, y: 0 }, "lastPoint after the bipole")
	}
	{
		// the inductor variant follows the document setting
		const build = makeCtx({ inductorStyle: "american" })
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[L, l_=$L_1$] (2,0)"), build), "american inductor")
		ctx.assert(component.id === "american inductor", `id ${JSON.stringify(component.id)}, expected "american inductor"`)
	}
	{
		const build = makeCtx({ european: false })
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[R] (1,0)"), build), "american resistor")
		ctx.assert(component.id === "american resistor", `id ${JSON.stringify(component.id)}, expected "american resistor"`)
	}

	// --- transistors and thyristors ---------------------------------------
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[Tnigfete, name=VT] (0,-1)"), build), "to[Tnigfete]")
		ctx.assert(component.id === "nigfete", `id ${JSON.stringify(component.id)}, expected "nigfete"`)
		ctx.assert(component.name === "VT", `name ${JSON.stringify(component.name)}, expected "VT"`)
		ctx.assert(build.report.length === 0, `to[Tnigfete] must not warn, got ${JSON.stringify(build.report)}`)
	}
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[Ty] (1,0)"), build), "to[Ty]")
		ctx.assert(component.id === "full thyristor", `id ${JSON.stringify(component.id)}, expected "full thyristor"`)
		ctx.assert(component.name === undefined, "an unnamed thyristor must not carry a name")
	}

	// --- unknown symbol: nothing emitted, exactly one warning -------------
	{
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[Xyz] (1,0)"), build)
		ctx.assert(components.length === 0, `to[Xyz] must emit nothing, got ${components.length}`)
		ctx.assert(build.report.length === 1, `to[Xyz] must warn once, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].reason === UNKNOWN_PREFIX + "Xyz", `reason ${JSON.stringify(build.report[0].reason)}`)
		ctx.assert(build.coords.named.size === 0, "an unknown symbol must not register a name")
		// the path keeps going: the coordinate is still consumed
		expectPoint(build.coords.lastPoint, { x: 1, y: 0 }, "lastPoint after an unknown symbol")
	}
	{
		// `to[circ]` is a node symbol, not a bipole: warning, no component
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[circ] (1,0)"), build)
		ctx.assert(components.length === 0, `to[circ] must emit nothing, got ${components.length}`)
		ctx.assert(build.report.length === 1, `to[circ] must warn once, got ${JSON.stringify(build.report)}`)
	}

	// --- trailing `*` style marker is stripped -----------------------------
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[D*, l_=$D$] (1,0)"), build), "to[D*]")
		ctx.assert(component.id === "full diode", `id ${JSON.stringify(component.id)}, expected "full diode"`)
		ctx.assert(build.report.length === 0, `to[D*] must not warn, got ${JSON.stringify(build.report)}`)
	}

	// --- full designer names work too -------------------------------------
	{
		const build = makeCtx()
		const component = expectOne(
			bipoleHandler.handle(cmd("(0,0) to[european resistor, l=$R$] (1,0)"), build),
			"to[european resistor]"
		)
		ctx.assert(component.id === "european resistor", `id ${JSON.stringify(component.id)}`)
	}

	// --- directional options are never the symbol --------------------------
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[L, above] (1,0)"), build), "to[L, above]")
		ctx.assert(component.id === "european inductor", `id ${JSON.stringify(component.id)}, expected the inductor`)
		ctx.assert(component.options === undefined, `a directional keyword must not become an option, got ${JSON.stringify(component.options)}`)
	}
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[C, near start, l_=$C_1$] (1,0)"), build), "to[C, near start]")
		ctx.assert(component.id === "capacitor", `id ${JSON.stringify(component.id)}, expected "capacitor"`)
	}

	// --- leftover harmless tokens are kept as designer options -------------
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[L, thick] (1,0)"), build), "to[L, thick]")
		ctx.assert(
			JSON.stringify(component.options) === JSON.stringify(["thick"]),
			`options ${JSON.stringify(component.options)}, expected ["thick"]`
		)
	}

	// --- poles -------------------------------------------------------------
	for (const [options, expected] of [
		["L, *-*", { start: "circ", end: "circ" }],
		["D, *-", { start: "circ" }],
		["D, -*", { end: "circ" }],
		["L, o-*", { start: "ocirc", end: "circ" }],
		["L, *-o", { start: "circ", end: "ocirc" }],
		["R, o-o", { start: "ocirc", end: "ocirc" }],
	]) {
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd(`(0,0) to[${options}] (1,0)`), build), `to[${options}]`)
		ctx.assert(
			JSON.stringify(component.poles) === JSON.stringify(expected),
			`to[${options}]: poles ${JSON.stringify(component.poles)}, expected ${JSON.stringify(expected)}`
		)
		ctx.assert(build.report.length === 0, `to[${options}] must not warn`)
	}
	{
		// a pole spec alone is not a symbol
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[L, -] (1,0)"), build), "to[L, -]")
		ctx.assert(component.id === "european inductor", `id ${JSON.stringify(component.id)}`)
		ctx.assert(component.poles === undefined, `a bare - means no poles, got ${JSON.stringify(component.poles)}`)
	}

	// --- the setSymbol hook feeds (VT.G) ----------------------------------
	{
		const build = makeCtx()
		build.coords.anchors = makeAnchorResolver(build.coords)
		build.coords.lastPoint = null

		expectOne(bipoleHandler.handle(cmd("(0,0) to[Tnigfete, name=VT] (0,-1)"), build), "to[Tnigfete, name=VT]")

		const gate = build.coords.anchors.resolve("VT", "G")
		ctx.assert(gate !== null, "setSymbol must let (VT.G) resolve")
		// docs/anchor-map.md: nigfete G is x=-37.03903, y=10.18600 in the
		// symbol frame (px, y down), added to the start of the bipole.
		ctx.approx(gate.x, -37.03903 / PX_PER_CM, 1e-9)
		ctx.approx(gate.y, -10.186 / PX_PER_CM, 1e-9)
		ctx.assert(build.coords.anchors.warnings.length === 0, "a known pin must not fall back")
	}
	{
		// a resolver without setSymbol is accepted and skipped
		let asked = 0
		const build = makeCtx()
		build.coords.anchors = {
			resolve() {
				asked += 1
				return null
			},
		}

		const component = expectOne(bipoleHandler.handle(cmd("(0,0) to[Ty, name=VS] (1,0)"), build), "to[Ty] with a plain resolver")
		ctx.assert(component.name === "VS", `name ${JSON.stringify(component.name)}, expected "VS"`)
		ctx.assert(asked === 0, "the handler must not call resolve() itself")
	}

	// --- name/<id> spelling ------------------------------------------------
	{
		const build = makeCtx()
		const component = expectOne(bipoleHandler.handle(cmd("(1,1) to[D, name/VD] (2,1)"), build), "to[D, name/VD]")
		ctx.assert(component.name === "VD", `name ${JSON.stringify(component.name)}, expected "VD"`)
		expectPoint(build.coords.named.get("VD"), { x: 1, y: 1 }, "name/VD registration")
	}

	// --- chains: one component per `to` -----------------------------------
	{
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[R] (1,0) to[L] (1,1) to[C] (0,1)"), build)
		ctx.assert(components.length === 3, `a 2-hop chain must yield 3 components, got ${components.length}`)
		ctx.assert(
			components.map((component) => component.id).join(",") === "european resistor,european inductor,capacitor",
			`chain ids ${JSON.stringify(components.map((component) => component.id))}`
		)
		expectPoint(components[1].points[0], { x: PX_PER_CM, y: 0 }, "second bipole start")
		expectPoint(components[1].points[1], { x: PX_PER_CM, y: -PX_PER_CM }, "second bipole end")
		expectPoint(build.coords.lastPoint, { x: 0, y: 1 }, "lastPoint after the chain")
	}
	{
		// relative and calc coordinates keep working along the chain
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(1,1) to[R] ++(0,-1) to[C] +(-1,0)"), build)
		ctx.assert(components.length === 2, `relative chain must yield 2 components, got ${components.length}`)
		expectPoint(components[0].points[1], { x: PX_PER_CM, y: 0 }, "++(0,-1) places the end")
		expectPoint(components[1].points[1], { x: 0, y: 0 }, "+(−1,0) places the end but not the current point")
		expectPoint(build.coords.lastPoint, { x: 1, y: 0 }, "lastPoint after +(…) stays put")
	}

	// --- missing coordinates: skip one, warn once, keep going -------------
	{
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[L] (\\xc,0) to[R] (2,0)"), build)
		ctx.assert(components.length === 1, `the readable bipole must survive, got ${components.length}`)
		ctx.assert(components[0].id === "european resistor", `id ${JSON.stringify(components[0].id)}`)
		ctx.assert(build.report.length === 1, `unreadable end must warn once, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].reason === NO_COORDINATES, `reason ${JSON.stringify(build.report[0].reason)}`)
	}
	{
		// no start
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("to[L] (1,0)"), build)
		ctx.assert(components.length === 0, `a to without a start must emit nothing, got ${components.length}`)
		ctx.assert(build.report.length === 1, `missing start must warn once, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].reason === NO_COORDINATES, `reason ${JSON.stringify(build.report[0].reason)}`)
	}
	{
		// no end at all
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[L]"), build)
		ctx.assert(components.length === 0, `a trailing to must emit nothing, got ${components.length}`)
		ctx.assert(build.report.length === 1 && build.report[0].reason === NO_COORDINATES, `expected one warning, got ${JSON.stringify(build.report)}`)
	}
	{
		// two `to` in a row: the first has no end, the second is fine
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[L] to[R] (1,0)"), build)
		ctx.assert(components.length === 1, `only the second to is complete, got ${components.length}`)
		ctx.assert(components[0].id === "european resistor", `id ${JSON.stringify(components[0].id)}`)
		ctx.assert(build.report.length === 1, `the first to must warn once, got ${JSON.stringify(build.report)}`)
	}
	{
		// an operator between the to and its coordinate
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[L] -- (1,0)"), build)
		ctx.assert(components.length === 0, `-- cannot end a to, got ${components.length}`)
		ctx.assert(build.report.length === 1, `expected one warning, got ${JSON.stringify(build.report)}`)
	}
	{
		// a label node between the to and its coordinate is allowed
		const build = makeCtx()
		const components = bipoleHandler.handle(cmd("(0,0) to[R] node[above]{$R$} (2,0)"), build)
		ctx.assert(components.length === 1, `a node label must not break the bipole, got ${components.length}`)
		ctx.assert(components[0].id === "european resistor", `id ${JSON.stringify(components[0].id)}`)
		ctx.assert(build.report.length === 0, `a label node must not warn, got ${JSON.stringify(build.report)}`)
	}

	// --- canHandle ---------------------------------------------------------
	{
		const build = makeCtx()
		ctx.assert(bipoleHandler.canHandle(cmd("(0,0) to[L] (2,0)")), "a draw with a to must be handled")
		ctx.assert(!bipoleHandler.canHandle(cmd("(0,0) -- (1,0)")), "a draw without to is card 041's")
		ctx.assert(!bipoleHandler.canHandle({ ...cmd("at (0,0){}"), kind: "node" }), "a node belongs to cards 043/044")
		ctx.assert(!bipoleHandler.canHandle({ ...cmd("(0,0) to[L] (1,0)"), kind: "unknown" }), "kind unknown is out of scope")
		ctx.assert(!bipoleHandler.canHandle(null), "a null command must not throw")
		ctx.assert(bipoleHandler.handle(null, build).length === 0, "a null command must emit nothing")
		ctx.assert(build.report.length === 0, "rejected commands must not warn")
	}

	// --- malformed input must not throw -----------------------------------
	{
		const build = makeCtx()
		for (const cargs of ["", "to", "to[", "to[]", "to[] (1,0)", "to[,,,]", "((( to[L", "to[L] (", "to[*-*] (1,0)"]) {
			ctx.assert(Array.isArray(bipoleHandler.handle(cmd(cargs), build)), `handle must return an array for ${JSON.stringify(cargs)}`)
			bipoleHandler.canHandle(cmd(cargs)) // must never throw
		}
	}

	// --- corpus sweep ------------------------------------------------------
	{
		const names = fs.readdirSync(FIXTURES).filter((name) => name.endsWith(".tex")).sort()
		ctx.assert(names.length > 0, `no .tex fixtures found at ${FIXTURES}`)

		let toCount = 0
		let emitted = 0
		let missing = 0
		let unexpanded = 0
		const unknown = []
		const files = []
		const shortFiles = []

		for (const name of names) {
			if (name === "cell.tex") continue // plain TikZ, out of scope

			// Comments and `\foreach` come before the scanner in the real
			// pipeline (cards 010/011), so the sweep uses them too: without
			// the expansion the loop bodies keep `\xc` coordinates, which no
			// resolver can read.
			let doc = {
				text: fs.readFileSync(path.join(FIXTURES, name), "utf8"),
				colors: {},
				settings: settings(),
				warnings: [],
			}
			doc = stripComments(doc)
			doc = expandForeach(doc)

			const commands = tokenize(doc)
			const build = makeCtx()
			let fileTo = 0
			let fileEmitted = 0

			for (const command of commands) {
				if (command.kind !== "draw") continue

				fileTo += splitPath(command.arguments).filter((element) => element.kind === "to").length
				const components = bipoleHandler.handle(command, build)
				fileEmitted += components.length
				emitted += components.length
			}

			toCount += fileTo
			for (const warning of build.report) {
				if (warning.reason.startsWith(UNKNOWN_PREFIX)) unknown.push(`${name}:${warning.reason}`)
				else if (warning.reason === NO_COORDINATES) missing += 1
			}
			for (const warning of doc.warnings) {
				if (warning.reason.includes("left unexpanded")) unexpanded += 1
			}
			if (fileEmitted < fileTo) shortFiles.push(name)
			files.push(`${name}:${fileEmitted}/${fileTo}`)
		}

		ctx.assert(
			unknown.length === 0,
			`the corpus must not contain unknown symbols, found ${unknown.length}: ${JSON.stringify(unknown.slice(0, 10))}`
		)
		ctx.assert(emitted > 0, "the sweep must emit something")
		// The only unreachable `to` is the body of `\newcommand{\loadR}[2]` in
		// filters6.tex, whose coordinates are the macro parameters `#1`/`#2`.
		// Any other shortfall would be a handler bug, so it fails here.
		ctx.assert(
			shortFiles.every((name) => name === "filters6.tex"),
			`every corpus file except filters6.tex must emit all its to[...], short: ${JSON.stringify(shortFiles)}`
		)

		console.log(`corpus: ${emitted}/${toCount} to[...] emitted, ${unknown.length} unknown, ${missing} missing coordinates, ${unexpanded} unexpanded \\foreach`)
		console.log(`corpus files: ${files.join(" ")}`)
	}
}