/**
 * Card 043 - commands/circles.ts
 *
 * `node[circ]` / `node[ocirc]` poles: both detection paths (path nodes and
 * standalone `\node`), the last-coordinate anchor, `name=` registration, the
 * once-per-file colour warning, the unresolved-anchor warning, and the fact
 * that `canHandle` stays false for every node card 044 owns.
 */

export const id = "043"

export async function run(ctx) {
	const { circleHandler } = ctx.require("./../.build/src/scripts/import/commands/circles.js")
	const { PX_PER_CM } = ctx.require("./../.build/src/scripts/import/coords/absolute.js")
	const { resolveNamed } = ctx.require("./../.build/src/scripts/import/coords/named.js")

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

	const cmd = (kind, options, arguments_, line = 1) => ({
		kind,
		options,
		arguments: arguments_,
		line,
		source: (kind === "node" ? "\\node" : "\\draw") + "[" + options + "]" + arguments_ + ";",
	})

	const countReason = (report, reason) => report.filter((warning) => warning.reason === reason).length

	const colourReason = "colour of pole not imported"
	const positionReason = "position of pole not resolvable"

	const expectPole = (components, expected, why) => {
		ctx.assert(components.length === 1, `${why}: expected 1 component, got ${components.length}`)
		const component = components[0]
		ctx.assert(component.type === "node", `${why}: type ${JSON.stringify(component.type)}, expected "node"`)
		ctx.assert(component.id === expected.id, `${why}: id ${JSON.stringify(component.id)}, expected ${JSON.stringify(expected.id)}`)
		ctx.approx(component.position.x, expected.x, 1e-9)
		ctx.approx(component.position.y, expected.y, 1e-9)
		return component
	}

	// --- path node: anchor = last resolved coordinate ---------------------
	{
		const build = makeCtx()
		const statement = cmd("draw", "", "(0,0) -- (1,0) node[circ]{}")
		ctx.assert(circleHandler.canHandle(statement), "`(0,0) -- (1,0) node[circ]{}` must be handled")

		const components = circleHandler.handle(statement, build)
		const component = expectPole(components, { id: "circ", x: PX_PER_CM, y: 0 }, "path node[circ]")
		ctx.assert(component.name === undefined, "path node without name must not carry one")
		ctx.assert(build.report.length === 0, `path node must not warn, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.coords.lastPoint !== null, "the resolved coordinate must be committed")
		ctx.approx(build.coords.lastPoint.x, 1)
		ctx.approx(build.coords.lastPoint.y, 0)
	}

	// --- every occurrence survives: two poles in one path ------------------
	{
		const build = makeCtx()
		const components = circleHandler.handle(cmd("draw", "", "(0,0) -- (1,0) node[circ]{} -- (2,0) node[ocirc]{}"), build)
		ctx.assert(components.length === 2, `two poles in one path: got ${components.length} components`)
		ctx.approx(components[0].position.x, PX_PER_CM)
		ctx.approx(components[1].position.x, 2 * PX_PER_CM)
		ctx.assert(components[0].id === "circ" && components[1].id === "ocirc", "pole shapes must follow the source order")
	}

	// --- standalone node with a name, and `(o1)` afterwards ----------------
	{
		const build = makeCtx()
		const statement = cmd("node", "ocirc, name=o1", "at (2,1){}")
		ctx.assert(circleHandler.canHandle(statement), "`\\node[ocirc, name=o1] at (2,1){}` must be handled")

		const component = expectPole(
			circleHandler.handle(statement, build),
			{ id: "ocirc", x: 2 * PX_PER_CM, y: -PX_PER_CM },
			"standalone node[ocirc]"
		)
		ctx.assert(component.name === "o1", `name ${JSON.stringify(component.name)}, expected "o1"`)
		ctx.assert(build.report.length === 0, `named pole must not warn, got ${JSON.stringify(build.report)}`)

		const stored = build.coords.named.get("o1")
		ctx.assert(stored !== undefined, "name=o1 must be registered in ctx.coords.named")
		ctx.approx(stored.x, 2)
		ctx.approx(stored.y, 1)

		// the same coordinate context resolves the name afterwards
		const resolved = resolveNamed("(o1)", 0, build.coords)
		ctx.assert(resolved !== null, "(o1) must resolve after the pole registered it")
		ctx.approx(resolved.point.x, 2)
		ctx.approx(resolved.point.y, 1)

		// a node does not move the current point
		ctx.assert(build.coords.lastPoint === null, "a standalone `at` must not commit lastPoint")
	}

	// --- colour: the dot survives, exactly one warning per file ------------
	{
		const build = makeCtx()
		const first = cmd("node", "circ, color=ink", "at (0,0){}", 5)
		const component = expectPole(circleHandler.handle(first, build), { id: "circ", x: 0, y: 0 }, "node[circ, color=ink]")
		ctx.assert(component.name === undefined, "a colour pole has no name")
		ctx.assert(build.report.length === 1, `expected exactly one warning, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].reason === colourReason, `reason ${JSON.stringify(build.report[0].reason)}`)
		ctx.assert(build.report[0].line === 5, `warning line ${build.report[0].line}, expected 5`)

		// a second coloured pole in the same file must not repeat the warning
		circleHandler.handle(cmd("node", "ocirc, color=red", "at (1,0){}", 6), build)
		circleHandler.handle(cmd("draw", "", "(0,0) -- (1,0) node[circ, color=blue]{}", 7), build)
		ctx.assert(
			countReason(build.report, colourReason) === 1,
			`colour warning must appear once per file, got ${countReason(build.report, colourReason)}`
		)
		ctx.assert(build.report.length === 1, `unexpected extra warnings: ${JSON.stringify(build.report)}`)
	}

	// --- other options are tolerated (corpus: name + colour together) -----
	{
		const build = makeCtx()
		const component = expectPole(
			circleHandler.handle(cmd("node", "circ, name=dot1, thick", "at (0.5,0.5){}"), build),
			{ id: "circ", x: 0.5 * PX_PER_CM, y: -0.5 * PX_PER_CM },
			"node[circ, name=dot1, thick]"
		)
		ctx.assert(component.name === "dot1", `name ${JSON.stringify(component.name)}, expected "dot1"`)
		ctx.assert(build.report.length === 0, `thick must not warn, got ${JSON.stringify(build.report)}`)
	}

	// --- corpus shapes -----------------------------------------------------
	{
		// buck.tex:26 - the pole opens the path, before any `--`
		const build = makeCtx()
		const components = circleHandler.handle(
			cmd("draw", "", "(3.4,3.4) node[circ]{} to[Tnigfete, name=VT] (1.6,3.4)"),
			build
		)
		const component = expectPole(components, { id: "circ", x: 3.4 * PX_PER_CM, y: -3.4 * PX_PER_CM }, "buck.tex:26")
		ctx.assert(component.name === undefined, "the pole itself is unnamed")
		ctx.assert(build.coords.named.size === 0, "to[...] names belong to card 042, not to poles")
	}
	{
		// buck.tex:20 - a pole followed by a text node on the same path
		const build = makeCtx()
		const components = circleHandler.handle(
			cmd("draw", "", "(0.6,3.4) node[ocirc]{} node[above left]{$+$} -- (1.4,3.4)"),
			build
		)
		expectPole(components, { id: "ocirc", x: 0.6 * PX_PER_CM, y: -3.4 * PX_PER_CM }, "buck.tex:20")
		ctx.assert(build.report.length === 0, `a label node must not warn, got ${JSON.stringify(build.report)}`)
	}
	{
		// acreg.tex:23 - the pole follows the bipole end
		const build = makeCtx()
		const components = circleHandler.handle(cmd("draw", "", "(1.8,3.4) to[Ty, name=VS1] (4.2,3.4) node[circ]{}"), build)
		expectPole(components, { id: "circ", x: 4.2 * PX_PER_CM, y: -3.4 * PX_PER_CM }, "acreg.tex:23")
	}

	// --- relative coordinates feed the anchor ------------------------------
	{
		const build = makeCtx()
		expectPole(
			circleHandler.handle(cmd("draw", "", "(1,1) ++(0,1) node[circ]{}"), build),
			{ id: "circ", x: PX_PER_CM, y: -2 * PX_PER_CM },
			"++(0,1) anchor"
		)
		ctx.approx(build.coords.lastPoint.y, 2)
	}
	{
		// `+(...)` is relative but does not move the current point
		const build = makeCtx()
		expectPole(
			circleHandler.handle(cmd("draw", "", "(1,1) +(0,1) node[circ]{}"), build),
			{ id: "circ", x: PX_PER_CM, y: -2 * PX_PER_CM },
			"+(0,1) anchor"
		)
		ctx.approx(build.coords.lastPoint.y, 1)
	}

	// --- canHandle is false for everything card 044 owns -------------------
	{
		const build = makeCtx()
		const textNode = cmd("node", "above left", "at (0,0){$+$}")
		ctx.assert(!circleHandler.canHandle(textNode), "a text node must not be claimed by circles")
		ctx.assert(circleHandler.handle(textNode, build).length === 0, "a text node must emit nothing here")

		const drawnLabel = cmd("draw", "", "(0,0) -- (1,0) node[above]{$+$}")
		ctx.assert(!circleHandler.canHandle(drawnLabel), "a label node inside a draw is not a pole")

		const labelledPole = cmd("node", "circ", "at (0,0){$+$}")
		ctx.assert(!circleHandler.canHandle(labelledPole), "a labelled node is not a bare pole")

		ctx.assert(!circleHandler.canHandle(cmd("unknown", "", "\\fill (0,0) circle (2pt)")), "kind unknown is out of scope")
		ctx.assert(!circleHandler.canHandle(null), "a null command must not throw")
		ctx.assert(circleHandler.handle(null, build).length === 0, "a null command must emit nothing")
		ctx.assert(build.report.length === 0, "rejected commands must not warn")
	}

	// --- unresolvable anchors: [] plus one warning, never a throw ---------
	{
		const build = makeCtx()
		const statement = cmd("node", "circ", "at (\\xc,4.6) {}", 23)
		ctx.assert(circleHandler.canHandle(statement), "the shape is a pole even though the anchor is unreadable")
		const components = circleHandler.handle(statement, build)
		ctx.assert(components.length === 0, `unresolvable anchor must emit nothing, got ${components.length}`)
		ctx.assert(countReason(build.report, positionReason) === 1, `expected one position warning, got ${JSON.stringify(build.report)}`)
		ctx.assert(build.report[0].line === 23, `warning line ${build.report[0].line}, expected 23`)
	}
	{
		// path node with no coordinate before it
		const build = makeCtx()
		const components = circleHandler.handle(cmd("draw", "", "node[ocirc]{} -- (0,0)"), build)
		ctx.assert(components.length === 0, `a pole without an anchor must emit nothing, got ${components.length}`)
		ctx.assert(countReason(build.report, positionReason) === 1, `expected one position warning, got ${JSON.stringify(build.report)}`)
	}
	{
		// path node whose explicit `at` is unreadable
		const build = makeCtx()
		const components = circleHandler.handle(cmd("draw", "", "(0,0) -- node[circ] at (\\xc,0){} (1,0)"), build)
		ctx.assert(components.length === 0, `an unreadable at must not fall back to the previous point, got ${components.length}`)
		ctx.assert(countReason(build.report, positionReason) === 1, `expected one position warning, got ${JSON.stringify(build.report)}`)
	}

	// --- a bare pole is never turned into a text node ----------------------
	{
		const build = makeCtx()
		const statement = cmd("node", "circ", "at (0,0){}")
		ctx.assert(circleHandler.canHandle(statement), "a bare `\\node[circ] at (0,0){}` belongs to circles, not to card 044")
		const components = circleHandler.handle(statement, build)
		expectPole(components, { id: "circ", x: 0, y: 0 }, "bare node[circ]")
		ctx.assert(components[0].label === undefined, "a pole must not carry a label")
		ctx.assert(build.report.length === 0, `a bare pole must not warn, got ${JSON.stringify(build.report)}`)
	}

	// --- malformed input must not throw ------------------------------------
	{
		const build = makeCtx()
		for (const arguments_ of ["", "(", "at", "at (", "at (0,0)", "{}", "at (0,0){{}"]) {
			const statement = cmd("node", "circ", arguments_)
			circleHandler.canHandle(statement) // must never throw
			const out = circleHandler.handle(statement, build)
			ctx.assert(Array.isArray(out), `handle must return an array for ${JSON.stringify(arguments_)}`)
		}
		for (const arguments_ of ["", "(((", "node[circ", "node[]{}", "node[circ] at ("]) {
			const out = circleHandler.handle(cmd("draw", "", arguments_), build)
			ctx.assert(Array.isArray(out), `handle must return an array for ${JSON.stringify(arguments_)}`)
		}
	}
}
