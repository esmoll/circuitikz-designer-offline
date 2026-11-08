/**
 * Report formatting for the .tex importer.
 *
 * Turns the raw `ImportResult` into the two strings the caller needs: a
 * one-line `summary` for the load modal and one `details` entry per skipped
 * line for the console. The module is a pure function — no `console`, no DOM,
 * no I/O. The caller (`saveController.ts`, card `054`) prints.
 *
 * The summary is English and CLI-safe on purpose: the Windows console runs at
 * cp866, so non-ASCII text belongs in `details` (where it is quoted from the
 * source) and nowhere else.
 *
 * @module import/report
 */

import type { ImportResult, ImportWarning } from "./types"

/** How much of the offending source line `details` keeps. */
const MAX_TEXT = 80

/** Stand-in for warnings that have no source line of their own (`cell.tex`). */
const NO_SOURCE_LINE = "<no source line>"

/** What `formatImportReport` returns: the modal line and the console lines. */
export type ImportReport = {
	/** One line, shown in the load modal, e.g. `imported 40, skipped 2`. */
	summary: string
	/** One entry per skipped line, sorted by line, for the console. */
	details: string[]
}

/**
 * Collapses a source line into a single console-safe row.
 *
 * Newlines and tabs are flattened, so a multi-line statement cannot break the
 * one-warning-one-row shape, and the result is truncated to {@link MAX_TEXT}.
 *
 * @param text - the statement text carried by the warning
 * @returns the flattened, truncated text, or `<no source line>` when empty
 */
function formatText(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim()
	if (!flat) return NO_SOURCE_LINE
	return flat.length > MAX_TEXT ? flat.slice(0, MAX_TEXT).trimEnd() : flat
}

/**
 * The `(line, reason)` identity of a warning — the key duplicates collapse on.
 *
 * The text is deliberately excluded: the same construct on the same line is
 * one problem for the reader even if its arguments differ.
 *
 * @param warning - the warning to key
 */
function warningKey(warning: ImportWarning): string {
	return `${warning.line}\u0000${warning.reason}`
}

/**
 * Groups the warnings by `(line, reason)`, keeping the first text seen and
 * counting the occurrences.
 *
 * @param warnings - the importer's warning list, in discovery order
 * @returns the kept warnings with their occurrence counts
 */
function collapse(warnings: ImportWarning[]): { warning: ImportWarning; count: number }[] {
	const order: string[] = []
	const groups = new Map<string, { warning: ImportWarning; count: number }>()

	for (const warning of warnings) {
		const key = warningKey(warning)
		const group = groups.get(key)
		if (group) {
			group.count++
			continue
		}
		groups.set(key, { warning, count: 1 })
		order.push(key)
	}

	// `Array.prototype.sort` is stable, so equal lines keep their first-seen order.
	return order
		.map((key) => groups.get(key))
		.sort((a, b) => a.warning.line - b.warning.line)
}

/**
 * Formats one warning as `line <n>: <reason> — <text>`, with `(×N)` appended
 * when the same `(line, reason)` was reported more than once.
 *
 * @param warning - the kept warning
 * @param count - how many times it was reported
 */
function formatDetail(warning: ImportWarning, count: number): string {
	const text = formatText(warning.text)
	const suffix = count > 1 ? ` (×${count})` : ""
	return `line ${warning.line}: ${warning.reason} — ${text}${suffix}`
}

/**
 * Formats the importer's result for the user.
 *
 * @param result - the `ImportResult` returned by `texToSaveFile`
 * @returns the modal summary plus the console detail lines
 *
 * @example
 * formatImportReport(texToSaveFile(source, "buck.tex").result)
 * // { summary: "imported 24, skipped 3", details: ["line 13: ...", ...] }
 */
export function formatImportReport(result: ImportResult): ImportReport {
	const components = result.components ? result.components.length : 0
	const warnings = result.skipped || []

	let summary = `imported ${components}, skipped ${warnings.length}`
	if (components === 0 && warnings.length === 0) {
		summary += " (empty document)"
	}

	const details = collapse(warnings).map(({ warning, count }) => formatDetail(warning, count))

	return { summary, details }
}