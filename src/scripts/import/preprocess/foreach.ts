import type { PreprocessStage } from "../types"

// Index just after the `}` closing the group whose `{` sits at `open`, or -1
// when the group is unterminated. Escape pairs (`\{`, `\}`) do not count.
function matchBraceGroup(text: string, open: number): number {
	let depth = 0
	for (let i = open; i < text.length; i++) {
		const ch = text[i]
		if (ch === "\\" && i + 1 < text.length) {
			i++
			continue
		}
		if (ch === "{") depth++
		else if (ch === "}") {
			depth--
			if (depth === 0) return i + 1
		}
	}
	return -1
}

// Split on `sep` occurring at brace depth zero; `\x` pairs pass through untouched.
function splitTopLevel(source: string, sep: string): string[] {
	const parts: string[] = []
	let depth = 0
	let current = ""
	for (let i = 0; i < source.length; i++) {
		const ch = source[i]
		if (ch === "\\" && i + 1 < source.length) {
			current += ch + source[i + 1]
			i++
			continue
		}
		if (ch === "{") depth++
		else if (ch === "}") depth--
		if (depth === 0 && ch === sep) {
			parts.push(current)
			current = ""
		} else {
			current += ch
		}
	}
	parts.push(current)
	return parts
}

function skipWhitespace(text: string, i: number): number {
	while (i < text.length && /\s/.test(text[i])) i++
	return i
}

// The control word after a backslash, e.g. `\xc` → "xc", or null.
function readControlWord(text: string, backslash: number): { name: string; end: number } | null {
	let end = backslash + 1
	while (end < text.length && /[A-Za-z]/.test(text[end])) end++
	if (end === backslash + 1) return null
	return { name: text.slice(backslash + 1, end), end }
}

function lineAt(text: string, index: number): number {
	let n = 1
	for (let i = 0; i < index; i++) if (text[i] === "\n") n++
	return n
}

type ParsedForeach =
	| { ok: true; names: string[]; listOpen: number; listClose: number; bodyOpen: number; bodyClose: number }
	| { ok: false; reason: string }

// \foreach \a/\b/… in {list}{body} — returns the span of the whole construct.
function parseForeach(text: string, at: number): ParsedForeach {
	const fail = (reason: string): ParsedForeach => ({ ok: false, reason })
	let i = skipWhitespace(text, at + "\\foreach".length)
	const names: string[] = []
	for (;;) {
		if (text[i] !== "\\") return fail("no control variable after \\foreach")
		const word = readControlWord(text, i)
		if (!word) return fail("malformed control variable")
		names.push(word.name)
		i = skipWhitespace(text, word.end)
		if (text[i] === "/") {
			i = skipWhitespace(text, i + 1)
			continue
		}
		break
	}
	if (text.slice(i, i + 2) !== "in") return fail("\\foreach without `in`")
	i = skipWhitespace(text, i + 2)
	if (text[i] !== "{") return fail("\\foreach without a `{list}`")
	const listOpen = i
	const listClose = matchBraceGroup(text, listOpen)
	if (listClose < 0) return fail("unterminated \\foreach list")
	i = skipWhitespace(text, listClose)
	if (text[i] !== "{") return fail("\\foreach without a `{body}`")
	const bodyOpen = i
	const bodyClose = matchBraceGroup(text, bodyOpen)
	if (bodyClose < 0) return fail("unterminated \\foreach body")
	return { ok: true, names, listOpen, listClose, bodyOpen, bodyClose }
}

// "1,...,5" — a whole-list range: ends parsed, integers, step 1. Null otherwise.
function expandRange(listContent: string): string[] | null {
	const m = /^\s*(-?\d+)\s*,\s*\.\.\.\s*,\s*(-?\d+)\s*$/.exec(listContent)
	if (!m) return null
	const out: string[] = []
	const from = Number(m[1])
	const to = Number(m[2])
	const step = from <= to ? 1 : -1
	for (let v = from; v !== to + step; v += step) out.push(String(v))
	return out
}

// Textual substitution of the control words, longest name first, always on a
// word boundary: `\a` is replaced, `\ab` is not.
function substitute(body: string, names: string[], values: string[]): string {
	let out = body
	const pairs = names
		.map((name, index) => ({ name, value: values[index] }))
		.sort((a, b) => b.name.length - a.name.length)
	for (const { name, value } of pairs) {
		out = out.replace(new RegExp("(?<!\\\\)\\" + "\\" + name + "(?![A-Za-z])", "g"), () => value)
	}
	return out
}

export const expandForeach: PreprocessStage = (doc) => {
	const original = doc.text
	const linesBefore = original.split("\n").length
	let text = original
	let searchFrom = 0
	let expanded = false

	for (;;) {
		const at = text.indexOf("\\foreach", searchFrom)
		if (at < 0) break
		const parsed = parseForeach(text, at)
		if (!parsed.ok) {
			doc.warnings.push({ line: lineAt(text, at), text: "\\foreach", reason: `${parsed.reason}; left unexpanded` })
			searchFrom = at + "\\foreach".length
			continue
		}
		const body = text.slice(parsed.bodyOpen + 1, parsed.bodyClose - 1)
		if (body.includes("\\foreach")) {
			doc.warnings.push({
				line: lineAt(text, at),
				text: "\\foreach",
				reason: "nested loops are not supported; left unexpanded",
			})
			searchFrom = parsed.bodyClose
			continue
		}

		const listContent = text.slice(parsed.listOpen + 1, parsed.listClose - 1)
		const parts: string[] = []
		let keepUnexpanded = false
		if (listContent.includes("...")) {
			// A range spans the whole list: {1,...,5}. Only a single integer
			// variable can take it.
			if (parsed.names.length !== 1) {
				doc.warnings.push({
					line: lineAt(text, at),
					text: listContent.trim(),
					reason: "range list with multiple loop variables is not supported; left unexpanded",
				})
				keepUnexpanded = true
			} else {
				const values = expandRange(listContent)
				if (!values) {
					doc.warnings.push({
						line: lineAt(text, at),
						text: listContent.trim(),
						reason: "non-integer range cannot be expanded; left unexpanded",
					})
					keepUnexpanded = true
				} else {
					for (const value of values) parts.push(substitute(body, parsed.names, [value]))
				}
			}
		} else {
			for (const raw of splitTopLevel(listContent, ",")) {
				const item = raw.trim()
				if (!item) continue
				const values = item.split("/").map((v) => v.trim())
				if (values.length < parsed.names.length) {
					doc.warnings.push({
						line: lineAt(text, at),
						text: item,
						reason: `fewer values than the ${parsed.names.length} loop variables; item skipped`,
					})
					continue
				}
				parts.push(substitute(body, parsed.names, values))
			}
		}
		if (keepUnexpanded) {
			searchFrom = parsed.bodyClose
			continue
		}
		const replacement = parts.join("")
		text = text.slice(0, at) + replacement + text.slice(parsed.bodyClose)
		expanded = true
		// The replacement holds no `\foreach` (nested bodies are rejected above),
		// so scanning resumes after it.
		searchFrom = at + replacement.length
	}

	if (expanded && text.split("\n").length !== linesBefore) {
		doc.warnings.push({
			line: 1,
			text: "\\foreach",
			reason: "foreach expansion changed the line count; line numbers after the first loop are approximate",
		})
	}
	doc.text = text
	return doc
}
