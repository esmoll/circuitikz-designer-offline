/**
 * Card 033 - coords/anchors.ts
 *
 * `(VT.G)` resolves through the anchor resolver, degrades to the component
 * point with one warning when the anchor is unknown, and never throws on
 * malformed input. Also covers `makeAnchorResolver`'s identity hook, its pin
 * table and its warning sink.
 */

export const id = "033"

export async function run(ctx) {
	const { makeAnchorResolver, resolveAnchor, flushAnchorWarnings } = ctx.require("./../.build/src/scripts/import/coords/anchors.js")
	const { PX_PER_CM } = ctx.require("./../.build/src/scripts/import/coords/absolute.js")

	const makeCtx = (pairs = [], anchors = null) => ({
		named: new Map(pairs),
		anchors,
		lastPoint: null,
		bipolesLength: 1,
	})

	const expectNull = (token, index, coordCtx, why) => {
		let result
		try {
			result = resolveAnchor(token, index, coordCtx)
		} catch (error) {
			ctx.assert(false, `${JSON.stringify(token)} at ${index} threw (${why}): ${error.message}`)
		}
		ctx.assert(result === null, `${JSON.stringify(token)} at ${index} should resolve to null (${why}), got ${JSON.stringify(result)}`)
		ctx.assert(coordCtx.lastPoint === null, `${JSON.stringify(token)}: resolver mutated ctx.lastPoint (${why})`)
	}

	const expectPoint = (result, expected, why) => {
		ctx.assert(result !== null, `${why}: expected a result, got null`)
		ctx.approx(result.point.x, expected.x)
		ctx.approx(result.point.y, expected.y)
		ctx.approx(result.lastPoint.x, expected.x)
		ctx.approx(result.lastPoint.y, expected.y)
		ctx.assert(result.lastPoint === result.point, `${why}: lastPoint must be the resolved point`)
	}

	// --- stub AnchorResolver: (VT, "G") -> {1,-1} -------------------------
	const stub = {
		resolve: (node, anchor) => (node === "VT" && anchor === "G" ? { x: 1, y: -1 } : null),
	}
	const stubCtx = makeCtx([["VT", { x: 2, y: 3 }]], stub)
	const stubbed = resolveAnchor("(VT.G)", 0, stubCtx)
	expectPoint(stubbed, { x: 1, y: -1 }, "stub anchor")
	ctx.assert(stubbed.next === 6, `next ${stubbed.next}, expected 6 (just past ")")`)
	ctx.assert(stubCtx.named.size === 1, "resolveAnchor must not mutate ctx.named")
	ctx.approx(stubCtx.named.get("VT").x, 2)
	ctx.approx(stubCtx.named.get("VT").y, 3)

	// next lands just past `)` inside a longer token
	const tail = " -- (VT.G) -- (0,0)"
	const embedded = resolveAnchor(tail, 4, makeCtx([["VT", { x: 0, y: 0 }]], stub))
	ctx.assert(embedded !== null, "(VT.G) inside a longer token must resolve")
	ctx.assert(embedded.next === 10, `next ${embedded.next}, expected 10 (just past ")")`)
	ctx.assert(tail[embedded.next] === " ", "next must point at the character after )")

	// --- missing node ------------------------------------------------------
	expectNull("(QQ.G)", 0, makeCtx([["VT", { x: 2, y: 3 }]], stub), "unknown node")
	expectNull("(QQ.G)", 0, makeCtx([["VT", { x: 2, y: 3 }]]), "unknown node, no anchors")
	expectNull("(QQ.G)", 0, makeCtx([["VT", { x: 2, y: 3 }]], makeAnchorResolver(makeCtx())), "unknown node, real resolver")

	// --- unknown anchor: component point + exactly one warning ------------
	const unknownCtx = makeCtx([["VT", { x: 2, y: 3 }]])
	const unknownResolver = makeAnchorResolver(unknownCtx)
	ctx.assert(unknownResolver.warnings.length === 0, "warnings accessor must start empty")
	unknownCtx.anchors = unknownResolver

	// identity is unknown on purpose: ctx.named cannot say which symbol VT is
	const fallback = resolveAnchor("(VT.Z)", 0, unknownCtx)
	expectPoint(fallback, { x: 2, y: 3 }, "unknown anchor falls back to the component point")
	ctx.assert(fallback.next === 6, `next ${fallback.next}, expected 6 (just past ")")`)
	ctx.assert(unknownResolver.warnings.length === 1, `expected exactly one warning, got ${unknownResolver.warnings.length}`)
	const warning = unknownResolver.warnings[0]
	ctx.assert(warning.reason === "anchor Z of VT not resolvable, using component centre", `unexpected reason ${JSON.stringify(warning.reason)}`)
	ctx.assert(warning.line === 0, `warning line ${warning.line}, expected 0 (no line info here)`)
	ctx.assert(warning.text === "VT.Z", `warning text ${JSON.stringify(warning.text)}`)

	// one warning per call, and the live array is observable
	resolveAnchor("(VT.Z)", 0, unknownCtx)
	ctx.assert(unknownResolver.warnings.length === 2, `two calls must record two warnings, got ${unknownResolver.warnings.length}`)
	ctx.approx(unknownCtx.named.get("VT").x, 2)

	// a resolver exposing only `warn` is used as a sink too (duck typing)
	const sunk = []
	const sinkStub = { resolve: () => null, warn: (w) => sunk.push(w) }
	const sinkResult = resolveAnchor("(VT.G)", 0, makeCtx([["VT", { x: 0, y: 0 }]], sinkStub))
	expectPoint(sinkResult, { x: 0, y: 0 }, "foreign resolver without a result falls back to the centre")
	ctx.assert(sunk.length === 1, `expected one warning through the warn sink, got ${sunk.length}`)

	// --- bare `center` is always the component point, no warning ----------
	const centreResolver = makeAnchorResolver(makeCtx([["VS", { x: 4, y: 5 }]]))
	const centre = resolveAnchor("(VS.center)", 0, makeCtx([["VS", { x: 4, y: 5 }]], centreResolver))
	expectPoint(centre, { x: 4, y: 5 }, "bare center")
	ctx.assert(centre.next === 11, `next ${centre.next}, expected 11 (just past ")")`)
	ctx.assert(centreResolver.warnings.length === 0, "center must not warn")
	const centreNoResolver = resolveAnchor("(VT.center)", 0, makeCtx([["VT", { x: -1, y: 2 }]]))
	expectPoint(centreNoResolver, { x: -1, y: 2 }, "center without a resolver")

	// --- malformed input: never throws, never consumes --------------------
	const malformed = makeCtx([["VT", { x: 1, y: 2 }]])
	for (const token of ["(VT.,", "(VT.", "(VT.G", "VT.G)", "(.G)", "(VT..G)", "(vt.G)", "(VT.G.H)", "()", "", "( ", "(VT, G)"]) {
		expectNull(token, 0, malformed, "malformed")
	}
	expectNull("(VT.G)", 6, malformed, "index past the end")
	expectNull("(VT.G)", -1, malformed, "negative index")
	expectNull(null, 0, malformed, "null token")
	ctx.assert(malformed.named.size === 1, "malformed input must not touch ctx.named")

	// whitespace around the dot is tolerated, like `(VT)`
	const spaced = resolveAnchor("(VT. G)", 0, makeCtx([["VT", { x: 1, y: 2 }]], stub))
	expectPoint(spaced, { x: 1, y: -1 }, "whitespace after the dot")

	// --- makeAnchorResolver: a known anchor resolves from the pin table ---
	const pinned = makeCtx([["VT", { x: 0, y: 0 }], ["VS", { x: 0, y: 0 }]])
	const pinnedResolver = makeAnchorResolver(pinned)
	pinnedResolver.setSymbol("VT", "nigfete")

	const gate = pinnedResolver.resolve("VT", "G")
	ctx.assert(gate !== null, "nigfete G must resolve once the symbol is known")
	ctx.approx(gate.x, -37.03903 / PX_PER_CM)
	ctx.approx(gate.y, -10.186 / PX_PER_CM)
	ctx.assert(pinned.named.size === 2, "resolve must not add names to ctx.named")
	ctx.approx(pinned.named.get("VT").x, 0)
	ctx.approx(pinned.named.get("VT").y, 0)
	ctx.assert(pinnedResolver.warnings.length === 0, "a resolved anchor must not warn")

	const drain = pinnedResolver.resolve("VT", "D")
	ctx.approx(drain.x, 0)
	ctx.approx(drain.y, 29.10236 / PX_PER_CM)
	const sourcePin = pinnedResolver.resolve("VT", "S")
	ctx.approx(sourcePin.y, -29.10238 / PX_PER_CM)

	// case-insensitive pin lookup, as docs/anchor-map.md §5 requires
	const lowerGate = pinnedResolver.resolve("VT", "g")
	ctx.approx(lowerGate.x, gate.x)
	ctx.approx(lowerGate.y, gate.y)

	// the alias table: G -> gate, A -> START, K -> END on a thyristor
	pinnedResolver.setSymbol("VS", "full thyristor")
	const thyGate = pinnedResolver.resolve("VS", "G")
	ctx.approx(thyGate.x, 26.45656 / PX_PER_CM)
	ctx.approx(thyGate.y, 29.10235 / PX_PER_CM)
	const thyA = pinnedResolver.resolve("VS", "A")
	ctx.approx(thyA.x, -26.45657 / PX_PER_CM)
	ctx.approx(thyA.y, 0)
	const thyK = pinnedResolver.resolve("VS", "K")
	ctx.approx(thyK.x, 26.45656 / PX_PER_CM)

	// symbolOf, when assigned, wins over setSymbol
	pinnedResolver.symbolOf = (node) => (node === "VT" ? "circ" : null)
	const centreOnly = pinnedResolver.resolve("VT", "G")
	ctx.approx(centreOnly.x, 0)
	ctx.approx(centreOnly.y, 0)
	ctx.assert(pinnedResolver.warnings.length === 1, "circ has no G pin: one warning expected")

	// an unknown symbol name and an unknown node both stay non-fatal
	pinnedResolver.symbolOf = (node) => (node === "VT" ? "no such symbol" : null)
	ctx.approx(pinnedResolver.resolve("VT", "G").x, 0)
	ctx.assert(pinnedResolver.resolve("QQ", "G") === null, "unknown node must resolve to null")

	// --- flushAnchorWarnings ----------------------------------------------
	const flushing = makeAnchorResolver(makeCtx([["VT", { x: 1, y: 1 }]]))
	flushing.resolve("VT", "Z")
	ctx.assert(flushing.warnings.length === 1, "flush fixture must have one warning")
	const flushed = flushAnchorWarnings(flushing)
	ctx.assert(flushed.length === 1, `flushAnchorWarnings returned ${flushed.length}, expected 1`)
	ctx.assert(flushed[0].reason === "anchor Z of VT not resolvable, using component centre", "flushed reason")
	ctx.assert(flushing.warnings.length === 0, "flushAnchorWarnings must clear the sink")
	ctx.assert(flushAnchorWarnings(null).length === 0, "flushAnchorWarnings(null) must be []")
	ctx.assert(flushAnchorWarnings(stub).length === 0, "flushAnchorWarnings on a plain resolver must be []")

	// --- real corpus: `(VT.G)` of boost.tex -------------------------------
	const fs = ctx.require("node:fs")
	const path = ctx.require("node:path")
	const here = path.dirname(ctx.require.resolve("./run.mjs"))
	const source = fs.readFileSync(path.join(here, "..", "..", "tests", "fixtures", "tex", "boost.tex"), "utf8")
	const match = /(\(VT\.G\))/.exec(source)
	ctx.assert(match !== null, "boost.tex: could not find `(VT.G)`")

	const corpus = makeCtx([["VT", { x: 1.6, y: 3.4 }]])
	const corpusResolver = makeAnchorResolver(corpus)
	corpusResolver.setSymbol("VT", "nigfete")
	corpus.anchors = corpusResolver
	const corpusResult = resolveAnchor(match[1], 0, corpus)
	ctx.assert(corpusResult !== null, "boost.tex: (VT.G) must resolve")
	ctx.approx(corpusResult.point.x, 1.6 - 37.03903 / PX_PER_CM)
	ctx.approx(corpusResult.point.y, 3.4 - 10.186 / PX_PER_CM)
	ctx.assert(corpusResolver.warnings.length === 0, "boost.tex: (VT.G) must not warn")
}