/**
 * Dispatch: runs the command handlers over the tokenized statements and builds
 * the `ImportResult`.
 *
 * @module import/dispatch
 */

import { applyLabels } from "./commands/labels"
import { bipoleHandler } from "./commands/bipoles"
import { circleHandler } from "./commands/circles"
import { textNodeHandler } from "./commands/textNodes"
import { wireHandler } from "./commands/wires"
import { flushAnchorWarnings, makeAnchorResolver } from "./coords/anchors"
import { splitPath } from "./scanner/statements"
import type { AnchorResolver } from "./types"
import type { BuildContext, CommandHandler, ComponentSaveObject, ImportResult, ImportWarning, RawCommand, TextDoc } from "./types"

/**
 * The handlers, in the order the card fixes: wires, bipoles, poles, text
 * nodes. They are additive — every handler whose `canHandle` accepts the
 * statement contributes its components.
 *
 * @readonly
 */
const handlers: CommandHandler[] = [wireHandler, bipoleHandler, circleHandler, textNodeHandler]

/**
 * Pushes a warning unless an equal `(line, reason)` is already recorded.
 *
 * @param report - the document's warning list
 * @param warning - the warning to record
 */
function pushWarning(report: ImportWarning[], warning: ImportWarning): void {
	const duplicate = report.some((w) => w.line === warning.line && w.reason === warning.reason)
	if (!duplicate) report.push(warning)
}

/**
 * True when the path of a `draw` statement contains a `to` element.
 *
 * A statement that asks for bipoles but produced nothing must stay visible in
 * the report; plain wires and nodes do not get this warning.
 *
 * @param cmd - the statement being processed
 */
const asksForBipoles = (cmd: RawCommand): boolean => splitPath(cmd.arguments).some((el) => el.kind === "to")

/**
 * Matches `\fill (x,y) circle (r)` after the lexer: the arguments hold the
 * coordinate and the radius, nothing else.
 *
 * @readonly
 */
const fillCirclePattern = /^\s*\(\s*([^()]*)\s*\)\s+circle\s+\(\s*([^()]*)\s*\)\s*$/

/**
 * Translates a filled-circle statement into a circ pole node.
 *
 * `\fill (x,y) circle (1.6pt)` marks a junction dot, and the designer models
 * that as the `circ` node symbol (card `043`). The radius is dropped — the
 * designer's pole symbol has a fixed size. Other `\fill` shapes keep the
 * generic `unsupported command` warning.
 *
 * @param cmd - the statement being dispatched
 * @returns a synthetic circ-node command, or `null` when this is not a
 * fill-circle statement
 */
function fillAsPoleDot(cmd: RawCommand): RawCommand | null {
	if (!cmd || cmd.kind !== "unknown") return null
	if (!/^\\fill\b/.test(cmd.source ?? "")) return null

	const match = fillCirclePattern.exec(cmd.arguments ?? "")
	if (!match) return null

	return { kind: "node", options: "circ", arguments: `at (${match[1].trim()}) {}`, line: cmd.line, source: cmd.source }
}

/**
 * Runs every handler over every statement and assembles the components.
 *
 * `ctx.coords` lives for the whole call — names registered by one `\draw`
 * (`name=VT`) are referenced by later ones (`(VT)`), and the anchor resolver
 * is built lazily around that same coordinate context. Warnings share
 * `doc.warnings` with the preprocessing stages and come back as `skipped`,
 * deduplicated per `(line, reason)`. A single bad statement never aborts the
 * file: the per-command catch turns it into one warning.
 *
 * @param commands - the tokenized statements, in document order
 * @param doc - the preprocessed document (settings, colours, warnings)
 * @returns the components plus the shared report
 */
export function buildComponents(commands: RawCommand[], doc: TextDoc): ImportResult {
	const ctx: BuildContext = {
		settings: doc.settings,
		colors: doc.colors,
		report: doc.warnings,
		coords: {
			named: new Map(),
			anchors: null,
			lastPoint: null,
			bipolesLength: doc.settings.bipolesLength,
		},
	}
	// Built lazily: the resolver closes over the coordinate context above.
	ctx.coords.anchors = makeAnchorResolver(ctx.coords) as AnchorResolver

	const components: ComponentSaveObject[] = []

	for (const original of commands) {
		try {
			// `\fill (x,y) circle (r)` is a junction dot in disguise; hand it to
			// the pole handler as the circ node it models.
			const cmd = fillAsPoleDot(original) ?? original

			if (cmd.kind === "unknown") {
				pushWarning(ctx.report, { line: cmd.line, text: cmd.source, reason: "unsupported command" })
				continue
			}

			const produced: ComponentSaveObject[] = []
			for (const handler of handlers) {
				if (handler.canHandle(cmd)) produced.push(...handler.handle(cmd, ctx))
			}

			// Anchor warnings are collected with `line: 0` because the resolver
			// never sees the statement; rewrite to the statement's line.
			for (const warning of flushAnchorWarnings(ctx.coords.anchors)) {
				pushWarning(ctx.report, { ...warning, line: warning.line || cmd.line })
			}

			if (produced.length > 0) components.push(...produced)

			applyLabels(produced, cmd, ctx)

			if (cmd.kind === "draw" && produced.length === 0 && asksForBipoles(cmd)) {
				pushWarning(ctx.report, { line: cmd.line, text: cmd.source, reason: "statement produced no components" })
			}
		} catch {
			pushWarning(ctx.report, { line: cmd.line, text: cmd.source, reason: "statement could not be processed" })
		}
	}

	return {
		components,
		skipped: doc.warnings,
		settings: doc.settings,
		colors: doc.colors,
	}
}
