/**
 * Absolute coordinates: `(x,y)` with an optional unit per component.
 *
 * @module import/coords/absolute
 */

import type { CoordResolver, Point } from "../types"

/**
 * SVG pixels per centimetre.
 *
 * The designer stores SVG pixels with y pointing down, TikZ uses centimetres
 * with y pointing up. This is the inverse of `unitConvertMap.cm.px` in
 * `utils/impSVGNumber.ts`, which the exporter uses as `127 / 4800`.
 *
 * @readonly
 */
export const PX_PER_CM = 4800 / 127 // 37.795275590551185

/**
 * Factors from a TikZ unit to centimetres. A missing unit means `cm`.
 *
 * @readonly
 */
const unitToCm: Record<string, number> = {
	cm: 1,
	mm: 0.1,
	in: 2.54,
	pt: 2.54 / 72,
	px: 2.54 / 96,
}

/**
 * One signed number followed by an optional unit, e.g. `-3.4`, `.5`, `10mm`.
 *
 * @readonly
 */
const numberPattern = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*([a-z]*)$/i

/**
 * Characters a plain arithmetic sum may contain: numbers, signs, dots, blanks.
 *
 * TikZ evaluates arithmetic inside coordinate components, and card `012`'s
 * foreach expansion turns `\x+0.15` into `0+0.15`, so a component can arrive
 * as a sum of plain numbers (`(0+0.15,-0.6)`). Anything with letters or
 * parentheses stays out — that is pgfmath territory, not this subset.
 *
 * @readonly
 */
const sumCharacters = /^[+-\d.\s]+$/

/**
 * Converts a single coordinate component to centimetres.
 *
 * A component that is a sum of plain numbers (`0+0.15`, `1 - 0.5`) is
 * evaluated left to right; a single number keeps its unit handling. Units
 * inside a sum are not supported — TikZ would need pgfmath for that.
 *
 * @param raw - one side of the comma, e.g. ` 1.6 `, `10mm` or `0+0.15`
 * @returns the value in cm, or `null` if it is not a number or has an unknown unit
 */
function toCentimetres(raw: string): number | null {
	const text = raw.trim()

	if (sumCharacters.test(text) && /[+-]/.test(text)) {
		const compact = text.replace(/\s+/g, "")
		const terms = compact.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)
		if (terms && terms.length > 1) {
			let sum = 0
			for (const term of terms) sum += Number(term)
			return sum
		}
	}

	const match = numberPattern.exec(text)
	if (!match) return null

	const unit = match[2].toLowerCase() || "cm"
	const factor = unitToCm[unit]
	if (factor === undefined) return null

	return Number(match[1]) * factor
}

/**
 * Resolves a plain `(x,y)` coordinate at `index`.
 *
 * Returns `null` for anything this resolver does not own: text that does not
 * start with `(`, named coordinates such as `(VT)` (card `032`) and calc
 * expressions (cards `034`, `035`). It never throws and never consumes.
 *
 * @type {CoordResolver}
 */
export const resolveAbsolute: CoordResolver = (token, index) => {
	if (token?.[index] !== "(") return null

	const close = token.indexOf(")", index + 1)
	if (close === -1) return null

	const parts = token.slice(index + 1, close).split(",")
	if (parts.length !== 2) return null

	const x = toCentimetres(parts[0])
	const y = toCentimetres(parts[1])
	if (x === null || y === null) return null

	const point: Point = { x, y }
	return { point, next: close + 1, lastPoint: point }
}

/**
 * Converts a point in importer space (cm, y up) to designer space (px, y down).
 *
 * Every handler that emits `points` must use this.
 *
 * @param p - the point in centimetres, TikZ orientation
 * @returns the point in SVG pixels, designer orientation
 */
export const toDesignerPoint = (p: Point): { x: number; y: number } => ({
	x: p.x * PX_PER_CM,
	y: -p.y * PX_PER_CM,
})