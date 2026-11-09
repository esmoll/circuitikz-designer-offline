/**
 * Standalone text nodes: `\node[anchor=east] at (0,2.4) {$V_{in}$};`
 *
 * A `\node` that carries a position (`at <coord>`) and a label is the corpus
 * way of writing a free-standing piece of text - a voltage name, a current
 * arrow label, a "+" sign next to a wire. The designer models that as one
 * `node` component whose `label` is a `PositionedLabel`, so the whole statement
 * becomes a single save object built here.
 *
 * Three things are deliberately lossy, and each is either silent or reported
 * exactly once per file:
 *
 * - `text=<colour>` maps through card `011`'s named-colour map onto
 *   `label.color`; a colour the map does not know is dropped with one warning;
 * - a direction the designer has no anchor key for is dropped, leaving the
 *   label at its default anchor, with one warning;
 * - TeX sizing wrappers (`\footnotesize`, `\small`, ...) disappear: the
 *   designer sets the font size itself, so keeping them would print the macro
 *   name as text.
 *
 * `align=center`, `inner sep`, `thick` and other cosmetic options are simply
 * ignored - they are not warnings, the text still appears in the right place.
 *
 * Card `043` owns the poles (`circ` / `ocirc`); `canHandle` is false for every
 * node that handler claims, so the two never emit the same component twice.
 *
 * @module import/commands/textNodes
 */

import type { NodeSaveObject } from "../../components/nodeComponent"
import type { PositionedLabel } from "../../mixins/labelable"
import { resolveAbsolute, toDesignerPoint } from "../coords/absolute"
import { resolveAnchor } from "../coords/anchors"
import { resolveCalcOffset } from "../coords/calcOffset"
import { resolveCalcPartway } from "../coords/calcPartway"
import { resolveNamed } from "../coords/named"
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

/**
 * Warning reason for a `text=<colour>` naming a colour card `011` never
 * collected, so the label cannot know it.
 */
const colourReason = "label colour of text node (text=) not imported"

/** Warning reason for an anchor name the designer has no key for. */
const anchorReason = "anchor of text node not known"

/** Warning reason for a text node whose `at` coordinate nobody resolves. */
const positionReason = "position of text node not resolvable"

/**
 * Coordinate resolvers, tried in order until one accepts the token.
 *
 * The same chain cards `041`, `042` and `043` use; `resolveCalcPartway` covers
 * the `$(A)!0.5!(B)$` spelling (card `035`), and `resolveAnchor` (card `033`)
 * covers the bare sub-node anchor `(VS.G)` that the corpus places text at.
 *
 * @readonly
 */
const coordChain: CoordResolver[] = [
	resolveAbsolute,
	resolveRelative,
	resolveNamed,
	resolveAnchor,
	resolveCalcOffset,
	resolveCalcPartway,
]

/**
 * TikZ direction or anchor name to the designer anchor **key**.
 *
 * The values are the `key` fields of `basicDirections` in
 * `src/scripts/components/nodeComponent.ts` - `default`, `center`, `north`,
 * `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`.
 * The keys are imported as a literal table instead of the array itself so this
 * module stays free of a runtime SVG.js import (the designer only needs the
 * string, and `NodeComponent.applyJson` turns it back into a `DirectionInfo`).
 *
 * TikZ spells the diagonals both ways (`above left`, `north west`); the
 * designer uses the concatenated form. `default` is accepted for symmetry with
 * the designer, although TikZ never writes it.
 *
 * @readonly
 */
const anchorKeys: Record<string, string> = {
	default: "default",
	center: "center",
	centre: "center",
	above: "north",
	below: "south",
	left: "west",
	right: "east",
	north: "north",
	south: "south",
	east: "east",
	west: "west",
	"above left": "northwest",
	"left above": "northwest",
	"above right": "northeast",
	"right above": "northeast",
	"below left": "southwest",
	"left below": "southwest",
	"below right": "southeast",
	"right below": "southeast",
	"north west": "northwest",
	northwest: "northwest",
	"north east": "northeast",
	northeast: "northeast",
	"south west": "southwest",
	southwest: "southwest",
	"south east": "southeast",
	southeast: "southeast",
}

