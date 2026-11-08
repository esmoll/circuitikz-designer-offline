/**
 * Bipoles: `to[<symbol>, ...]` inside a `\draw` path.
 *
 * Every `to` places one two-terminal symbol between the current point and the
 * coordinate that follows it, so a chain `(0,0) to[R] (1,0) to[L] (2,0)`
 * yields one component per `to` and nothing else. The emitted object is a
 * `PathSymbolSaveObject`, which `SaveController.loadFromJSON` resolves with
 * `MainController.instance.symbols.find(s => s.tikzName == saveObject.id)` -
 * hence `id` must be the designer `tikz` name, never the circuitikz key.
 *
 * The option list is shared with other cards: card `045` reads the same
 * `to[...]` text for labels, this handler only takes the symbol, its poles and
 * its `name`. Labels, colours, `short`, `open` and arrow tips are out of scope,
 * and nothing is rotated or scaled - the two points already fix the segment.
 *
 * ## Placement and names
 *
 * `name=<id>` (also `name/<id>`) registers the reference point in
 * `ctx.coords.named`, which is what `(L1)` and `$(L1)+(0,1)$` read later. The
 * point is the **start** of the bipole, as the card requires, not its centre.
 * The same name is handed to `ctx.coords.anchors.setSymbol` when the anchor
 * resolver exposes it (card `033`), so `(VT.G)` picks the `nigfete` gate pin
 * instead of degrading to the component centre. A plain resolver without that
 * hook simply skips the call.
 *
 * ## Current point
 *
 * Coordinates are resolved with the chain below and committed to
 * `ctx.coords.lastPoint`, so later statements see the point TikZ would. The
 * *placed* point and `lastPoint` differ for `+(dx,dy)`, which is why the
 * start of a `to` is taken from the placed point and not from `lastPoint`.
 *
 * @module import/commands/bipoles
 */

import type { PathSymbolSaveObject, Pole } from "../../components/pathSymbolComponent"
import { resolveAbsolute, toDesignerPoint } from "../coords/absolute"
import { resolveCalcOffset } from "../coords/calcOffset"
import { resolveCalcPartway } from "../coords/calcPartway"
import { registerName, resolveNamed } from "../coords/named"
import { resolveRelative } from "../coords/relative"
import { splitPath } from "../scanner/statements"
import { resolveSymbol } from "../symbols"
import type {
	AnchorResolver,
	BuildContext,
	CommandHandler,
	ComponentSaveObject,
	CoordResolver,
	CoordResult,
	Point,
	RawCommand,
} from "../types"

/** Prefix of the warning for a symbol the designer cannot draw. */
const unknownSymbolPrefix = "unknown symbol "

/** Warning reason for a `to` that carries no symbol token at all. */
const noSymbolReason = "to element without a symbol"

/** Warning reason for a symbol that resolves to a node, not to a bipole. */
const notBipolePrefix = "symbol "

/** Warning reason for a `to` whose start or end coordinate is missing. */
const noCoordinatesReason = "to element without start or end coordinate"

/**
 * Coordinate resolvers, tried in order until one accepts the token.
 *
 * The same chain cards `041` and `043` use; `resolveCalcPartway` covers the
 * `$(A)!0.5!(B)$` spelling (card `035`).
 *
 * @readonly
 */
const coordChain: CoordResolver[] = [
	resolveAbsolute,
	resolveRelative,
	resolveNamed,
	resolveCalcOffset,
	resolveCalcPartway,
]

/**
 * Options that place a label or a node, not the bipole itself.
 *
 * Card `045` owns them; here they must never be mistaken for the symbol, so
 * `to[L, above]` still resolves to `L`.
 *
 * @readonly
 */
const directionalOptions = new Set([
	"above",
	"below",
	"left",
	"right",
	"midway",
	"above left",
	"above right",
	"below left",
	"below right",
	"near start",
	"near end",
	"at start",
	"at end",
])

/**
 * A pole specification: an optional mark, a dash, an optional mark.
 *
 * `*-*` is a filled dot on both ends, `o-*` an open one at the start and a
 * filled one at the end, a bare `-` no pole at all.
 *
 * @readonly
 */
const polePattern = /^([o*]?)-([o*]?)$/

/**
 * Pole mark to designer pole name, as `poleChoices` in
 * `pathSymbolComponent.ts` spells it.
 *
 * @readonly
 */
const poleNames: Record<string, string> = { "*": "circ", o: "ocirc" }

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
 * Collapses the whitespace of one option so `near   start` matches `near start`.
 *
 * @param token - one option token
 * @returns the token without surrounding blanks and with single inner spaces
 */
function normalize(token: string): string {
	return token.trim().replace(/\s+/g, " ")
}

