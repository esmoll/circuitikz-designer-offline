/**
 * Card 031 - coords/relative.ts
 *
 * `++(dx,dy)` moves the current point, `+(dx,dy)` does not.
 */

export const id = "031"

export async function run(ctx) {
	const { resolveRelative } = ctx.require("./../.build/src/scripts/import/coords/relative.js")

	const makeCtx = (lastPoint) => ({ named: new Map(), anchors: null, lastPoint, bipolesLength: 1 })

	const expectNull = (token, index, lastPoint, why) => {
		const coordCtx = makeCtx(lastPoint)
		const result = resolveRelative(token, index, coordCtx)
		ctx.assert(result === null, `${JSON.stringify(token)} at ${index} should resolve to null (${why}), got ${JSON.stringify(result)}`)
	}

	const expectResult = (token, index, lastPoint, point, nextLastPoint, why) => {
		const coordCtx = makeCtx(lastPoint)
		const result = resolveRelative(token, index, coordCtx)
		ctx.assert(result !== null, `${JSON.stringify(token)} at ${index} should resolve (${why}), got null`)
		ctx.approx(result.point.x, point.x)
		ctx.approx(result.point.y, point.y)
		ctx.approx(result.lastPoint.x, nextLastPoint.x)
		ctx.approx(result.lastPoint.y, nextLastPoint.y)
		ctx.assert(result.next === token.length, `${JSON.stringify(token)}: next ${result.next}, expected ${token.length} (${why})`)
		// the resolver must not mutate the caller's context
		ctx.assert(coordCtx.lastPoint === lastPoint, `${JSON.stringify(token)}: resolver mutated ctx.lastPoint (${why})`)
	}

	// --- the fixture table from the card, ctx.lastPoint = {x: 1, y: 2} ---
	const A = { x: 1, y: 2 }
	expectResult("++(0,-0.5)", 0, A, { x: 1, y: 1.5 }, { x: 1, y: 1.5 }, "++ moves the current point")
	expectResult("+(0,-0.5)", 0, A, { x: 1, y: 1.5 }, { x: 1, y: 2 }, "+ keeps the current point")
	expectResult("++(10mm,10mm)", 0, A, { x: 2, y: 3 }, { x: 2, y: 3 }, "units inside the parentheses")
	expectNull("(0,0)", 0, A, "absolute coordinate belongs to card 030")
	expectNull("++(0,0)", 0, null, "no current point")

	// --- offsets, signs, whitespace --------------------------------------
	expectResult("++(1,2)", 0, { x: 0, y: 0 }, { x: 1, y: 2 }, { x: 1, y: 2 }, "from the origin")
	expectResult("++(-1,-2)", 0, { x: 0, y: 0 }, { x: -1, y: -2 }, { x: -1, y: -2 }, "negative offsets")
	expectResult("++( 0.5 , 0.5 )", 0, A, { x: 1.5, y: 2.5 }, { x: 1.5, y: 2.5 }, "inner whitespace")
	expectNull("+(0,0)", 0, null, "single + without a current point")

	// --- offset into a longer path ---------------------------------------
	expectResult("--++(1,0)", 2, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 5 }, "after a -- segment")

	// --- things this resolver must decline --------------------------------
	expectNull("to[L]", 0, A, "not a relative coordinate")
	expectNull("+x", 0, A, "+ not followed by a parenthesis")
	expectNull("++x", 0, A, "++ not followed by a parenthesis")
	expectNull("++", 0, A, "bare ++")
	expectNull("", 0, A, "empty token")
	expectNull("++(VT)", 0, A, "named content belongs to card 032")
	expectNull("++(1,2", 0, A, "unterminated")

	// the original point object is never replaced with a copy for `+`
	const within = makeCtx(A)
	const kept = resolveRelative("+(1,1)", 0, within)
	ctx.assert(kept.lastPoint === A, "+ must return the original lastPoint object")
}