/**
 * TeX commands the designer cannot render and that carry no text of their own.
 *
 * Matched as whole words so `\smallcaps` (unknown anyway) is not mangled into
 * `caps`. Ordering does not matter: each alternative is anchored on `\` and a
 * word boundary.
 *
 * @readonly
 */
const sizingWrappers = /\\(?:footnotesize|scriptsize|tiny|small|normalsize|large|Large|LARGE|huge|Huge|strut)\b/g

/**
 * A TeX line break `\\`, optionally with a vertical skip (`\\[1ex]`).
 *
 * Only the doubled backslash is a break; `\%` or `\_` are single commands and
 * must survive untouched.
 *
 * @readonly
 */
const lineBreak = /\\\\\s*(?:\[[^\]]*\])?/g

/**
 * Splits an option list on top-level commas.
 *
 * Commas inside braces (`anchor={north east}`) do not split. Backslash escapes
 * are skipped, so `\{` stays literal. Empty entries are dropped.
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
 * Collapses the whitespace of one option so `above   left` matches `above left`.
 *
 * @param token - one option token
 * @returns the token in lower case, without surrounding blanks and with single
 * inner spaces
 */
function normalize(token: string): string {
	return token.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Reads a `key=value` option, e.g. `anchor=east` or `text=grp`.
 *
 * One layer of surrounding braces is stripped, so both `anchor=east` and
 * `anchor={east}` work; the key comparison ignores case and inner repeats of
 * whitespace.
 *
 * @param options - the text between the option brackets
 * @param key - the option name to look for, lower case
 * @returns the value, or `null` when the key is absent or empty
 */
function optionValue(options: string, key: string): string | null {
	for (const token of splitOptions(options)) {
		const equals = token.indexOf("=")
		if (equals === -1) continue
		if (normalize(token.slice(0, equals)) !== key) continue

		const value = normalize(token.slice(equals + 1)).replace(/^\{|\}$/g, "")
		if (value.length > 0) return value
	}

	return null
}

/**
 * Finds a bare directional option, e.g. the `above` in `\node[above] at (1,1)`.
 *
 * TikZ treats `[above]` as a shorthand for `anchor=south`; the corpus uses it
 * as "put the text below/above this point", which is what the designer anchor
 * key expresses too. Only tokens that are known directions match, so a symbol
 * name or a stray option can never be mistaken for one.
 *
 * @param options - the text between the option brackets
 * @returns the first bare directional keyword, or `null`
 */
function bareDirection(options: string): string | null {
	for (const token of splitOptions(options)) {
		if (token.includes("=")) continue
		const text = normalize(token)
		if (Object.prototype.hasOwnProperty.call(anchorKeys, text)) return text
	}

	return null
}

/**
 * True when the options carry a pole shape (`circ` / `ocirc`).
 *
 * Card `043` draws those as a connection dot instead of a text node.
 *
 * @param options - the text between the option brackets
 * @returns whether any option is a pole shape
 */
function hasPoleShape(options: string): boolean {
	return splitOptions(options).some((token) => {
		const text = normalize(token)
		return text === "circ" || text === "ocirc"
	})
}

/**
 * Splits the arguments of a standalone `\node` into its `at` coordinate and its
 * label text.
 *
 * Only the part before the label brace is scanned for a coordinate, so a
 * `$(0,0)$` inside the text can never be mistaken for the position. The label
 * is the text between the first `{` and the last `}`, which keeps inner braces
 * (`{$\frac{a}{b}$}`, `{\footnotesize ...}`) intact. `splitPath` already knows
 * every coordinate spelling (`(x,y)`, `$(A)+(0,1)$`, `+(\dx,0)`), so the
 * position is taken from its first `coord` element instead of duplicating that
 * scanner here.
 *
 * @param arguments_ - the node arguments, e.g. `at (2,1){$V_{in}$}`
 * @returns the raw coordinate text (or `null`) and the brace content
 */
function parseNodeArguments(arguments_: string): { at: string | null; content: string } {
	const text = typeof arguments_ === "string" ? arguments_ : ""

	const open = text.indexOf("{")
	const close = text.lastIndexOf("}")
	const head = open === -1 ? text : text.slice(0, open)
	const content = open === -1 ? "" : close > open ? text.slice(open + 1, close) : text.slice(open + 1)

	let at: string | null = null
	for (const element of splitPath(head)) {
		if (element.kind === "coord") {
			at = element.text
			break
		}
	}

	return { at, content }
}

/**
 * A calc coordinate with the parentheses TikZ wraps around it: `($(A)+(0,1)$)`.
 *
 * `splitPath` keeps the outer pair, while the `coords/*` resolvers start at the
 * `$`; this pattern is what justifies retrying the chain one character in.
 *
 * @readonly
 */
const wrappedCalc = /^\(\$[\s\S]*\$\s*\)$/

/**
 * Resolves one coordinate token with the resolver chain.
 *
 * The scanner hands over whole tokens, never a suffix, so the chain starts at
 * index `0`. TikZ writes a calc position as `($(A)+(dx,dy)$)` - the parentheses
 * belong to the coordinate - and `splitPath` keeps them, while the `coords/*`
 * resolvers start at the `$`. For exactly that spelling the chain is therefore
 * retried at index `1`, which is the `$`.
 *
 * Returns `null` - never throws - when no resolver owns the token.
 *
 * @param text - the coordinate as written, e.g. `$(L1)+(0,0.35)$` or
 * `($(L1)+(0,0.35)$)`
 * @param ctx - the build context holding the coordinate state
 * @returns the result of the first resolver that accepts the token
 */
function resolveCoordinate(text: string, ctx: BuildContext): CoordResult | null {
	const token = typeof text === "string" ? text : ""
	const starts = wrappedCalc.test(token) ? [0, 1] : [0]

	for (const start of starts) {
		for (const resolve of coordChain) {
			const result = resolve(token, start, ctx.coords)
			if (result) return result
		}
	}

	return null
}

/**
 * Turns the brace content into the label value the designer can render.
 *
 * - `\\` becomes a newline (a second label line in the designer);
 * - TeX sizing wrappers are removed - the designer has its own font size, and
 *   keeping `\footnotesize` would render the macro name;
 * - repeated blanks left behind by the removals are collapsed and the result is
 *   trimmed.
 *
 * Math is untouched: `$V_{in}$` and `$\frac{a}{b}$` reach MathJax exactly as
 * written.
 *
 * @param content - the brace content, outer braces already stripped
 * @returns the label value, possibly empty
 */
function labelValue(content: string): string {
	const text = typeof content === "string" ? content : ""

	return text
		.replace(lineBreak, "\n")
		.replace(sizingWrappers, "")
		.replace(/[ \t]+/g, " ")
		.trim()
}

/**
 * Maps the node options to a designer anchor key.
 *
 * `anchor=<dir>` wins over a bare direction such as `[above]`. An unknown name
 * is reported once per file and leaves the anchor undefined, so the label is
 * still imported - at its default anchor - instead of being dropped.
 *
 * @param options - the text between the option brackets
 * @param cmd - the statement being handled
 * @param ctx - the build context whose report receives the warning
 * @returns the designer anchor key, or `null` when there is none usable
 */
function anchorOf(options: string, cmd: RawCommand, ctx: BuildContext): string | null {
	const name = optionValue(options, "anchor") ?? bareDirection(options)
	if (name === null) return null

	const key = anchorKeys[name]
	if (key !== undefined) return key

	warnOnce(ctx, { line: cmd.line, text: cmd.source, reason: anchorReason })
	return null
}

/**
 * Records a warning unless the report already holds the same reason.
 *
 * `ctx.report` is document-wide, so this guard yields exactly one warning per
 * file without any module-level state.
 *
 * @param ctx - the build context whose report receives the warning
 * @param warning - the warning to record
 */
function warnOnce(ctx: BuildContext, warning: ImportWarning): void {
	const seen = Array.isArray(ctx.report) && ctx.report.some((entry) => entry.reason === warning.reason)
	if (seen) return

	pushWarning(ctx, warning)
}

/**
 * Records a warning unconditionally, guarding against a missing report.
 *
 * @param ctx - the build context whose report receives the warning
 * @param warning - the warning to record
 */
function pushWarning(ctx: BuildContext, warning: ImportWarning): void {
	if (Array.isArray(ctx.report)) ctx.report.push(warning)
}

/**
 * Builds the save object for one text node.
 *
 * `position` is a plain `{x, y}`: `NodeComponent.applyJson` wraps it in
 * `new SVG.Point(...)`, so no SVG.js type is needed at import time.
 *
 * @param value - the label text, TeX sizing wrappers already removed
 * @param anchor - the designer anchor key, or `null` for the default anchor
 * @param point - the `at` position in cm, TikZ orientation
 * @param colour - the resolved label colour (hex from card `011`'s map), or
 * `null` to keep the theme stroke
 * @returns the node save object, ready for `SaveController.loadFromJSON`
 */
function emitTextNode(value: string, anchor: string | null, point: Point, colour: string | null): ComponentSaveObject {
	const label: PositionedLabel = { value }
	if (anchor !== null) label.anchor = anchor
	if (colour !== null) label.color = colour

	const component = {
		type: "node",
		position: toDesignerPoint(point) as NodeSaveObject["position"],
		label,
	} as NodeSaveObject

	return component
}

/**
 * Handles a standalone `\node[...] at (x,y) {$text$}`.
 *
 * Without an `at` there is no position to place the text at, so nothing is
 * emitted - an empty `{}` without `at` is the pole marker card `043` owns.
 * The resolved coordinate is committed to `ctx.coords.lastPoint`, as every
 * other handler does, so a later `+(dx,dy)` starts from the same point TikZ
 * would use.
 *
 * @param cmd - the `node` statement
 * @param ctx - the build context
 * @returns one text node, or `[]` when there is nothing to place
 */
function standaloneTextNode(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
	const { at, content } = parseNodeArguments(cmd.arguments)
	if (at === null) return []

	const value = labelValue(content)
	if (value.length === 0) return []

	const resolved = resolveCoordinate(at, ctx)
	if (!resolved) {
		pushWarning(ctx, { line: cmd.line, text: cmd.source, reason: positionReason })
		return []
	}
	ctx.coords.lastPoint = resolved.lastPoint

	// `text=<colour>` maps through card `011`'s named-colour map; a colour the
	// map does not know stays a warning, and the text is imported either way.
	let colour: string | null = null
	const colourName = optionValue(cmd.options, "text")
	if (colourName !== null) {
		colour = ctx.colors[colourName] ?? null
		if (colour === null) {
			warnOnce(ctx, { line: cmd.line, text: cmd.source, reason: colourReason })
		}
	}

	return [emitTextNode(value, anchorOf(cmd.options, cmd, ctx), resolved.point, colour)]
}

/**
 * Text node handler: emits one `{type: "node", position, label: {value, anchor?}}`
 * per standalone `\node[..] at (x,y) {text}` statement.
 *
 * `canHandle` mirrors card `043`: a pole shape with empty content is a
 * connection dot and stays with `circles`, while a pole shape carrying text is
 * out of scope there and becomes a text node here. A node without an `at`
 * coordinate is not this card's business either - cards `045` handle labels
 * attached to paths.
 */
export const textNodeHandler: CommandHandler = {
	canHandle(cmd: RawCommand): boolean {
		if (!cmd || cmd.kind !== "node") return false

		const { at, content } = parseNodeArguments(cmd.arguments)
		if (at === null) return false

		// `\node[circ] at (1,1){}` belongs to card 043.
		if (hasPoleShape(cmd.options) && content.trim().length === 0) return false

		return true
	},

	handle(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[] {
		if (!cmd || cmd.kind !== "node") return []
		if (!textNodeHandler.canHandle(cmd)) return []

		return standaloneTextNode(cmd, ctx)
	},
}