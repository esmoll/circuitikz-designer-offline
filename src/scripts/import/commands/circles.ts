/**
 * Junction poles: `node[circ]{}` and `node[ocirc]{}`.
 *
 * `circ` is a filled connection dot, `ocirc` an open one. They mark the points
 * where wires meet, so every occurrence must survive the import even though the
 * designer treats each dot as a plain node symbol (`tikzName` `circ` / `ocirc`).
 *
 * Two shapes reach this handler, and both are required:
 *
 * - a `node` element inside a `\draw` path - the dot sits on the last resolved
 *   coordinate before it (`(0,0) -- (1,0) node[circ]{}`);
 * - a standalone `\node[circ] at (x,y){}` command.
 *
 * Card `044` owns standalone text nodes; `canHandle` stays false for every node
 * that is not a pole so the two handlers never claim the same command.
 *
 * @module import/commands/circles
 */

import type { NodeSymbolSaveObject } from "../../components/nodeSymbolComponent"
import { resolveAbsolute, toDesignerPoint } from "../coords/absolute"
import { resolveCalcOffset } from "../coords/calcOffset"
import { registerName, resolveNamed } from "../coords/named"
import { resolveRelative } from "../coords/relative"
import { splitPath } from "../scanner/statements"
import type {
	BuildContext,
	CommandHandler,
	ComponentSaveObject,
	CoordResolver,
	CoordResult,
	ImportWarning,
	Point,
	RawCommand,
} from "../types"

/** The two connector shapes this module emits. */
type PoleShape = "circ" | "ocirc"

/** Warning reason for a pole whose colour cannot be represented. */
const colourReason = "colour of pole not imported"

/** Warning reason for a pole without a usable anchor. */
const positionReason = "position of pole not resolvable"

/**
 * Coordinate resolvers, tried in order until one accepts the token.
 *
 * The chain grows when card `035` (`$(A)!t!(B)$`) lands in `main`.
 *
 * @readonly
 */
const coordChain: CoordResolver[] = [resolveAbsolute, resolveRelative, resolveNamed, resolveCalcOffset]

/**
 * Splits an option list on top-level commas.
 *
 * Commas inside braces (`l={$L_1$}`) do not split. Backslash escapes are
 * skipped, so `\{` stays literal. Empty entries are dropped.
 *
 * @param options - the text between the option brackets
 * @returns one trimmed entry per option, in source order
 */
function splitOptions(options: string): string[] {
	const text = typeof options === "string" ? options : ""
	const tokens: string[] = []
	let depth = 0
	let start = 0

	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i]

		if (ch === "\\") {
			i += 1
			continue
		}

		if (ch === "{") depth += 1
		else if (ch === "}") depth -= 1
		else if (ch === "," && depth === 0) {
			tokens.push(text.slice(start, i))
			start = i + 1
		}
	}

	tokens.push(text.slice(start))

	return tokens.map((token) => token.trim()).filter((token) => token.length > 0)
}

/**
 * Finds a bare `circ` or `ocirc` among the options.
 *
 * Additional options (`color=ink`, `name=dot1`) are allowed: the dot is still
 * drawn, only the extras are dropped.
 *
 * @param options - the text between the option brackets
 * @returns the pole shape, or `null` for any other node
 */
function poleShape(options: string): PoleShape | null {
	for (const token of splitOptions(options)) {
		if (token === "circ" || token === "ocirc") return token
	}

	return null
}

/**
 * Reads a `key=value` option, e.g. `name=dot1`.
 *
 * One layer of surrounding braces is stripped, so both `name=o1` and
 * `name={o1}` work.
 *
 * @param options - the text between the option brackets
 * @param key - the option name to look for
 * @returns the value, or `null` when the key is absent or empty
 */
function optionValue(options: string, key: string): string | null {
	for (const token of splitOptions(options)) {
		const equals = token.indexOf("=")
		if (equals === -1) continue
		if (token.slice(0, equals).trim() !== key) continue

		const value = token.slice(equals + 1).trim().replace(/^\{|\}$/g, "")
		if (value.length > 0) return value
	}

	return null
}

