/**
 * Wire statements: the `--` (and `-|`/`|-`) operators of a `\draw` become wire
 * components, one per segment.
 *
 * @module import/commands/wires
 */

import type { BuildContext, CommandHandler, ComponentSaveObject, Point, RawCommand } from "../types"
import { splitPath } from "../scanner/statements"
import { resolveAbsolute, toDesignerPoint } from "../coords/absolute"
import { resolveRelative } from "../coords/relative"
import { resolveNamed } from "../coords/named"
import { resolveCalcOffset } from "../coords/calcOffset"
import { resolveCalcPartway } from "../coords/calcPartway"

/**
 * Path operators this handler turns into wires.
 *
 * `-|` and `|-` are emitted as straight wires with a warning — the designer
 * model would support the orthogonal bend, but the import contract approximates.
 *
 * @readonly
 */
const wireOperators = new Set(["--", "-|", "|-"])

/**
 * Resolvers tried in order for every coordinate of a segment; the first
 * non-null result wins and commits `ctx.coords.lastPoint`.
 *
 * @readonly
 */
const resolvers = [resolveAbsolute, resolveRelative, resolveNamed, resolveCalcOffset, resolveCalcPartway]

/**
 * Resolves one raw coordinate text against the chain of resolvers.
 *
 * Commits `ctx.coords.lastPoint` from whichever resolver matched, so `++`
 * relative moves chain correctly.
 *
 * @param token - the raw coordinate, e.g. `++(0,-0.5)` or `$(A)!0.5!(B)$`
 * @param ctx - the build context carrying the coordinate state
 * @returns the point in centimetres (TikZ orientation), or `null`
 */
function resolveCoord(token: string, ctx: BuildContext): Point | null {
	for (const resolve of resolvers) {
		const result = resolve(token, 0, ctx.coords)
		if (result) {
			ctx.coords.lastPoint = result.lastPoint
			return result.point
		}
	}
	return null
}

/**
 * Turns `--` chains into wires.
 *
 * Handlers are additive: this handler emits one wire per `coord op coord`
 * triple — a chain `(a) -- (b) -- (c)` becomes two wires, not a polyline,
 * because the designer edits wires segment-wise. A coordinate that cannot be
 * resolved skips only its own wire and records a warning. Nothing is emitted
 * for `--` directly followed by `to[...]`: there is no coordinate to attach to.
 *
 * @type {CommandHandler}
 */
export const wireHandler: CommandHandler = {
	canHandle(cmd: RawCommand): boolean {
		if (cmd.kind !== "draw") return false
		return splitPath(cmd.arguments).some((el) => el.kind === "op" && wireOperators.has(el.text))
	},

	handle(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
		const elements = splitPath(cmd.arguments)

		// Resolve every coordinate in document order first: in TikZ each one
		// moves the current point, so `++` relative moves chain correctly even
		// when the coordinate is not adjacent to a `--` operator.
		const points: Array<Point | null> = elements.map((el) => (el.kind === "coord" ? resolveCoord(el.text, ctx) : null))

		const wires: ComponentSaveObject[] = []
		for (let i = 0; i < elements.length; i++) {
			const op = elements[i]
			if (op.kind !== "op" || !wireOperators.has(op.text)) continue

			const before = elements[i - 1]
			const after = elements[i + 1]
			// No coordinate on either side — nothing to attach this operator to.
			// (`-- to[L] (x,y)` is skipped silently; a trailing op has no pair.)
			if (!before || before.kind !== "coord") continue
			if (!after || after.kind !== "coord") continue

			const start = points[i - 1]
			const end = points[i + 1]
			if (!start || !end) {
				ctx.report.push({
					line: cmd.line,
					text: !start ? before.text : after.text,
					reason: "coordinate could not be resolved; wire skipped",
				})
				continue
			}

			wires.push({
				type: "wire",
				points: [toDesignerPoint(start), toDesignerPoint(end)],
				directions: ["--"],
			})
			if (op.text !== "--") {
				ctx.report.push({
					line: cmd.line,
					text: op.text,
					reason: "orthogonal wire approximated as straight",
				})
			}
		}

		return wires
	},
}
