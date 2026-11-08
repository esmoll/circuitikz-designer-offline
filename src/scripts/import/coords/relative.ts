/**
 * Relative coordinates: `++(dx,dy)` moves the current point, `+(dx,dy)` does not.
 *
 * @module import/coords/relative
 */

import type { CoordResolver } from "../types"
import { resolveAbsolute } from "./absolute"

/**
 * Resolves a relative coordinate at `index` against the current point.
 *
 * - `++(dx,dy)` is relative to the current point and the current point moves to
 *   the result (`lastPoint` = the new point).
 * - `+(dx,dy)` is relative to the current point but the current point stays
 *   (`lastPoint` = the old point).
 *
 * The numeric part is delegated to {@link resolveAbsolute}, so units and
 * whitespace inside the parentheses behave exactly as for absolute coordinates.
 * The resolver never mutates `ctx`; the caller commits `lastPoint` from the
 * returned {@link CoordResult}.
 *
 * @type {CoordResolver}
 */
export const resolveRelative: CoordResolver = (token, index, ctx) => {
	const moving = token.startsWith("++", index)
	const plusLength = moving ? 2 : token?.[index] === "+" ? 1 : 0
	if (plusLength === 0) return null

	const at = index + plusLength
	if (token[at] !== "(") return null

	const offset = resolveAbsolute(token, at, ctx)
	if (!offset) return null

	// A relative move without a current point is a broken document; the
	// caller records the warning.
	const base = ctx.lastPoint
	if (!base) return null

	const point = { x: base.x + offset.point.x, y: base.y + offset.point.y }
	return { point, next: offset.next, lastPoint: moving ? point : base }
}