import type { RawCommand, TextDoc } from "../types"

// Commands that may begin a path statement. \draw and \node get their own kind;
// every other starter is reported as "unknown" — card 021 and the commands/*
// handlers decide what to do with those.
const STARTERS = new Set(["draw", "node", "path", "fill", "filldraw", "coordinate", "foreach"])

function kindOf(name: string): RawCommand["kind"] {
	if (name === "draw") return "draw"
	if (name === "node") return "node"
	return "unknown"
}

// The command word after a backslash, or null when the backslash is not
// followed by letters (`\%`, `\\`, `\{` are escape pairs, not commands).
function readName(text: string, backslash: number): { name: string; end: number } | null {
	let end = backslash + 1
	while (end < text.length && /[A-Za-z]/.test(text[end])) end++
	if (end === backslash + 1) return null
	return { name: text.slice(backslash + 1, end), end }
}

// Index just after the `]` closing the option list opened at `open`, or -1.
// Braces may nest inside options (`l={$R_1$}`); a `]` inside them does not close.
function matchBracketGroup(text: string, open: number): number {
	let braces = 0
	for (let k = open; k < text.length; k++) {
		const ch = text[k]
		if (ch === "\\") {
			k++
			continue
		}
		if (ch === "{") braces++
		else if (ch === "}") braces--
		else if (ch === "]" && braces === 0) return k + 1
	}
	return -1
}

export function tokenize(doc: TextDoc): RawCommand[] {
	const text = doc.text
	const commands: RawCommand[] = []
	let line = 1
	let i = 0

	// The statement currently being scanned; start < 0 means no statement is open.
	let start = -1
	let startLine = 1
	let starterName = ""
	let options: string | null = null
	let argStart = -1
	// Nesting inside the arguments, all independent: `;` ends the statement only
	// at depth 0 outside math.
	let braces = 0
	let brackets = 0
	let math = false

	const emit = (end: number, bySemicolon: boolean) => {
		const source = text.slice(start, end).trim()
		if (source.length > 0) {
			commands.push({
				kind: bySemicolon ? kindOf(starterName) : "unknown",
				options: options ?? "",
				arguments: argStart >= 0 ? text.slice(argStart, end).trim() : "",
				line: startLine,
				source,
			})
		}
		start = -1
	}

	while (i < text.length) {
		const ch = text[i]
		if (ch === "\n") {
			line++
			i++
			continue
		}
		if (start < 0) {
			// Outside a statement: ordinary text until a starter command.
			if (ch !== "\\") {
				i++
				continue
			}
			const name = readName(text, i)
			if (!name) {
				i += 2 // escape pair
				if (text[i - 1] === "\n") line++
				continue
			}
			if (!STARTERS.has(name.name)) {
				i = name.end // \documentclass, \end, … — ordinary text
				continue
			}
			start = i
			startLine = line
			starterName = name.name
			options = null
			braces = 0
			brackets = 0
			math = false
			let j = name.end
			while (j < text.length && (text[j] === " " || text[j] === "\t" || text[j] === "\n")) {
				if (text[j] === "\n") line++
				j++
			}
			if (j < text.length && text[j] === "[") {
				const close = matchBracketGroup(text, j)
				if (close >= 0) {
					options = text.slice(j + 1, close - 1).trim()
					argStart = close
					i = close
					continue
				}
			}
			argStart = name.end
			i = name.end
			continue
		}

		// Inside a statement: scan the arguments.
		if (ch === "\\") {
			const name = readName(text, i)
			if (name && STARTERS.has(name.name) && !math) {
				// A new statement begins here — the current one ends without `;`
				// (\foreach bodies nest whole \draw/\node statements).
				emit(i, false)
				continue
			}
			if (name) {
				i = name.end // \text, \frac, … — part of the arguments
				continue
			}
			i += 2 // escape pair: \\, \%, \;, \{
			if (text[i - 1] === "\n") line++
			continue
		}
		if (ch === "$") {
			math = !math
			i++
			continue
		}
		if (ch === "{") {
			braces++
			i++
			continue
		}
		if (ch === "}") {
			braces--
			i++
			continue
		}
		if (ch === "[") {
			brackets++
			i++
			continue
		}
		if (ch === "]") {
			brackets--
			i++
			continue
		}
		if (ch === ";" && braces === 0 && brackets === 0 && !math) {
			emit(i, true)
			i++
			continue
		}
		i++
	}
	if (start >= 0) emit(text.length, false) // unterminated tail — do not throw
	return commands
}
