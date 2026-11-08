/**
 * Named coordinates: `(A)` refers to a point registered for a component name.
 *
 * A component placed with `name=VT` (or a `\node (VT)`) stores its reference
 * point in `ctx.named`; a later path element `(VT)` resolves to that point.
 *
 * @module import/coords/named
 */

import type { CoordContext, CoordResolver, Point } from "../types"

/**
 * A plain node name: a leading letter, then letters, digits, `_` or `-`.
 *
 * A dot is deliberately excluded — `(VT.G)` is a sub-node anchor and belongs to
 * card `033`, which must be free to claim it.
 *
 * @readonly
 */
const namePattern = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * Resolves `(name)` at `index` against `ctx.named`.
 *
 * Returns `null` — never throws — when the text is not a name reference, when
 * the name is unknown, or when the identifier contains a dot (anchors, card
 * `033`). A named reference moves the current point, as in TikZ, so
 * `lastPoint` is the resolved point. The resolver does not mutate `ctx`; the
 * caller commits `lastPoint` from the returned {@link CoordResult}.
 *
 * The returned point is a copy: the map keeps its own value, so a handler that
 * offsets the point in place cannot corrupt the name table.
 *
 * @type {CoordResolver}
 */
export const resolveNamed: CoordResolver = (token, index, ctx) => {
	if (token?.[index] !== "(") return null

	const close = token.indexOf(")", index + 1)
	if (close === -1) return null

	const name = token.slice(index + 1, close).trim()
	if (name.includes(".")) return null
	if (!namePattern.test(name)) return null

	const stored = ctx.named.get(name)
	if (!stored) return null

	const point: Point = { x: stored.x, y: stored.y }
	return { point, next: close + 1, lastPoint: point }
}

/**
 * Registers the reference point of a component under `name`.
 *
 * Later definitions win silently, matching TikZ: a name may be reused.
 *
 * @param ctx - the coordinate context whose `named` map receives the point
 * @param name - the component name, e.g. `VT` or `L1`
 * @param point - the reference point in centimetres, TikZ orientation
 */
export function registerName(ctx: CoordContext, name: string, point: Point): void {
	ctx.named.set(name, point)
}