/**
 * Recognises `name=<id>` and `name/<id>`, braces stripped.
 *
 * @param tokens - the option tokens in source order
 * @returns the component name, or `null` when none is present
 */
function nameOf(tokens: string[]): string | null {
	for (const token of tokens) {
		const text = normalize(token)

		if (text.startsWith("name/")) {
			const value = text.slice("name/".length).replace(/^\{|\}$/g, "").trim()
			if (value.length > 0) return value
			continue
		}

		const equals = text.indexOf("=")
		if (equals === -1) continue
		if (text.slice(0, equals).trim() !== "name") continue

		const value = text.slice(equals + 1).replace(/^\{|\}$/g, "").trim()
		if (value.length > 0) return value
	}

	return null
}

/**
 * True for an option that must never be read as the symbol.
 *
 * A symbol is a plain word: `key=value` pairs carry labels, colours and
 * lengths, `name/…` is a name, `*-*` is a pole spec, a bare `*` is the
 * trailing style marker on its own, and the directional keywords belong to
 * card `045`.
 *
 * @param text - one normalised option token
 * @returns whether the token is anything but a symbol name
 */
function isNotASymbol(text: string): boolean {
	if (text.length === 0) return true
	if (text === "*") return true
	if (text.includes("=")) return true
	if (text.startsWith("name/")) return true
	if (directionalOptions.has(text)) return true
	return polePattern.test(text)
}

/**
 * Finds the symbol token: the first option that is not `isNotASymbol`.
 *
 * One trailing `*` is stripped because it marks a style (`D*` is still `D`).
 *
 * @param tokens - the option tokens in source order
 * @returns the token index and the symbol name, or `null`
 */
function findSymbol(tokens: string[]): { index: number; name: string } | null {
	for (let index = 0; index < tokens.length; index += 1) {
		const text = normalize(tokens[index])
		if (isNotASymbol(text)) continue

		return { index, name: text.replace(/\*$/, "") }
	}

	return null
}

/**
 * Reads the pole specification of a `to`, if it has one.
 *
 * @param tokens - the option tokens in source order
 * @returns `{start?, end?}`, or `null` when no end carries a pole
 */
function polesOf(tokens: string[]): Pole | null {
	for (const token of tokens) {
		const match = polePattern.exec(normalize(token))
		if (!match) continue

		const pole: Pole = {}
		if (match[1] !== "") pole.start = poleNames[match[1]]
		if (match[2] !== "") pole.end = poleNames[match[2]]

		if (pole.start === undefined && pole.end === undefined) return null
		return pole
	}

	return null
}

/**
 * Collects the options that are neither the symbol nor anything this card
 * consumes, so the designer can still read them (`european`, `thick`).
 *
 * Empty results are omitted from the save object instead of emitted as `[]`.
 *
 * @param tokens - the option tokens in source order
 * @param symbolIndex - index of the symbol token, already consumed
 * @returns the remaining plain tokens, in source order
 */
