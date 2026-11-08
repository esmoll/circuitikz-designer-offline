// Card 041 — commands/wires.ts: `--` chains into wire components.
// Unit checks for the wireHandler. Runs automatically via `npm run test:import`.

export const id = "041"

function makeCtx(overrides = {}) {
	const base = {
		settings: {
			european: false,
			rpvoltages: false,
			bipolesLength: 1.0,
			inductorStyle: null,
			defaultLineWidth: null,
			defaultColor: null,
		},
		colors: {},
		coords: { named: new Map(), anchors: null, lastPoint: null, bipolesLength: 1.0 },
		report: [],
	}
	return {
		...base,
		...overrides,
		coords: { ...base.coords, ...(overrides.coords ?? {}) },
	}
}

function cmd(args, line = 1) {
	return { kind: "draw", options: "", arguments: args, line, source: "\\draw " + args }
}

export async function run(ctx) {
	const { wireHandler } = ctx.require("../.build/src/scripts/import/commands/wires.js")

	// toDesignerPoint: 4800/127 px per cm, y flipped (TikZ cm, y up -> designer px, y down)
	const PX = 4800 / 127

	// every handler call below goes through callQuiet: an exception becomes a
	// failed assertion carrying the error message instead of a crashed case
	const callQuiet = (what, fn) => {
		try {
			return fn()
		} catch (error) {
			ctx.assert(false, `${what} threw: ${error && error.message}`)
		}
	}
	const canHandle = (c) => callQuiet(`canHandle(${JSON.stringify(c.arguments)})`, () => wireHandler.canHandle(c))
	const handle = (c, bc) => callQuiet(`handle(${JSON.stringify(c.arguments)})`, () => wireHandler.handle(c, bc))

	const expectWire = (w, x1, y1, x2, y2, what) => {
		ctx.assert(w.type === "wire", `${what}: type ${JSON.stringify(w.type)}, expected "wire"`)
		ctx.assert(
			JSON.stringify(w.directions) === JSON.stringify(["--"]),
			`${what}: directions ${JSON.stringify(w.directions)}, expected ["--"]`,
		)
		ctx.assert(
			Array.isArray(w.points) && w.points.length === 2,
			`${what}: points ${JSON.stringify(w.points)}, expected two entries`,
		)
		ctx.approx(w.points[0].x, x1)
		ctx.approx(w.points[0].y, y1)
		ctx.approx(w.points[1].x, x2)
		ctx.approx(w.points[1].y, y2)
	}

	const expectLastPoint = (bc, x, y, what) => {
		ctx.assert(
			bc.coords.lastPoint !== null,
			`${what}: lastPoint should be committed, got ${JSON.stringify(bc.coords.lastPoint)}`,
		)
		ctx.approx(bc.coords.lastPoint.x, x)
		ctx.approx(bc.coords.lastPoint.y, y)
	}

	// the module exports the frozen CommandHandler shape
	ctx.assert(
		typeof wireHandler?.canHandle === "function" && typeof wireHandler?.handle === "function",
		`wireHandler must expose canHandle and handle, got ${typeof wireHandler}`,
	)

	// 1. a plain -- pair emits exactly one wire
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) -- (1,0)"), bc)
		ctx.assert(wires.length === 1, `expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, 0, PX, 0, "(0,0) -- (1,0)")
	}

	// 2. a chain emits one wire per segment, the middle coordinate twice
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) -- (1,0) -- (1,1)"), bc)
		ctx.assert(wires.length === 2, `expected exactly 2 wires, got ${wires.length}`)
		expectWire(wires[0], 0, 0, PX, 0, "chain: first segment")
		expectWire(wires[1], PX, 0, PX, -PX, "chain: second segment")
	}

	// 3. a to[...] only path is none of this handler's business
	{
		const c = cmd("(0,0) to[L] (1,0)")
		const got = canHandle(c)
		ctx.assert(got === false, `to[L] only: canHandle should be false, got ${got}`)
		const wires = handle(c, makeCtx())
		ctx.assert(wires.length === 0, `to[L] only: expected 0 wires, got ${wires.length}`)
	}

	// 4. an unresolvable end skips the wire, warns once, and still commits the other half
	{
		const c = cmd("(0,0) -- (A)", 7)
		const bc = makeCtx()
		const wires = handle(c, bc)
		ctx.assert(wires.length === 0, `unknown (A): expected 0 wires, got ${wires.length}`)
		ctx.assert(bc.report.length === 1, `unknown (A): expected exactly 1 warning, got ${bc.report.length}`)
		ctx.assert(bc.report[0].line === 7, `warning line ${bc.report[0].line}, expected 7 (the command's line)`)
		ctx.assert(bc.report[0].text === "(A)", `warning text ${JSON.stringify(bc.report[0].text)}, expected "(A)"`)
		ctx.assert(
			typeof bc.report[0].reason === "string" && bc.report[0].reason.includes("skip"),
			`warning reason should mention the skip, got ${JSON.stringify(bc.report[0].reason)}`,
		)
		expectLastPoint(bc, 0, 0, "resolved start survives the skipped pair")
	}

	// 5. canHandle truth table
	{
		const gotDraw = canHandle(cmd("(0,0) -- (1,0)"))
		ctx.assert(gotDraw === true, `draw with -- must be handled, got ${gotDraw}`)
		const gotOrtho = canHandle(cmd("(0,0) -| (1,1)"))
		ctx.assert(gotOrtho === true, `draw with -| must be handled, got ${gotOrtho}`)
		const gotTo = canHandle(cmd("(0,0) to[L] (1,0)"))
		ctx.assert(gotTo === false, `draw with only to[L] must not be handled, got ${gotTo}`)
		const gotNode = canHandle({ ...cmd("(0,0) -- (1,0)"), kind: "node" })
		ctx.assert(gotNode === false, `node kind must not be handled, got ${gotNode}`)
		const gotUnknown = canHandle({ ...cmd("(0,0) -- (1,0)"), kind: "unknown" })
		ctx.assert(gotUnknown === false, `unknown kind must not be handled, got ${gotUnknown}`)
		const gotPlain = canHandle(cmd("(0,0) (1,0)"))
		ctx.assert(gotPlain === false, `two coords without an op must not be handled, got ${gotPlain}`)
	}

	// 6. -| and |- approximate to a straight wire plus one warning each
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) -| (1,1)"), bc)
		ctx.assert(wires.length === 1, `-|: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, 0, PX, -PX, "-| straight approximation")
		ctx.assert(bc.report.length === 1, `-|: expected exactly 1 warning, got ${bc.report.length}`)
		ctx.assert(bc.report[0].text === "-|", `-|: warning text ${JSON.stringify(bc.report[0].text)}, expected "-|"`)
		ctx.assert(
			typeof bc.report[0].reason === "string" && bc.report[0].reason.includes("orthogonal"),
			`-|: warning reason should mention orthogonal, got ${JSON.stringify(bc.report[0].reason)}`,
		)
	}
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) |- (1,1)"), bc)
		ctx.assert(wires.length === 1, `|-: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, 0, PX, -PX, "|- straight approximation")
		ctx.assert(bc.report.length === 1, `|-: expected exactly 1 warning, got ${bc.report.length}`)
		ctx.assert(bc.report[0].text === "|-", `|-: warning text ${JSON.stringify(bc.report[0].text)}, expected "|-"`)
		ctx.assert(
			typeof bc.report[0].reason === "string" && bc.report[0].reason.includes("orthogonal"),
			`|-: warning reason should mention orthogonal, got ${JSON.stringify(bc.report[0].reason)}`,
		)
	}

	// 7. -- directly followed by to[...] has no coordinate to attach to
	{
		const c = cmd("(0,0) -- to[L] (1,0)")
		const got = canHandle(c)
		ctx.assert(got === true, `a path containing -- must be handled even when followed by to, got ${got}`)
		const bc = makeCtx()
		const wires = handle(c, bc)
		ctx.assert(wires.length === 0, `-- to[L]: expected 0 wires, got ${wires.length}`)
		ctx.assert(bc.report.length === 0, `-- to[L]: expected no warnings, got ${bc.report.length}`)
	}

	// 8. relative coordinates chain through lastPoint across a -- segment
	{
		const bc = makeCtx({ coords: { lastPoint: { x: 5, y: 5 } } })
		const wires = handle(cmd("(0,0) ++(1,0) -- ++(0,1)"), bc)
		ctx.assert(wires.length === 1, `relative chain: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], PX, 0, PX, -PX, "relative chain (1,0) -> (1,1) in cm")
		expectLastPoint(bc, 1, 1, "relative chain ends at (1,1)")
	}

	// 9. a named coordinate ends the wire and moves lastPoint
	{
		const bc = makeCtx({ coords: { named: new Map([["A", { x: 2, y: 0 }]]) } })
		const wires = handle(cmd("(0,0) -- (A)"), bc)
		ctx.assert(wires.length === 1, `named (A): expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, 0, 2 * PX, 0, "named (A) at (2,0) cm")
		expectLastPoint(bc, 2, 0, "named (A) commits lastPoint in cm")
	}

	// 10. calc coordinates resolve through the same chain
	{
		const bc = makeCtx({
			coords: { named: new Map([["A", { x: 0, y: 0 }], ["B", { x: 2, y: 2 }]]) },
		})
		const wires = handle(cmd("$(A)!0.5!(B)$ -- (3,0)"), bc)
		ctx.assert(wires.length === 1, `calc partway: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], PX, -PX, 3 * PX, 0, "calc partway (1,1) -> (3,0) in cm")
	}
	{
		const bc = makeCtx({
			coords: { named: new Map([["A", { x: 0, y: 0 }], ["B", { x: 2, y: 2 }]]) },
		})
		const wires = handle(cmd("$(A)+(0,1)$ -- (1,1)"), bc)
		ctx.assert(wires.length === 1, `calc offset: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, -PX, PX, -PX, "calc offset (0,1) -> (1,1) in cm")
	}

	// 11. a skipped middle coordinate breaks both neighbouring pairs independently
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) -- (A) -- (1,1)"), bc)
		ctx.assert(wires.length === 0, `unresolvable middle: expected 0 wires, got ${wires.length}`)
		ctx.assert(bc.report.length === 2, `unresolvable middle: each pair warns, expected 2 warnings, got ${bc.report.length}`)
		ctx.assert(bc.report[0].text === "(A)", `first warning text ${JSON.stringify(bc.report[0].text)}, expected "(A)"`)
		ctx.assert(bc.report[1].text === "(A)", `second warning text ${JSON.stringify(bc.report[1].text)}, expected "(A)"`)
	}
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) -- (1,0) -- (B)"), bc)
		ctx.assert(wires.length === 1, `unresolvable tail: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, 0, PX, 0, "unresolvable tail: first segment still emitted")
		ctx.assert(bc.report.length === 1, `unresolvable tail: expected 1 warning, got ${bc.report.length}`)
		ctx.assert(bc.report[0].text === "(B)", `warning text ${JSON.stringify(bc.report[0].text)}, expected "(B)"`)
	}

	// 12. nodes are ignored and to[...] segments are left to card 042
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) -- (1,0) node[above] {x}"), bc)
		ctx.assert(wires.length === 1, `trailing node: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], 0, 0, PX, 0, "trailing node ignored")
	}
	{
		const c = cmd("(0,0) to[R] (1,0) -- (2,0)")
		const got = canHandle(c)
		ctx.assert(got === true, `mixed path still contains --, got ${got}`)
		const bc = makeCtx()
		const wires = handle(c, bc)
		ctx.assert(wires.length === 1, `to[R] then --: expected exactly 1 wire, got ${wires.length}`)
		expectWire(wires[0], PX, 0, 2 * PX, 0, "wire spans only the coords around --")
	}

	// 13. non-draw kinds are never dispatched (direct handle calls stay out of contract)
	{
		const gotNode = canHandle({ ...cmd("(0,0) -- (1,0)"), kind: "node" })
		ctx.assert(gotNode === false, `node kind must not be handled, got ${gotNode}`)
		const gotUnknown = canHandle({ ...cmd("(0,0) -- (1,0)"), kind: "unknown" })
		ctx.assert(gotUnknown === false, `unknown kind must not be handled, got ${gotUnknown}`)
	}

	// 14. malformed paths never throw and stay silent; every call above runs through callQuiet
	{
		const bc = makeCtx()
		const wires = handle(cmd("-- --"), bc)
		ctx.assert(wires.length === 0, `"-- --": expected 0 wires, got ${wires.length}`)
		ctx.assert(bc.report.length === 0, `"-- --": expected no warnings, got ${bc.report.length}`)
	}
	{
		const bc = makeCtx()
		const wires = handle(cmd("(0,0) --"), bc)
		ctx.assert(wires.length === 0, `trailing --: expected 0 wires, got ${wires.length}`)
		ctx.assert(bc.report.length === 0, `trailing --: expected no warnings, got ${bc.report.length}`)
	}
}
