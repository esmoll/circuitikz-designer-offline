/**
 * LaTeX comments and whitespace, normalised before anything is parsed.
 *
 * Every later stage reports the 1-based `line` of a construct, so this stage
 * must never add or drop a line: a comment is blanked in place instead of
 * cutting the line out of the document.
 *
 * @module import/preprocess/comments
 */

import type { PreprocessStage, TextDoc } from "../types"

/**
 * Finds the first `%` in `line` that really starts a comment.
 *
 * A `%` is a comment unless an odd number of backslashes precedes it, which is
 * what `\%` looks like: one backslash escapes the percent sign itself, while
 * `\\%` is a literal line break followed by a comment.
 *
 * @param line - one physical line, without its newline
 * @returns the index of the comment marker, or `-1` if the line is comment free
 */
function commentStart(line: string): number {
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== "%") continue

		let backslashes = 0
		for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) backslashes++
		if (backslashes % 2 === 0) return i
	}
	return -1
}

/**
 * Collapses runs of spaces and tabs outside of `{...}` and `[...]`.
 *
 * Grouping braces and option brackets carry labels such as `above left`, where
 * the exact spacing is part of the user's intent, so their contents are copied
 * verbatim. A backslash and the character it escapes are always copied as a
 * pair, which keeps `\%`, `\{` and `\}` from being mistaken for syntax.
 *
 * @param line - a line that already had its comment removed
 * @returns the line with single spaces and no trailing whitespace
 */
function collapseWhitespace(line: string): string {
	let out = ""
	let depth = 0

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]

		// an escaped character is data, never structure
		if (ch === "\\") {
			out += ch
			if (i + 1 < line.length) out += line[++i]
			continue
		}

		if (ch === "{" || ch === "[") {
			depth++
			out += ch
			continue
		}

		if (ch === "}" || ch === "]") {
			if (depth > 0) depth--
			out += ch
			continue
		}

		if (ch === " " || ch === "\t") {
			if (depth > 0) {
				out += ch
				continue
			}
			while (i + 1 < line.length && (line[i + 1] === " " || line[i + 1] === "\t")) i++
			out += " "
			continue
		}

		out += ch
	}

	return out.trimEnd()
}

/**
 * Drops the comments and squeezes the whitespace of a single line.
 *
 * @param line - one physical line, without its newline
 * @returns the normalised line, `""` when it held nothing but a comment
 */
function stripLine(line: string): string {
	const cut = commentStart(line)
	return collapseWhitespace(cut === -1 ? line : line.slice(0, cut))
}

/**
 * Removes `%` comments and normalises whitespace, preserving the line count.
 *
 * `doc.colors`, `doc.settings` and `doc.warnings` are passed through untouched:
 * this stage only rewrites the document text.
 *
 * @type {PreprocessStage}
 */
export const stripComments: PreprocessStage = (doc: TextDoc): TextDoc => ({
	...doc,
	text: doc.text
		.split("\n")
		.map((line) => stripLine(line))
		.join("\n"),
})