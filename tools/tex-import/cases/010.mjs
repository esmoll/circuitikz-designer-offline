/**
 * Card 010 - preprocess/comments.ts
 *
 * Comments are removed in place, whitespace outside braces and brackets is
 * squeezed, and the number of lines never changes.
 */

import fs from "node:fs"
import { fileURLToPath } from "node:url"

export const id = "010"

const FIXTURES = fileURLToPath(new URL("../../../tests/fixtures/tex/", import.meta.url))

const SETTINGS = {
	european: true,
	rpvoltages: true,
	bipolesLength: 1,
	inductorStyle: "american",
	defaultLineWidth: null,
	defaultColor: null,
}

const COLORS = { ink: "#1f2a33", grp: "#2e6e8c" }
const WARNINGS = [{ line: 3, text: "earlier stage warning", reason: "test" }]

const makeDoc = (text) => ({ text, colors: COLORS, settings: SETTINGS, warnings: WARNINGS })

const newlineCount = (s) => (s.match(/\n/g) || []).length

/** Mirrors the rule the module implements: an even run of `\` leaves `%` bare. */
const hasBareComment = (line) => {
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== "%") continue
		let backslashes = 0
		for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) backslashes++
		if (backslashes % 2 === 0) return true
	}
	return false
}

export async function run(ctx) {
	const { stripComments } = ctx.require("./../.build/src/scripts/import/preprocess/comments.js")

	/** Strips a string document and returns its text. */
	const strip = (text) => stripComments(makeDoc(text)).text

	const expectText = (input, expected, why) => {
		const actual = strip(input)
		ctx.assert(
			actual === expected,
			`${JSON.stringify(input)} should become ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} (${why})`
		)
	}

	// --- the two anchors from the card -----------------------------------
	expectText("a % b", "a", "a comment is removed, the code stays")
	expectText("50\\% duty", "50\\% duty", "an escaped percent is data, not a comment")

	// --- the corpus example from the card --------------------------------
	expectText(
		"\\draw (0,0) to[L, l=$L_1$, name=L1] (2,0); % inductor",
		"\\draw (0,0) to[L, l=$L_1$, name=L1] (2,0);",
		"the buck.tex inductor line"
	)

	// --- escaped vs unescaped markers ------------------------------------
	expectText("\\\\% x", "\\\\", "an even run of backslashes leaves % unescaped, so it starts a comment")
	expectText("\\\\\\% x", "\\\\\\% x", "an odd run of backslashes escapes the percent")
	expectText("% whole line", "", "a comment-only line becomes an empty line")
	expectText("  % indented", "", "indentation before the comment goes too")

	// --- whitespace -------------------------------------------------------
	expectText("\\draw  (0,0)   --   (1,0);", "\\draw (0,0) -- (1,0);", "runs of spaces collapse outside groups")
	expectText("a\t\tb", "a b", "tabs collapse as well")
	expectText("\\node[above left]{$R_1  =  5$};", "\\node[above left]{$R_1  =  5$};", "bracket and brace contents are verbatim")
	expectText("\\node[  circ  ] {}", "\\node[  circ  ] {}", "spacing inside brackets survives")
	expectText("{x}   {y}", "{x} {y}", "collapse resumes after a group closes")
	expectText("abc   \t ", "abc", "trailing whitespace is trimmed")
	expectText("   abc", " abc", "leading whitespace collapses to one space")

	// --- line count -------------------------------------------------------
	const multi = "one % comment\ntwo\n% three\nfour % x\n"
	const multiOut = strip(multi)
	ctx.assert(newlineCount(multiOut) === newlineCount(multi), `newlines ${newlineCount(multiOut)}, expected ${newlineCount(multi)} (a comment must not delete a line)`)
	ctx.assert(multiOut.split("\n").length === multi.split("\n").length, "the line count changed")
	ctx.assert(multiOut.split("\n")[2] === "", `the comment-only line should be empty, got ${JSON.stringify(multiOut.split("\n")[2])}`)
	ctx.assert(multiOut.split("\n")[0] === "one", `first line should lose the comment, got ${JSON.stringify(multiOut.split("\n")[0])}`)

	// CRLF input keeps one newline per line
	const crlf = "a\r\nb % c\r\n"
	ctx.assert(newlineCount(strip(crlf)) === newlineCount(crlf), "CRLF input lost a line break")

	// --- empty and degenerate input --------------------------------------
	expectText("", "", "empty document")
	expectText("\n\n", "\n\n", "blank lines survive")

	// --- idempotence ------------------------------------------------------
	const once = strip("\\draw (0,0) to[L, l=$L_1$] (1,0); % note")
	ctx.assert(strip(once) === once, "a second pass must not change the text")

	// --- pass-through and purity -----------------------------------------
	const input = makeDoc("a % b")
	const out = stripComments(input)
	ctx.assert(input.text === "a % b", "the input document was mutated")
	ctx.assert(out.colors === COLORS, "colors must be passed through by reference")
	ctx.assert(out.settings === SETTINGS, "settings must be passed through by reference")
	ctx.assert(out.warnings === WARNINGS, "warnings must be passed through by reference")
	ctx.assert(out !== input, "the stage must return a new document object")

	// --- the real corpus --------------------------------------------------
	const files = fs
		.readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".tex"))
		.sort()
	ctx.assert(files.length >= 24, `expected the 24-file corpus, found ${files.length}`)

	for (const name of files) {
		const source = fs.readFileSync(FIXTURES + name, "utf8")
		const stripped = strip(source)

		ctx.assert(
			newlineCount(stripped) === newlineCount(source),
			`${name}: ${newlineCount(stripped)} newlines, expected ${newlineCount(source)}`
		)
		ctx.assert(/\\draw/.test(stripped), `${name}: no \\draw left after the stage`)

		const leftovers = stripped.split("\n").filter(hasBareComment)
		ctx.assert(leftovers.length === 0, `${name}: comment left behind - ${JSON.stringify(leftovers[0])}`)

		if (source.includes("\\%")) {
			ctx.assert(stripped.includes("\\%"), `${name}: an escaped percent was eaten`)
		}

		// the corpus is UTF-8 with Cyrillic labels; the stage must not mangle bytes
		ctx.assert(!stripped.includes("\uFFFD"), `${name}: the text picked up U+FFFD (encoding damage)`)
		for (const word of stripped.match(/[\u0400-\u04FF]{2,}/g) || []) {
			ctx.assert(source.includes(word), `${name}: Cyrillic word ${JSON.stringify(word)} is not in the source`)
		}
	}
}