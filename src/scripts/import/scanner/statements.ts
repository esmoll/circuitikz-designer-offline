/**
 * Path statements: split the arguments of a `\draw` into path elements.
 *
 * This is the boundary between "characters" and "circuit": the result is an
 * ordered list of coordinates, operators, `to[...]` segments and trailing
 * nodes. Nothing is interpreted here - coordinates stay raw text and are handed
 * to `coords/*` by the command handlers.
 *
 * @module import/scanner/statements
 */

/**
 * One element of a path, in source order.
 *
 * - `coord` - `(1.6,3.4)`, `++(0,-0.5)`, `$(A)+(0,1)$`, kept verbatim;
 * - `op` - a path operator (`--`, `-|`, `|-`) or an unknown token the caller
 *   should warn about;
 * - `to` - `to[<options>]`, `options` without the brackets;
 * - `node` - a trailing `node[<options>] at <coord> {<content>}`.
 *
 * `options` are stored without their surrounding brackets. `at` is only
 * present when the node carries an explicit position, and keeps the
 * parentheses: `"(1,2)"`. `content` is the brace content with the braces
 * stripped.
 */
export type PathElement =
	| { kind: "coord"; text: string }
	| { kind: "op"; text: string }
	| { kind: "to"; options: string }
	| { kind: "node"; options: string; at?: string; content: string }

/**
 * A path operator: `--`, `-|` or `|-`.
 *
 * @readonly
 */
const operators = ["--", "-|", "|-"]

/**
 * Characters that may not appear inside an unknown token.
 *
 * @readonly
 */
const delimiters = "()[]{}"

/**
 * True for TikZ-insignificant whitespace.
 *
 * @param ch - a single character
 * @returns whether the character is whitespace
 */
function isSpace(ch: string): boolean {
	return ch === " " || ch === "\t" || ch === "\r" || ch === "\n"
}

/**
 * Advances past whitespace.
 *
 * @param text - the path argument
 * @param index - where to start
 * @returns the first index that is not whitespace, or `text.length`
 */
function skipSpace(text: string, index: number): number {
	let i = index
	while (i < text.length && isSpace(text[i])) i += 1
	return i
}

/**
 * Finds the index just after the bracket that closes the one at `start`.
 *
 * All three bracket kinds are tracked on one stack, so `[L, l={$L_1$}]` and
 * `node[left] {$\frac{a}{b}$}` do not end early. Backslash escapes are skipped,
 * so `\{` is literal. Returns `-1` for unterminated or mismatched input.
 *
 * @param text - the path argument
 * @param start - index of an opening `(`, `[` or `{`
 * @returns the index just after the matching closer, or `-1`
 */
function findClosing(text: string, start: number): number {
	const stack: string[] = []

	for (let i = start; i < text.length; i += 1) {
		const ch = text[i]

		if (ch === "\\") {
			i += 1
			continue
		}

		if (ch === "(") stack.push(")")
		else if (ch === "[") stack.push("]")
		else if (ch === "{") stack.push("}")
		else if (ch === ")" || ch === "]" || ch === "}") {
			if (stack[stack.length - 1] !== ch) return -1
			stack.pop()
			if (stack.length === 0) return i + 1
		}
	}

	return -1
}

/**
 * Reads a coordinate beginning at `index` and returns the index after it.
 *
 * Coordinates are `(...)`, `++(...)`, `+(...)` and `$(...)$`; the text is
 * returned as-is and never interpreted. Unterminated input swallows the rest of
 * the argument instead of throwing.
 *
 * @param text - the path argument
 * @param index - a non-whitespace character
 * @returns the end index, or `-1` when `index` is not a coordinate start
 */
function readCoord(text: string, index: number): number {
	if (text[index] === "$") {
		if (text[index + 1] !== "(") return -1
		for (let i = index + 1; i < text.length; i += 1) {
			if (text[i] === "\\") {
				i += 1
				continue
			}
			if (text[i] === "$") return i + 1
		}
		return text.length
	}

	const prefix = text.startsWith("++", index) ? 2 : text[index] === "+" ? 1 : 0
	if (text[index + prefix] !== "(") return -1

	const close = findClosing(text, index + prefix)
	return close === -1 ? text.length : close
}