/**
 * Recognises a pole node: a `circ`/`ocirc` shape with empty content.
 *
 * The empty content is what tells a dot apart from a labelled node
 * (`node[circ]{text}` is out of scope for both this card and card `044`).
 *
 * @param options - the text between the option brackets
 * @param content - the brace content, braces stripped
 * @returns the pole shape, or `null` when the node is not a pole
 */
function poleOf(options: string, content: string): PoleShape | null {
	if (typeof content === "string" && content.trim().length > 0) return null
	return poleShape(options)
}

/**
 * Splits the arguments of a standalone `\node` into its `at` coordinate and its
 * label text.
 *
 * `splitPath` already knows how to read every coordinate spelling (`(x,y)`,
 * `$(A)+(0,1)$`, `+(\dx,0)`), so the position is taken from its first `coord`
 * element instead of duplicating that scanner here. The content is the text
 * between the first `{` and the last `}`, which keeps inner braces
 * (`{$\frac{a}{b}$}`) intact.
 *
 * @param arguments_ - the node arguments, e.g. `at (2,1){}`
 * @returns the raw coordinate text (or `null`) and the brace content
 */
function parseNodeArguments(arguments_: string): { at: string | null; content: string } {
	const text = typeof arguments_ === "string" ? arguments_ : ""

	let at: string | null = null
	for (const element of splitPath(text)) {
		if (element.kind === "coord") {
			at = element.text
			break
		}
	}

	const open = text.indexOf("{")
	const close = text.lastIndexOf("}")
	const content = open !== -1 && close > open ? text.slice(open + 1, close) : ""

	return { at, content }
}

/**
 * Resolves one coordinate token with the resolver chain.
 *
 * Always starts at index `0`: the scanner hands over whole tokens, never a
 * suffix. Returns `null` - never throws - when no resolver owns the token.
 *
 * @param text - the coordinate as written, e.g. `(1.6,3.4)`
 * @param ctx - the build context holding the coordinate state
 * @returns the result of the first resolver that accepts the token
 */
function resolveCoordinate(text: string, ctx: BuildContext): CoordResult | null {
	for (const resolve of coordChain) {
		const result = resolve(text, 0, ctx.coords)
		if (result) return result
	}

	return null
}

/**
 * Records a warning unless the report already holds it.
 *
 * `ctx.report` is document-wide (card `051`), so this guard yields exactly one
 * warning per file without any module-level state.
 *
 * @param ctx - the build context whose report receives the warning
 * @param warning - the warning to record
 */
function pushWarning(ctx: BuildContext, warning: ImportWarning): void {
	if (Array.isArray(ctx.report)) ctx.report.push(warning)
}

/**
 * Warns once per file that the colour of a pole is dropped.
 *
 * @param cmd - the statement being handled
 * @param ctx - the build context whose report is inspected
 */
function warnColour(cmd: RawCommand, ctx: BuildContext): void {
	const seen = Array.isArray(ctx.report) && ctx.report.some((warning) => warning.reason === colourReason)
	if (seen) return

	pushWarning(ctx, { line: cmd.line, text: cmd.source, reason: colourReason })
}

/**
 * Warns that a pole has no resolvable anchor and is therefore skipped.
 *
 * Unlike the colour warning this is per occurrence: every lost dot is a lost
 * connection and must be visible in the report.
 *
 * @param cmd - the statement being handled
 * @param ctx - the build context whose report receives the warning
 */
function warnPosition(cmd: RawCommand, ctx: BuildContext): void {
	pushWarning(ctx, { line: cmd.line, text: cmd.source, reason: positionReason })
}

/**
 * Builds the save object for one pole, registering its name if it has one.
 *
 * `position` is a plain `{x, y}`: `NodeComponent.applyJson` wraps it in
 * `new SVG.Point(...)`, so no SVG.js type is needed at import time.
 *
 * @param shape - `circ` or `ocirc`
 * @param point - the anchor in cm, TikZ orientation
 * @param options - the node options, for `name=` and `color=`
 * @param cmd - the statement being handled
 * @param ctx - the build context
 * @returns the node save object, ready for `SaveController.loadFromJSON`
 */
