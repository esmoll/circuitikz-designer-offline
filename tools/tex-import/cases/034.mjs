/**
 * Card 034 - coords/calcOffset.ts
 *
 * `$(ref)+(dx,dy)$` and `$(ref)-(dx,dy)$`: the reference is a named point or a
 * sub-node anchor, the offset is an ordinary coordinate pair.
 */

export const id = "034"

// The reference fixture from the card: a sub-node VT sitting at (2,2).
const namedFixture = () => new Map([["VT", { x: 2, y: 2 }]])

const makeCtx = (named = namedFixture(), anchors = null) => ({
	named,
	anchors,
	lastPoint: { x: 0, y: 0 },
	bipolesLength: 1,
})

export async function run(ctx) {
	const { resolveCalcOffset } = ctx.require("./../.build/src/scripts/import/coords/calcOffset.js")

	const resolve = (token, index = 0, coordCtx = makeCtx()) => resolveCalcOffset(token, index, coordCtx)

	const expectNull = (token, index, coordCtx, why) => {
		const result = resolveCalcOffset(token, index, coordCtx)
		ctx.assert(result === null, `${JSON.stringify(token)} at ${index} should resolve to null (${why}), got ${JSON.stringify(result)}`)
	}

	const expectPoint = (token, point, next, why, coordCtx = makeCtx(), index = 0) => {
		const result = resolveCalcOffset(token, index, coordCtx)
		ctx.assert(result !== null, `${JSON.stringify(token)} at ${index} should resolve (${why}), got null`)
		ctx.approx(result.point.x, point.x)
		ctx.approx(result.point.y, point.y)
		ctx.assert(result.next === next, `${JSON.stringify(token)}: next ${result.next}, expected ${next} (${why})`)
		ctx.approx(result.lastPoint.x, point.x)
		ctx.approx(result.lastPoint.y, point.y)
		return result
	}

	// --- the acceptance table from the card -------------------------------
	expectPoint("$(VT)+(0,-0.5)$", { x: 2, y: 1.5 }, "$(VT)+(0,-0.5)$".length, "plus offset")
	expectPoint("$(VT)-(0,0.5)$", { x: 2, y: 1.5 }, "$(VT)-(0,0.5)$".length, "minus offset")
	expectPoint("$(VT)+(10mm,0)$", { x: 3, y: 2 }, "$(VT)+(10mm,0)$".length, "units inside the offset")
	expectNull("$(VT.Q)+(0,1)$", 0, makeCtx(), "anchor reference without an anchor resolver")
	expectNull("(VT)", 0, makeCtx(), "a named coordinate is card 032, not a calc expression")

	// --- sign handling -----------------------------------------------------
	expectPoint("$(VT)+(0,0.5)$", { x: 2, y: 2.5 }, "$(VT)+(0,0.5)$".length, "upward offset")
	expectPoint("$(VT)-(-1,-1)$", { x: 3, y: 3 }, "$(VT)-(-1,-1)$".length, "minus a negative offset")
	expectPoint("$(VT)+(0,0)$", { x: 2, y: 2 }, "$(VT)+(0,0)$".length, "zero offset")

	// --- anchors: the resolver is consulted before named points -------------
	{
		const calls = []
		const anchors = {
			resolve(node, anchor) {
				calls.push(`${node}.${anchor}`)
				return node === "VT" && anchor === "G" ? { x: 1, y: 1 } : null
			},
		}
		expectPoint("$(VT.G)+(0,1)$", { x: 1, y: 2 }, "$(VT.G)+(0,1)$".length, "anchored reference", makeCtx(new Map(), anchors))
		ctx.assert(calls.length === 1 && calls[0] === "VT.G", `anchor resolver got ${JSON.stringify(calls)}, expected ["VT.G"]`)
		expectNull("$(VT.S)+(0,1)$", 0, makeCtx(new Map(), anchors), "unknown anchor")
	}

	// --- the reference never silently drops its anchor ----------------------
	expectNull("$(VT.Q)+(0,1)$", 0, makeCtx(namedFixture(), { resolve: () => null }), "failed anchor lookup must not fall back to VT")

	// --- next index and the surrounding path text ---------------------------
	{
		const token = "to ($(VT)+(0,1)$) --"
		const result = expectPoint(token, { x: 2, y: 3 }, token.indexOf(") --"), "expression inside a longer path", makeCtx(), token.indexOf("$"))
		ctx.assert(token[result.next] === ")", `next must point at the closing path parenthesis, got ${JSON.stringify(token[result.next])}`)
	}
	// a leading `(` belongs to the path, not to the expression
	expectPoint("($(VT)+(1,0)$)", { x: 3, y: 2 }, 13, "index offset", makeCtx(), 1)

	// --- whitespace tolerance ---------------------------------------------
	expectPoint("$( VT ) + ( 0 , 1 )$", { x: 2, y: 3 }, "$( VT ) + ( 0 , 1 )$".length, "spaces around the reference and operator")
	expectPoint("$ (VT)+(0,1)$", { x: 2, y: 3 }, "$ (VT)+(0,1)$".length, "space after the dollar")

	// --- identifiers ------------------------------------------------------
	{
		const named = new Map([
			["L1", { x: 4, y: 0 }],
			["TF_1", { x: 0, y: 5 }],
		])
		expectPoint("$(L1)+(0,0.35)$", { x: 4, y: 0.35 }, "$(L1)+(0,0.35)$".length, "digits in a name", makeCtx(named))
		expectPoint("$(TF_1)+(1,0)$", { x: 1, y: 5 }, "$(TF_1)+(1,0)$".length, "underscore in a name", makeCtx(named))
	}

	// --- the resolver must not mutate the coordinate context ---------------
	{
		const named = namedFixture()
		const coordCtx = makeCtx(named)
		const vt = named.get("VT")
		resolveCalcOffset("$(VT)+(1,1)$", 0, coordCtx)
		ctx.assert(named.size === 1, `named map size changed to ${named.size}`)
		ctx.assert(named.get("VT") === vt, "the named point object was replaced")
		ctx.approx(vt.x, 2)
		ctx.approx(vt.y, 2)
		ctx.assert(coordCtx.lastPoint.x === 0 && coordCtx.lastPoint.y === 0, "resolver mutated ctx.lastPoint")
		ctx.assert(coordCtx.anchors === null, "resolver mutated ctx.anchors")
	}

	// --- things this resolver must decline ---------------------------------
	expectNull("(0,0)", 0, makeCtx(), "absolute coordinate is card 030")
	expectNull("++(1,1)", 0, makeCtx(), "relative coordinate is card 031")
	expectNull("$(A)!t!(B)$", 0, makeCtx(new Map([["A", { x: 0, y: 0 }], ["B", { x: 1, y: 1 }]])), "interpolation is card 035")
	expectNull("$(VT)+(B)$", 0, makeCtx(new Map([["VT", { x: 2, y: 2 }], ["B", { x: 1, y: 1 }]])), "named point as offset")
	expectNull("$(NOPE)+(0,1)$", 0, makeCtx(), "unknown name")
	expectNull("$(VT)$", 0, makeCtx(), "no operator")
	expectNull("$(VT)*(0,1)$", 0, makeCtx(), "unsupported operator")
	expectNull("$()+(0,1)$", 0, makeCtx(), "empty reference")
	expectNull("$(VT)+(0,1", 0, makeCtx(), "unterminated offset")
	expectNull("$(VT)+(0,1)", 0, makeCtx(), "missing closing dollar")
	expectNull("$(VT", 0, makeCtx(), "unterminated reference")
	expectNull("$", 0, makeCtx(), "bare dollar")
	expectNull("to[L]", 0, makeCtx(), "not a calc expression")
	expectNull("", 0, makeCtx(), "empty token")
}