/**
 * True when `index` starts the word `word` and is not part of a longer word.
 *
 * @param text - the path argument
 * @param index - candidate start
 * @param word - e.g. `to` or `node`
 * @returns whether a standalone `word` starts here
 */
function startsWord(text: string, index: number, word: string): boolean {
	if (!text.startsWith(word, index)) return false
	const after = text[index + word.length]
	return after === undefined || !/[A-Za-z0-9]/.test(after)
}

/**
 * Splits the argument of a `\draw` into path elements.
 *
 * Left to right, whitespace-insensitive, balanced-aware. Unknown tokens come
 * back as `{ kind: "op", text }` so the caller can record a warning; this
 * function never throws.
 *
 * @param arguments_ - the path text, e.g. `(0,0) to[L, name=L1] (2,0)`
 * @returns the elements in source order
 */
export function splitPath(arguments_: string): PathElement[] {
	const text = typeof arguments_ === "string" ? arguments_ : ""
	const elements: PathElement[] = []
	let i = 0

	while (i < text.length) {
		i = skipSpace(text, i)
		if (i >= text.length) break

		const coordEnd = readCoord(text, i)
		if (coordEnd !== -1) {
			elements.push({ kind: "coord", text: text.slice(i, coordEnd) })
			i = coordEnd
			continue
		}

		const operator = operators.find((op) => text.startsWith(op, i))
		if (operator !== undefined) {
			elements.push({ kind: "op", text: operator })
			i += operator.length
			continue
		}

		if (startsWord(text, i, "to")) {
			let options = ""
			let next = i + 2
			const bracket = skipSpace(text, next)

			if (text[bracket] === "[") {
				const close = findClosing(text, bracket)
				if (close === -1) {
					// Unterminated options: keep the rest, never throw.
					elements.push({ kind: "to", options: text.slice(bracket + 1) })
					return elements
				}
				options = text.slice(bracket + 1, close - 1)
				next = close
			}

			elements.push({ kind: "to", options })
			i = next
			continue
		}

		if (startsWord(text, i, "node")) {
			let next = i + 4
			let options = ""
			let at: string | undefined

			const bracket = skipSpace(text, next)
			if (text[bracket] === "[") {
				const close = findClosing(text, bracket)
				if (close === -1) {
					// Unterminated options: keep the rest, never throw.
					elements.push({ kind: "node", options: text.slice(bracket + 1), content: "" })
					return elements
				}
				options = text.slice(bracket + 1, close - 1)
				next = close
			}

			if (startsWord(text, skipSpace(text, next), "at")) {
				const position = skipSpace(text, skipSpace(text, next) + 2)
				const positionEnd = readCoord(text, position)
				if (positionEnd !== -1) {
					at = text.slice(position, positionEnd)
					next = positionEnd
				}
			}

			const brace = skipSpace(text, next)
			if (text[brace] === "{") {
				const close = findClosing(text, brace)
				if (close === -1) {
					// Unterminated content: keep the rest, never throw.
					elements.push({ kind: "node", options, at, content: text.slice(brace + 1) })
					return elements
				}
				elements.push({ kind: "node", options, at, content: text.slice(brace + 1, close - 1) })
				i = close
				continue
			}

			elements.push({ kind: "node", options, at, content: "" })
			i = brace
			continue
		}

		// Unknown token: report it and let the caller warn.
		let end = i
		while (end < text.length) {
			const ch = text[end]
			if (isSpace(ch) || delimiters.includes(ch) || ch === "$") break
			if (ch === "-" && (text[end + 1] === "-" || text[end + 1] === "|")) break
			if (ch === "|" && text[end + 1] === "-") break
			end += 1
		}
		if (end === i) end = i + 1

		elements.push({ kind: "op", text: text.slice(i, end) })
		i = end
	}

	return elements
}