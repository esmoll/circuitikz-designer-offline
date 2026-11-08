// Card 035 — coords/calcPartway.ts: $(A)!t!(B)$ interpolation.
// Unit checks for the resolveCalcPartway resolver. Runs automatically via `npm run test:import`.

export const id = "035"

export async function run(ctx) {
	const { resolveCalcPartway } = ctx.require("../.build/src/scripts/import/coords/calcPartway.js")

	// default context: named A(0,0) and B(2,2), no anchor resolver
	const makeCtx = (anchors = null) => {
		const named = new Map()
		named.set("A", { x: 0, y: 0 })
		named.set("B", { x: 2, y: 2 })
		return { named, anchors, lastPoint: null, bipolesLength: 1 }
	}

	// the resolver must never throw: every call below goes through here, so a
	// throw fails the case with its message instead of crashing the runner
	const callQuiet = (token, index, coordCtx) => {
		try {
			return resolveCalcPartway(token, index, coordCtx)
		} catch (error) {
			ctx.assert(false, `resolveCalcPartway must never throw, threw: ${error.message}`)
		}
	}

	const expectNull = (token, index, coordCtx, why) => {
		const result = callQuiet(token, index, coordCtx)
		ctx.assert(result === null, `${JSON.stringify(token)} at ${index} should resolve to null (${why}), got ${JSON.stringify(result)}`)
	}

	const expectPoint = (token, index, coordCtx, point, next, why) => {
		const result = callQuiet(token, index, coordCtx)
		ctx.assert(result !== null, `${JSON.stringify(token)} at ${index} should resolve (${why}), got null`)
		ctx.approx(result.point.x, point.x)
		ctx.approx(result.point.y, point.y)
		ctx.assert(result.next === next, `${JSON.stringify(token)} at ${index}: next ${result.next}, expected ${next} (${why})`)
		ctx.approx(result.lastPoint.x, point.x)
		ctx.approx(result.lastPoint.y, point.y)
	}

	// 1. acceptance table — A(0,0), B(2,2), no anchors
	{
		const coordCtx = makeCtx()
		expectPoint("$(A)!0.5!(B)$", 0, coordCtx, { x: 1, y: 1 }, "$(A)!0.5!(B)$".length, "midpoint of A and B, next is the token length")
		expectPoint("$(A)!0!(B)$", 0, coordCtx, { x: 0, y: 0 }, "$(A)!0!(B)$".length, "t = 0 lands on the first end")
		expectPoint("$(A)!2!(B)$", 0, coordCtx, { x: 4, y: 4 }, "$(A)!2!(B)$".length, "t outside [0,1] is not clamped")
		expectNull("$(A)!0.5!(Z)$", 0, coordCtx, "unknown second end")
		expectNull("$(A)+(0,1)$", 0, coordCtx, "not this resolver's form")
	}

	// 2. unknown first end
	{
		expectNull("$(Z)!0.5!(B)$", 0, makeCtx(), "Z is not in ctx.named")
	}

	// 3. a factor carrying a unit is rejected
	{
		const coordCtx = makeCtx()
		expectNull("$(A)!0.5cm!(B)$", 0, coordCtx, "cm unit on the factor")
		expectNull("$(A)!2pt!(B)$", 0, coordCtx, "pt unit on the factor")
	}

	// 4. non-numeric and empty factors
	{
		const coordCtx = makeCtx()
		expectNull("$(A)!x!(B)$", 0, coordCtx, "non-numeric factor")
		expectNull("$(A)!!(B)$", 0, coordCtx, "empty factor")
	}

	// 5. lastPoint mirrors the resolved point — same values, identity free
	{
		const result = callQuiet("$(A)!0.5!(B)$", 0, makeCtx())
		ctx.assert(result !== null, "$(A)!0.5!(B)$ should resolve, got null")
		ctx.approx(result.lastPoint.x, result.point.x)
		ctx.approx(result.lastPoint.y, result.point.y)
	}

	// 6. offset indexing — the $ of the form sits at index 4 in this sample,
	// next lands just past the closing $
	{
		const coordCtx = makeCtx()
		const sample = "at ($(A)!0.5!(B)$) (1,0);"
		const start = sample.indexOf("$")
		expectPoint(sample, start, coordCtx, { x: 1, y: 1 }, start + "$(A)!0.5!(B)$".length, "form inside a longer token")
		expectNull("(1,2)", 0, coordCtx, "token does not start with $")
	}

	// 7. anchor references resolve through ctx.anchors
	{
		const anchors = {
			resolve(node, anchor) {
				if (node === "A" && anchor === "north") return { x: 0, y: 2 }
				if (node === "B" && anchor === "south") return { x: 2, y: 0 }
				return null
			},
		}
		expectPoint("$(A.north)!0.5!(B.south)$", 0, makeCtx(anchors), { x: 1, y: 1 }, "$(A.north)!0.5!(B.south)$".length, "anchor endpoints")
		expectNull("$(A.north)!0.5!(B)$", 0, makeCtx(), "anchors is null — the .north suffix cannot resolve")
		expectNull("$(A.nope)!0.5!(B.south)$", 0, makeCtx(anchors), "unknown anchor pair")
	}

	// 8. whitespace is allowed after $, around the ! separators and before the closing $
	{
		const coordCtx = makeCtx()
		expectPoint("$( A ) ! 0.5 ! ( B )$", 0, coordCtx, { x: 1, y: 1 }, "$( A ) ! 0.5 ! ( B )$".length, "spaces around every part")
		expectPoint("$(A)!0.5!(B) $", 0, coordCtx, { x: 1, y: 1 }, "$(A)!0.5!(B) $".length, "space before the closing $")
		expectPoint("$(A)! .25 !(B)$", 0, coordCtx, { x: 0.5, y: 0.5 }, "$(A)! .25 !(B)$".length, "spaces around a bare-dot factor")
	}

	// 9. negative and bare-dot factors, never clamped
	{
		const coordCtx = makeCtx()
		expectPoint("$(A)!-1!(B)$", 0, coordCtx, { x: -2, y: -2 }, "$(A)!-1!(B)$".length, "negative factor extrapolates")
		expectPoint("$(A)!0.25!(B)$", 0, coordCtx, { x: 0.5, y: 0.5 }, "$(A)!0.25!(B)$".length, "quarter point")
		expectPoint("$(A)!.5!(B)$", 0, coordCtx, { x: 1, y: 1 }, "$(A)!.5!(B)$".length, "bare-dot factor")
	}

	// 10. structural breaks decline without consuming; trailing text is left alone
	{
		const coordCtx = makeCtx()
		expectNull("$(A)!0.5!(B", 0, coordCtx, "unterminated")
		expectNull("$(A)!0.5!(B)", 0, coordCtx, "missing closing $")
		expectPoint("$(A)!0.5!(B)$extra", 0, coordCtx, { x: 1, y: 1 }, "$(A)!0.5!(B)$".length, "next stops just past the closing $")
	}

	// 11. chained and headless forms are not this grammar
	{
		const coordCtx = makeCtx()
		expectNull("$(A)!0.5!0.7!(B)$", 0, coordCtx, "two factors is not this grammar")
		expectNull("$!0.5!(B)$", 0, coordCtx, "no first reference")
	}

	// 12. the resolver never throws — every call above already went through
	// callQuiet; a few malformed inputs keep the promise explicit
	{
		const coordCtx = makeCtx()
		for (const token of ["", "$", "$(A)!0.5!(B"]) {
			const result = callQuiet(token, 0, coordCtx)
			ctx.assert(result === null, `${JSON.stringify(token)} at 0 should decline without throwing, got ${JSON.stringify(result)}`)
		}
	}
}