function emitPole(
	shape: PoleShape,
	point: Point,
	options: string,
	cmd: RawCommand,
	ctx: BuildContext
): ComponentSaveObject {
	const name = optionValue(options, "name")
	if (name) registerName(ctx.coords, name, { x: point.x, y: point.y })
	if (optionValue(options, "color") !== null) warnColour(cmd, ctx)

	const component = {
		type: "node",
		id: shape,
		position: toDesignerPoint(point) as NodeSymbolSaveObject["position"],
	} as NodeSymbolSaveObject

	if (name) component.name = name

	return component
}

/**
 * Handles the poles inside a `\draw` path.
 *
 * The anchor of a path node is the last coordinate value resolved before it -
 * for `+(dx,dy)` that is the shifted point, while the TikZ current point stays
 * put. An explicit `at` on the node wins. Resolved coordinates are committed to
 * `ctx.coords.lastPoint` so later statements see the same current point TikZ
 * would.
 *
 * @param cmd - the `draw` statement
 * @param ctx - the build context
 * @returns one component per pole, in source order
 */
function pathPoles(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
	const components: ComponentSaveObject[] = []
	let anchor: Point | null = ctx.coords.lastPoint

	for (const element of splitPath(cmd.arguments)) {
		if (element.kind === "coord") {
			const resolved = resolveCoordinate(element.text, ctx)
			if (resolved) {
				// `+(dx,dy)` places the dot at the new point but leaves the
				// current point alone: anchor and lastPoint differ there.
				anchor = resolved.point
				ctx.coords.lastPoint = resolved.lastPoint
			}
			continue
		}

		if (element.kind !== "node") continue

		const shape = poleOf(element.options, element.content)
		if (!shape) continue

		let point = anchor
		if (element.at) {
			const at = resolveCoordinate(element.at, ctx)
			point = at ? at.point : null
		}

		if (!point) {
			warnPosition(cmd, ctx)
			continue
		}

		components.push(emitPole(shape, point, element.options, cmd, ctx))
	}

	return components
}

/**
 * Handles a standalone `\node[circ|ocirc] at (x,y){}`.
 *
 * A node does not move the current point in TikZ, so the resolved `at` is not
 * committed to `ctx.coords.lastPoint`. Without an `at` the current point is
 * used, as TikZ does.
 *
 * @param cmd - the `node` statement
 * @param ctx - the build context
 * @returns the pole, or `[]` when it is not one or has no anchor
 */
function standalonePole(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
	const { at, content } = parseNodeArguments(cmd.arguments)
	const shape = poleOf(cmd.options, content)
	if (!shape) return []

	let point: Point | null = ctx.coords.lastPoint
	if (at) {
		const resolved = resolveCoordinate(at, ctx)
		point = resolved ? resolved.point : null
	}

	if (!point) {
		warnPosition(cmd, ctx)
		return []
	}

	return [emitPole(shape, point, cmd.options, cmd, ctx)]
}

/**
 * Pole handler: emits a `{type: "node", id: "circ" | "ocirc", position, name?}`
 * for every `node[circ]` / `node[ocirc]` in a statement.
 *
 * `canHandle` is true only when the statement actually contains such a pole, so
 * `\node[above] at (1,1){$+$}` is left to card `044` and a `\draw` without poles
 * is left to cards `041` / `042`. Handlers are additive in card `051`: one
 * `\draw` can contribute wires, bipoles and poles at the same time.
 */
export const circleHandler: CommandHandler = {
	canHandle(cmd: RawCommand): boolean {
		if (!cmd) return false

		if (cmd.kind === "node") {
			const { content } = parseNodeArguments(cmd.arguments)
			return poleOf(cmd.options, content) !== null
		}

		if (cmd.kind === "draw") {
			return splitPath(cmd.arguments).some(
				(element) => element.kind === "node" && poleOf(element.options, element.content) !== null
			)
		}

		return false
	},

	handle(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
		if (!cmd) return []
		if (cmd.kind === "node") return standalonePole(cmd, ctx)
		if (cmd.kind === "draw") return pathPoles(cmd, ctx)

		return []
	},
}
