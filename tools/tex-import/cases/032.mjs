/**
 * Card 032 - coords/named.ts
 *
 * `(A)` resolves against `ctx.named`; unknown names and dotted identifiers
 * (sub-node anchors, card 033) return null without throwing.
 */

export const id = "032"

export async function run(ctx) {
	const { resolveNamed, registerName } = ctx.require("./../.build/src/scripts/import/coords/named.js")
	const { resolveAbsolute } = ctx.require("./../.build/src/scripts/import/coords/absolute.js")

	const makeCtx = (pairs = []) => ({
		named: new Map(pairs),
		anchors: null,
		lastPoint: null,
		bipolesLength: 1,
	})

	const expectNull = (token, index, pairs, why) => {
		const coordCtx = makeCtx(pairs)
		let result
		try {
			result = resolveNamed(token, index, coordCtx)
		} catch (error) {
			ctx.assert(false, `${JSON.stringify(token)} at ${index} threw (${why}): ${error.message}`)
		}
		ctx.assert(result === null, `${JSON.stringify(token)} at ${index} should resolve to null (${why}), got ${JSON.stringify(result)}`)
		// a declined reference must not consume or move anything
		ctx.assert(coordCtx.named.size === pairs.length, `${JSON.stringify(token)}: resolver mutated ctx.named (${why})`)
		ctx.assert(coordCtx.lastPoint === null, `${JSON.stringify(token)}: resolver mutated ctx.lastPoint (${why})`)
	}

	const expectResult = (token, index, pairs, point, next, why) => {
		const coordCtx = makeCtx(pairs)
		const result = resolveNamed(token, index, coordCtx)
		ctx.assert(result !== null, `${JSON.stringify(token)} at ${index} should resolve (${why}), got null`)
		ctx.approx(result.point.x, point.x)
		ctx.approx(result.point.y, point.y)
		ctx.approx(result.lastPoint.x, point.x)
		ctx.approx(result.lastPoint.y, point.y)
		ctx.assert(result.next === next, `${JSON.stringify(token)}: next ${result.next}, expected ${next} (${why})`)
		ctx.assert(coordCtx.lastPoint === null, `${JSON.stringify(token)}: resolver mutated ctx.lastPoint (${why})`)
		return result
	}

	// --- the fixture table from the card ---------------------------------
	expectResult("(A)", 0, [["A", { x: 1, y: 2 }]], { x: 1, y: 2 }, 3, "stored point")
	expectNull("(A.B)", 0, [["A", { x: 1, y: 2 }]], "dotted identifier belongs to card 033")
	expectNull("(B)", 0, [], "empty map, unknown name")

	// --- registerName ------------------------------------------------------
	const fresh = makeCtx()
	registerName(fresh, "L1", { x: 0, y: 0 })
	ctx.assert(fresh.named.has("L1"), "registerName must put the name into ctx.named")
	const registered = resolveNamed("(L1)", 0, fresh)
	ctx.assert(registered !== null, "(L1) must resolve after registerName")
	ctx.approx(registered.point.x, 0)
	ctx.approx(registered.point.y, 0)

	registerName(fresh, "L1", { x: 3.5, y: -1.25 })
	const overwritten = resolveNamed("(L1)", 0, fresh)
	ctx.approx(overwritten.point.x, 3.5)
	ctx.approx(overwritten.point.y, -1.25)

	// a named reference moves the current point, and lastPoint is that point
	ctx.approx(overwritten.lastPoint.x, 3.5)
	ctx.assert(overwritten.lastPoint === overwritten.point, "lastPoint must be the resolved point for a named reference")

	// reading a name must not let a handler corrupt the table
	overwritten.point.x = 99
	const again = resolveNamed("(L1)", 0, fresh)
	ctx.approx(again.point.x, 3.5)

	// --- next lands just past the closing parenthesis ----------------------
	const tail = " -- (VT) -- (0,0)"
	const embedded = resolveNamed(tail, 4, makeCtx([["VT", { x: 2, y: 2 }]]))
	ctx.assert(embedded !== null, "(VT) inside a longer token must resolve")
	ctx.assert(embedded.next === 8, `next ${embedded.next}, expected 8 (just past the ")")`)
	ctx.assert(tail[embedded.next] === " ", "next must point at the character after )")

	// --- identifiers ------------------------------------------------------
	expectResult("(R_2)", 0, [["R_2", { x: -1, y: 0.5 }]], { x: -1, y: 0.5 }, 5, "underscore")
	expectResult("(my-node)", 0, [["my-node", { x: 1.5, y: 1.5 }]], { x: 1.5, y: 1.5 }, 9, "hyphen")
	expectResult("( A )", 0, [["A", { x: 1, y: 2 }]], { x: 1, y: 2 }, 5, "surrounding whitespace")
	expectNull("(0,0)", 0, [], "absolute coordinate belongs to card 030")
	expectNull("( 1.6 , 3.4 )", 0, [], "absolute with whitespace")
	expectNull("()", 0, [["", { x: 1, y: 2 }]], "empty name")
	expectNull("(1)", 0, [["1", { x: 1, y: 2 }]], "identifier must start with a letter")
	expectNull("(_A)", 0, [["_A", { x: 1, y: 2 }]], "leading underscore is not a name")
	expectNull("(calc:foo)", 0, [["calc:foo", { x: 1, y: 2 }]], "calc syntax is card 034")
	expectNull("(A B)", 0, [["A B", { x: 1, y: 2 }]], "space inside the name")
	expectNull("(VT", 0, [["VT", { x: 1, y: 2 }]], "unterminated")
	expectNull("VT)", 0, [["VT", { x: 1, y: 2 }]], "no opening parenthesis")
	expectNull("to[V]", 0, [["V", { x: 1, y: 2 }]], "not a coordinate")
	expectNull("++(VT)", 0, [["VT", { x: 1, y: 2 }]], "++ belongs to card 031")
	expectNull("", 0, [], "empty token")
	expectNull("(VT)", 5, [["VT", { x: 1, y: 2 }]], "index past the end")

	// --- real corpus: buck.tex, `to[Tnigfete, name=VT] (1.6,3.4)` ----------
	const fs = ctx.require("node:fs")
	const path = ctx.require("node:path")
	const here = path.dirname(ctx.require.resolve("./run.mjs"))
	const source = fs.readFileSync(path.join(here, "..", "..", "tests", "fixtures", "tex", "buck.tex"), "utf8")
	const match = /to\[[^\]]*name=VT[^\]]*\]\s*(\([^)]*\))/.exec(source)
	ctx.assert(match !== null, "buck.tex: could not find `to[... name=VT] (x,y)`")

	const corpusCtx = makeCtx()
	const endpoint = resolveAbsolute(match[1], 0, corpusCtx)
	ctx.assert(endpoint !== null, `buck.tex: ${match[1]} must be an absolute coordinate`)
	registerName(corpusCtx, "VT", endpoint.point)

	const named = resolveNamed("(VT)", 0, corpusCtx)
	ctx.assert(named !== null, "buck.tex: (VT) must resolve after name=VT")
	ctx.approx(named.point.x, endpoint.point.x)
	ctx.approx(named.point.y, endpoint.point.y)

	// the corpus only ever refers to the scribble anchor (VT.G), which is not ours
	expectNull("(VT.G)", 0, [["VT", endpoint.point]], "corpus anchors belong to card 033")
}
