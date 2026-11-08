/**
 * Calc interpolation: `$(A)!t!(B)$` — the point a fraction `t` of the way from
 * `A` to `B`.
 *
 * @module import/coords/calcPartway
 */

import type { CoordContext, CoordResolver, Point } from "../types"

/**
 * A factor with an optional (forbidden) unit, e.g. `0.5`, `2`, `.25`.
 *
 * A unit letter after the number makes the factor invalid — `t` is dimensionless.
 *
 * @readonly
 */
const factorPattern = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z]*)\s*$/i

/**
 * Reads `(<ref>)` starting at `index`, allowing whitespace after `(` and
 * before `)`. The reference is an identifier with an optional `.anchor` part.
 *
 * @param token - the token text being scanned
 * @param index - position of the opening `(`
 * @returns the reference text and the index just after `)`, or `null`
 */
function readReference(token: string, index: number): { ref: string; end: number } | null {
	if (token[index] !== "(") return null
	const close = token.indexOf(")", index + 1)
	if (close === -1) return null
	const ref = token.slice(index + 1, close).trim()
	if (!ref) return null
	return { ref, end: close + 1 }
}

/**
 * Resolves a reference — a name from `ctx.named`, optionally with an `.anchor`
 * suffix resolved through `ctx.anchors`.
 *
 * @param ref - e.g. `A` or `A.north`
 * @param ctx - the resolver context
 * @returns the point, or `null` when the reference is unknown
 */
function resolveReference(ref: string, ctx: CoordContext): Point | null {
	const dot = ref.indexOf(".")
	if (dot === -1) return ctx.named.get(ref) ?? null
	const node = ref.slice(0, dot)
	const anchor = ref.slice(dot + 1)
	if (!node || !anchor) return null
	return ctx.anchors ? ctx.anchors.resolve(node, anchor) : null
}

/**
 * Resolves `$(A)!t!(B)$` at `index`.
 *
 * `t` may lie outside `[0,1]` (no clamping) and must be unitless. Returns
 * `null` — without throwing or consuming — for anything this resolver does not
 * own: text not starting with `$`, a malformed expression, an unknown end
 * point, or a factor that carries a unit.
 *
 * @type {CoordResolver}
 */
export const resolveCalcPartway: CoordResolver = (token, index, ctx) => {
	if (token?.[index] !== "$") return null

	let i = index + 1
	while (token[i] === " " || token[i] === "\t") i++

	const first = readReference(token, i)
	if (!first) return null
	i = first.end
	while (token[i] === " " || token[i] === "\t") i++
	if (token[i] !== "!") return null

	i++
	const factorMatch = factorPattern.exec(token.slice(i, token.indexOf("!", i) === -1 ? token.length : token.indexOf("!", i)))
	if (!factorMatch) return null
	const factor = Number(factorMatch[1])
	if (!Number.isFinite(factor)) return null
	if (factorMatch[2]) return null // a unit on `t` is not allowed
	i += factorMatch[0].length
	while (token[i] === " " || token[i] === "\t") i++
	if (token[i] !== "!") return null

	i++
	while (token[i] === " " || token[i] === "\t") i++
	const second = readReference(token, i)
	if (!second) return null
	i = second.end
	while (token[i] === " " || token[i] === "\t") i++
	if (token[i] !== "$") return null

	const a = resolveReference(first.ref, ctx)
	const b = resolveReference(second.ref, ctx)
	if (!a || !b) return null

	const point: Point = { x: a.x + factor * (b.x - a.x), y: a.y + factor * (b.y - a.y) }
	return { point, next: i + 1, lastPoint: point }
}
