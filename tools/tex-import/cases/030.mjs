/**
 * Card 030 - coords/absolute.ts
 *
 * Unit checks for the absolute `(x,y)` resolver and the cm -> px conversion.
 * The module is a leaf, so it is loaded straight from the compiled tree
 * instead of through the `index.js` facade (card 052).
 */

export const id = "030"

export async function run(ctx) {
	const { PX_PER_CM, resolveAbsolute, toDesignerPoint } = ctx.require("./../.build/src/scripts/import/coords/absolute.js")

	// A coordinate context is part of the resolver signature; absolute
	// coordinates never read it, but keep it realistic.
	const coordCtx = { named: new Map(), anchors: null, lastPoint: null, bipolesLength: 1 }

	const resolve = (token, index = 0) => resolveAbsolute(token, index, coordCtx)

	const expectNull = (token, index, why) => {
		const result = resolve(token, index)
		ctx.assert(result === null, `${JSON.stringify(token)} at ${index} should resolve to null (${why}), got ${JSON.stringify(result)}`)
	}

	const expectPoint = (token, index, point, next, why) => {
		const result = resolve(token, index)
		ctx.assert(result !== null, `${JSON.stringify(token)} at ${index} should resolve (${why}), got null`)
		ctx.approx(result.point.x, point.x)
		ctx.approx(result.point.y, point.y)
		ctx.assert(result.next === next, `${JSON.stringify(token)} at ${index}: next ${result.next}, expected ${next} (${why})`)
		ctx.approx(result.lastPoint.x, point.x)
		ctx.approx(result.lastPoint.y, point.y)
	}

	// --- the fixture table from the card ---------------------------------
	expectPoint("(0,0)", 0, { x: 0, y: 0 }, 5, "origin")
	expectPoint("(1.6,-3.4)", 0, { x: 1.6, y: -3.4 }, 10, "signed decimals")
	expectPoint("(10mm,1in)", 0, { x: 1, y: 2.54 }, "(10mm,1in)".length, "mm and in")
	expectNull("(VT)", 0, "named coordinate belongs to card 032")
	expectNull("to[L]", 0, "not a coordinate")

	// --- whitespace, signs, units ----------------------------------------
	expectPoint("( 1.6 , 3.4 )", 0, { x: 1.6, y: 3.4 }, "( 1.6 , 3.4 )".length, "inner whitespace")
	expectPoint("(-0.5,2)", 0, { x: -0.5, y: 2 }, 8, "negative x")
	expectPoint("(.5,+.25)", 0, { x: 0.5, y: 0.25 }, 9, "bare dot and plus sign")
	expectPoint("(1pt,1px)", 0, { x: 2.54 / 72, y: 2.54 / 96 }, "(1pt,1px)".length, "pt and px")
	expectPoint("(2cm,1)", 0, { x: 2, y: 1 }, "(2cm,1)".length, "explicit cm")

	// --- offset into a longer string --------------------------------------
	expectPoint("x(1,2)y", 1, { x: 1, y: 2 }, 6, "index offset")

	// --- things this resolver must decline --------------------------------
	expectNull("(1,2,3)", 0, "three components")
	expectNull("(,2)", 0, "missing x")
	expectNull("(1)", 0, "single component")
	expectNull("(1foo,2)", 0, "unknown unit")
	expectNull("(1,2", 0, "unterminated")
	expectNull("", 0, "empty token")
	expectNull("++(1,2)", 0, "relative prefix belongs to card 031")

	// --- unit conversion ---------------------------------------------------
	ctx.approx(PX_PER_CM, 4800 / 127)

	const converted = toDesignerPoint({ x: 1, y: -1 })
	ctx.approx(converted.x, 37.795275590551185)
	ctx.approx(converted.y, 37.795275590551185)

	const origin = toDesignerPoint({ x: 0, y: 0 })
	ctx.approx(origin.x, 0)
	ctx.approx(origin.y, 0)

	// y is flipped: TikZ y up -> designer y down
	const flipped = toDesignerPoint({ x: 2, y: 3 })
	ctx.approx(flipped.y, -3 * PX_PER_CM)
	ctx.approx(flipped.x, 2 * PX_PER_CM)
}