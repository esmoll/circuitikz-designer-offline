/**
 * Bipole labels: `l=` and `l_=` options of a `to[...]` become `PathLabel`s on
 * the path components the other handlers emitted.
 *
 * @module import/commands/labels
 */

import type { PathSymbolSaveObject } from "../../components/pathSymbolComponent"
import type { BuildContext, ComponentSaveObject, RawCommand } from "../types"
import { splitPath } from "../scanner/statements"

/**
 * Warning reason for a `l2=` option. It is recorded once per file, so
 * `applyLabels` skips it when the report already carries it.
 *
 * @readonly
 */
const secondLabelReason = "second label not imported"

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
 * Collapses whitespace so `l= {$R_1$}` and `l={$R_1$}` read the same.
 *
 * @param token - one option token
 * @returns the token without surrounding blanks and with single inner spaces
 */
function normalize(token: string): string {
	return token.trim().replace(/\s+/g, " ")
}

/**
 * True when every `{` in the text has its `}` (escape-aware).
 *
 * A label value with unbalanced braces is malformed LaTeX; attaching it would
 * hand MathJax broken source, so the caller drops it instead.
 *
 * @param text - the candidate label value
 */
function balancedBraces(text: string): boolean {
	let depth = 0
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i]
		if (ch === "\\") {
			i += 1
			continue
		}
		if (ch === "{") depth += 1
		else if (ch === "}") depth -= 1
	}
	return depth === 0
}

/**
 * Cleans a label value: trims, strips exactly one brace layer (only when the
 * opening brace closes at the very end), trims again, turns `~` into a space
 * and rejects unbalanced input.
 *
 * @param raw - the text after the `=`, e.g. ` {$R_1$}`
 * @returns the label source as written, or `""` when the value is malformed
 */
function cleanLabel(raw: string): string {
	let value = raw.trim()
	if (value.startsWith("{")) {
		let depth = 0
		let closesAtEnd = false
		for (let i = 0; i < value.length; i += 1) {
			const ch = value[i]
			if (ch === "\\" && i + 1 < value.length) {
				i += 1
				continue
			}
			if (ch === "{") depth += 1
			else if (ch === "}") {
				depth -= 1
				if (depth === 0) {
					closesAtEnd = i === value.length - 1
					break
				}
			}
		}
		if (depth === 0 && closesAtEnd) value = value.slice(1, -1).trim()
	}
	if (!balancedBraces(value)) return ""
	return value.replace(/~/g, " ")
}

/**
 * True for the `l=` key (the label on the default side).
 *
 * @param key - the text before `=`
 */
const isPlainLabelKey = (key: string): boolean => key === "l"

/**
 * True for `l_=` and its voltage-sign spellings `l_<=`, `l_>=` — the label on
 * the other side of the bipole.
 *
 * @param key - the text before `=`
 */
const isOtherSideLabelKey = (key: string): boolean => /^l_[<>]?$/.test(key)

/**
 * True for `l2=` and `l2_=` — the second label, out of scope.
 *
 * @param key - the text before `=`
 */
const isSecondLabelKey = (key: string): boolean => /^l2(_[<>]?)?$/.test(key)

/**
 * Reads the label of one `to[...]` option list.
 *
 * @param options - the text between the option brackets
 * @param ctx - the build context whose report receives the `l2` warning
 * @param cmd - the statement being processed, for the warning's line
 * @returns `{ value, otherSide }`, or `null` when the `to` carries no label
 */
function labelOf(
	options: string,
	ctx: BuildContext,
	cmd: RawCommand
): { value: string; otherSide: boolean } | null {
	let label: { value: string; otherSide: boolean } | null = null
	let sawSecond = false

	for (const token of splitOptions(options)) {
		const text = normalize(token)
		const equals = text.indexOf("=")
		if (equals === -1) continue

		const key = text.slice(0, equals).trim()
		const raw = text.slice(equals + 1)

		if (isPlainLabelKey(key)) {
			const value = cleanLabel(raw)
			if (value.length > 0) label = { value, otherSide: false }
		} else if (isOtherSideLabelKey(key)) {
			const value = cleanLabel(raw)
			if (value.length > 0) label = { value, otherSide: true }
		} else if (isSecondLabelKey(key)) {
			sawSecond = true
		}

		// `v=`, `i=`, `name=`, colours and plain style words are not labels.
	}

	if (sawSecond && !ctx.report.some((w) => w.reason === secondLabelReason)) {
		ctx.report.push({ line: cmd.line, text: cmd.source, reason: secondLabelReason })
	}

	return label
}

/**
 * Attaches `l=` / `l_=` labels to the path components of one `\draw`.
 *
 * This is a post-processing hook, not a `CommandHandler`: dispatch calls it
 * with the components the other handlers produced for the same command. The
 * n-th `to[...]` element pairs with the n-th component whose `type` is
 * `"path"`; when the counts differ, one warning is recorded and nothing is
 * attached. An existing label is never overwritten, and the function never
 * throws.
 *
 * @param components - what the handlers emitted for this command
 * @param cmd - the statement being processed
 * @param ctx - the build context carrying the report
 */
export function applyLabels(
	components: ComponentSaveObject[],
	cmd: RawCommand,
	ctx: BuildContext
): void {
	const tos = splitPath(cmd.arguments).filter((el) => el.kind === "to")
	const paths = components.filter((c) => c.type === "path")

	if (tos.length !== paths.length) {
		ctx.report.push({
			line: cmd.line,
			text: cmd.source,
			reason: `label pairing failed: ${tos.length} to-elements vs ${paths.length} path components; labels skipped`,
		})
		return
	}

	for (let i = 0; i < tos.length; i++) {
		const label = labelOf(tos[i].options, ctx, cmd)
		if (!label) continue

		const component = paths[i] as PathSymbolSaveObject
		if (component.label) continue // never overwrite

		component.label = label
	}
}
