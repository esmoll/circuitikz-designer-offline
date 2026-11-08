/**
 * Offset coordinates: `$(ref)+(dx,dy)$` and `$(ref)-(dx,dy)$`.
 *
 * This is how the corpus anchors a sub-node and pushes it away from the anchor,
 * e.g. `\draw (VT.S) to[battery1] ($(VT.S)+(0,-0.9)$);`. The reference is a name
 * or a name plus an anchor, never a coordinate pair, so it is parsed textually
 * and looked up in the coordinate context.
 *
 * @module import/coords/calcOffset
 */

import type { CoordContext, CoordResolver, Point } from "../types"
import { resolveAbsolute } from "./absolute"

/**
 * Characters allowed in a node name: `VT`, `L1`, `TF_1`. A `+` keeps names such
 * as `a+b` working; a `:` keeps the `name:anchor` spelling out.
 *
 * @readonly
 */
const nodeNamePattern = /^[A-Za-z0-9_:+\-]+$/

/**
 * Characters allowed in an anchor name: `VT.S`, `VT.G`, `Q1.east`.
 *
 * @readonly
 */
const anchorNamePattern = /^[A-Za-z0-9_\-]+$/

/**
 * Advances past spaces and tabs.
 *
 * @param token - the token being resolved
 * @param from - the first index to inspect
 * @returns the first index holding a non-blank character, or `token.length`
 */
function skipBlanks(token: string, from: number): number {
	let i = from
	while (i < token.length && (token[i] === " " || token[i] === "\t")) i++
	return i
}

/**
 * Looks up the reference in front of the offset.
 *
 * An anchored reference (`VT.G`) goes to the anchor resolver first; a plain one
 * (`VT`) is a named coordinate. A failed lookup is never retried against the
 * node without its anchor: `$(VT.Q)$` must not silently become `VT`.
 *
 * @param node - the node name, e.g. `VT`
 * @param anchor - the anchor after the dot, or `null` for a plain name
 * @param ref - the reference as written, anchor included
 * @param ctx - the coordinate context holding named points and the anchor map
 * @returns the point in cm, or `null` when the reference is unknown
 */
function resolveReference(node: string, anchor: string | null, ref: string, ctx: CoordContext): Point | null {
	if (anchor !== null && ctx.anchors) {
		const anchored = ctx.anchors.resolve(node, anchor)
		if (anchored) return anchored
	}
	return ctx.named.get(ref) ?? null
}

/**
 * Resolves a `$(ref)+(dx,dy)$` / `$(ref)-(dx,dy)$` expression at `index`.
 *
 * The offset pair is delegated to {@link resolveAbsolute}, so units
 * (`$(VT)+(10mm,0)$`) and inner whitespace behave exactly as for absolute
 * coordinates. The offset is applied componentwise, `-` negating both sides.
 *
 * Returns `null` for anything this resolver does not own — plain `(x,y)`, named
 * coordinates, `!t!` interpolation (card `035`), an offset that is itself a
 * named point, and unterminated expressions. It never throws and never mutates
 * `ctx`; the caller commits `lastPoint` from the returned result.
 *
 * @type {CoordResolver}
 */
export const resolveCalcOffset: CoordResolver = (token, index, ctx) => {
	if (!token || token[index] !== "$") return null

	const open = skipBlanks(token, index + 1)
	if (token[open] !== "(") return null

	// The inner parentheses hold a reference, not a coordinate pair: take the
	// text up to the next `)` verbatim.
	const closeRef = token.indexOf(")", open + 1)
	if (closeRef === -1) return null

	const ref = token.slice(open + 1, closeRef).trim()
	if (ref.length === 0) return null

	const dot = ref.indexOf(".")
	const node = dot === -1 ? ref : ref.slice(0, dot)
	const anchor = dot === -1 ? null : ref.slice(dot + 1)
	if (!nodeNamePattern.test(node)) return null
	if (anchor !== null && !anchorNamePattern.test(anchor)) return null

	const base = resolveReference(node, anchor, ref, ctx)
	if (!base) return null

	let at = skipBlanks(token, closeRef + 1)
	const sign = token[at] === "+" ? 1 : token[at] === "-" ? -1 : 0
	if (sign === 0) return null

	at = skipBlanks(token, at + 1)
	if (token[at] !== "(") return null

	const offset = resolveAbsolute(token, at, ctx)
	if (!offset) return null

	const end = skipBlanks(token, offset.next)
	if (token[end] !== "$") return null

	const point: Point = {
		x: base.x + sign * offset.point.x,
		y: base.y + sign * offset.point.y,
	}
	return { point, next: end + 1, lastPoint: point }
}