function leftoverOptions(tokens: string[], symbolIndex: number): string[] {
	const leftovers: string[] = []

	for (let index = 0; index < tokens.length; index += 1) {
		if (index === symbolIndex) continue

		const text = normalize(tokens[index])
		if (isNotASymbol(text)) continue

		leftovers.push(text)
	}

	return leftovers
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
 * Records one warning for the statement being handled.
 *
 * Unlike the colour warning of card `043` these are per occurrence: a lost
 * bipole breaks the circuit and must stay visible in the report.
 *
 * @param ctx - the build context whose report receives the warning
 * @param cmd - the statement being handled
 * @param reason - the machine-readable reason
 */
function pushWarning(ctx: BuildContext, cmd: RawCommand, reason: string): void {
	if (Array.isArray(ctx.report)) ctx.report.push({ line: cmd.line, text: cmd.source, reason })
}

/**
 * Tells the anchor resolver which symbol a name refers to.
 *
 * `(VT.G)` can only find the `nigfete` gate when the resolver knows that `VT`
 * is a `nigfete`. The hook is optional (card `033`), so a plain
 * `{ resolve() }` object is accepted and skipped.
 *
 * @param ctx - the build context holding the anchor resolver
 * @param name - the component name, e.g. `VT`
 * @param tikzName - the designer symbol it names, e.g. `nigfete`
 */
function registerSymbol(ctx: BuildContext, name: string, tikzName: string): void {
	const anchors = ctx.coords.anchors as
		| (AnchorResolver & { setSymbol?: (node: string, tikzName: string) => void })
		| null
	if (!anchors) return
	if (typeof anchors.setSymbol !== "function") return

	anchors.setSymbol(name, tikzName)
}

/**
 * Builds the save object for one `to[...]`.
 *
 * `points` is cast the way card `043` casts `position`: `PathComponent.applyJson`
 * wraps every entry in `new SVG.Point(...)`, so no SVG.js object is needed at
 * import time.
 *
 * @param options - the text between the `to` brackets
 * @param start - the segment start in cm, TikZ orientation
 * @param end - the segment end in cm, TikZ orientation
 * @param cmd - the statement being handled
 * @param ctx - the build context
 * @returns the path symbol, or `null` when the options cannot be honoured
 */
function emitBipole(
	options: string,
	start: Point,
	end: Point,
	cmd: RawCommand,
	ctx: BuildContext
): ComponentSaveObject | null {
	const tokens = splitOptions(options)

	const symbol = findSymbol(tokens)
	if (!symbol) {
		pushWarning(ctx, cmd, noSymbolReason)
		return null
	}

	const resolved = resolveSymbol(symbol.name, ctx.settings)
	if (!resolved) {
		pushWarning(ctx, cmd, unknownSymbolPrefix + symbol.name)
		return null
	}

	// `to[circ]` is not a bipole: emitting it as a path symbol would hand
	// `PathSymbolComponent` a node symbol and fail at load time.
	if (resolved.kind !== "path") {
		pushWarning(ctx, cmd, notBipolePrefix + symbol.name + " is not a bipole")
		return null
	}

	const name = nameOf(tokens)
	if (name) {
		// The card registers the start of the bipole, not its centre.
		registerName(ctx.coords, name, { x: start.x, y: start.y })
		registerSymbol(ctx, name, resolved.tikz)
	}

	const component = {
		type: "path",
		id: resolved.tikz,
		points: [toDesignerPoint(start), toDesignerPoint(end)] as PathSymbolSaveObject["points"],
	} as PathSymbolSaveObject

	const poles = polesOf(tokens)
	if (poles) component.poles = poles

	const leftovers = leftoverOptions(tokens, symbol.index)
	if (leftovers.length > 0) component.options = leftovers
	if (name) component.name = name

	return component
}

/**
 * Walks a `\draw` path and emits one bipole per `to`.
 *
 * The handler is one element behind on purpose: a `to` has no end until the
 * next coordinate appears, so the options are parked in `pending` and flushed
 * by that coordinate. Two `to`s in a row, an operator between them or the end
 * of the path leaves the parked `to` without an end - one warning, no
 * component, and the walk continues.
 *
 * @param cmd - the `draw` statement
 * @param ctx - the build context
 * @returns one component per resolved `to`, in source order
 */
function pathBipoles(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
	const components: ComponentSaveObject[] = []
	let current: Point | null = ctx.coords.lastPoint
	let pending: { options: string; start: Point } | null = null

	for (const element of splitPath(cmd.arguments)) {
		if (element.kind === "coord") {
			const resolved = resolveCoordinate(element.text, ctx)
			if (!resolved) {
				// An unreadable end must not silently fall back to the start.
				if (pending) {
					pushWarning(ctx, cmd, noCoordinatesReason)
					pending = null
				}
				continue
			}

			if (pending) {
				const { options, start } = pending
				pending = null

				const component = emitBipole(options, start, resolved.point, cmd, ctx)
				if (component) components.push(component)
			}

			// `+(dx,dy)` places the point but leaves the current point alone.
			current = resolved.point
			ctx.coords.lastPoint = resolved.lastPoint
			continue
		}

		if (element.kind === "to") {
			// A second `to` before a coordinate leaves the first one without end.
			if (pending) pushWarning(ctx, cmd, noCoordinatesReason)
			pending = null

			if (!current) {
				pushWarning(ctx, cmd, noCoordinatesReason)
				continue
			}

			pending = { options: element.options, start: { x: current.x, y: current.y } }
			continue
		}

		// `--`, `-|`, `|-` and unknown tokens break a parked `to`; a `node`
		// may still label it (`to[R] node[above]{$R$} (2,0)`), so it is left
		// alone.
		if (element.kind === "op" && pending) {
			pushWarning(ctx, cmd, noCoordinatesReason)
			pending = null
		}
	}

	if (pending) pushWarning(ctx, cmd, noCoordinatesReason)

	return components
}

/**
 * Bipole handler: turns every `to[SYM, …]` of a `\draw` path into a
 * `{type: "path", id, points, poles?, options?, name?}` save object.
 *
 * `canHandle` is true for every `draw` statement that contains at least one
 * `to`, because the handler is additive: one `\draw` may contribute wires
 * (card `041`), bipoles and poles (card `043`) at the same time.
 */
export const bipoleHandler: CommandHandler = {
	canHandle(cmd: RawCommand): boolean {
		if (!cmd) return false
		if (cmd.kind !== "draw") return false

		return splitPath(cmd.arguments).some((element) => element.kind === "to")
	},

	handle(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
		if (!cmd) return []
		if (cmd.kind !== "draw") return []

		return pathBipoles(cmd, ctx)
	},
}