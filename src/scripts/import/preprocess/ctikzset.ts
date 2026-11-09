import type { PreprocessStage } from "../types"

// TeX lengths are normalised to centimetres; 1pt = 1/72.27 in (TeX point).
const UNIT_TO_CM: Record<string, number> = {
	cm: 1,
	mm: 0.1,
	pt: 2.54 / 72.27,
	in: 2.54,
}

// Split on `sep` occurring at brace/bracket depth zero; `\x` pairs pass through untouched.
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
		if (ch === "{" || ch === "[") depth++
		else if (ch === "}" || ch === "]") depth--
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

// Index just after the `}` closing the group whose `{` sits at `open`, or -1.
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

// Index just after the `]` closing the option list whose `[` sits at `open`;
// `]` characters nested inside braces do not close it. Returns -1 when unterminated.
function matchBracketGroup(text: string, open: number): number {
	let braceDepth = 0
	for (let i = open; i < text.length; i++) {
		const ch = text[i]
		if (ch === "\\" && i + 1 < text.length) {
			i++
			continue
		}
		if (ch === "{") braceDepth++
		else if (ch === "}") braceDepth--
		else if (ch === "]" && braceDepth === 0) return i + 1
	}
	return -1
}

function parseLengthCm(value: string): number | null {
	const m = /^([0-9]*\.?[0-9]+)\s*([a-zA-Z]+)$/.exec(value)
	if (!m) return null
	const factor = UNIT_TO_CM[m[2].toLowerCase()]
	if (factor === undefined) return null
	return Number(m[1]) * factor
}

// Remove consumed spans but keep their newlines, so line numbers stay stable.
// The three passes collect spans out of document order, so sort first: blanking
// right-to-left only keeps earlier offsets valid on a sorted list.
function blankSpans(text: string, spans: Array<[number, number]>): string {
	const ordered = [...spans].sort((a, b) => a[0] - b[0])
	let out = text
	for (let i = ordered.length - 1; i >= 0; i--) {
		const [start, end] = ordered[i]
		const kept = out.slice(start, end)
		let newlines = 0
		for (const ch of kept) if (ch === "\n") newlines++
		out = out.slice(0, start) + "\n".repeat(newlines) + out.slice(end)
	}
	return out
}

export const applySettings: PreprocessStage = (doc) => {
	const text = doc.text
	const spans: Array<[number, number]> = []
	const warned = new Set<string>()
	const warn = (line: number, message: string, reason: string) => {
		const id = `${message}\u0000${reason}`
		if (warned.has(id)) return
		warned.add(id)
		doc.warnings.push({ line, text: message, reason })
	}
	const lineAt = (index: number) => {
		let n = 1
		for (let i = 0; i < index; i++) if (text[i] === "\n") n++
		return n
	}

	// \usepackage[european, RPvoltages]{circuitikz} — symbol flavour and voltage style.
	const useRe = /\\usepackage\s*(?:\[([^\]]*)\])?\s*\{circuitikz\}/g
	for (let m = useRe.exec(text); m !== null; m = useRe.exec(text)) {
		for (const raw of m[1] !== undefined ? m[1].split(",") : []) {
			const option = raw.trim()
			if (option === "european") doc.settings.european = true
			else if (option === "RPvoltages") doc.settings.rpvoltages = true
		}
		spans.push([m.index, m.index + m[0].length])
	}

	// \ctikzset{key=value, ...} — global circuitikz style. Commas inside braces
	// do not split; settings accumulate and the last value wins.
	const setRe = /\\ctikzset\s*\{/g
	for (let m = setRe.exec(text); m !== null; m = setRe.exec(text)) {
		const open = m.index + m[0].length - 1
		const close = matchBraceGroup(text, open)
		if (close < 0) continue
		const line = lineAt(m.index)
		for (const raw of splitTopLevel(text.slice(open + 1, close - 1), ",")) {
			const item = raw.trim()
			if (!item) continue
			const eq = item.indexOf("=")
			const key = eq < 0 ? item : item.slice(0, eq).trim()
			const value = eq < 0 ? "" : item.slice(eq + 1).trim()
			if (key === "bipoles/length") {
				const cm = parseLengthCm(value)
				if (cm === null) warn(line, `bipoles/length=${value}`, "unparsable length value")
				else doc.settings.bipolesLength = cm
			} else if (key === "inductor") {
				if (value === "american" || value === "european") doc.settings.inductorStyle = value
				else warn(line, `inductor=${value}`, "unknown inductor style")
			} else if (key !== "diodes/fill" && key !== "diodes/empty" && key !== "bipoles/thickness") {
				// diodes/fill and diodes/empty are colour references — the mapping cards handle them.
				// bipoles/thickness scales the bipole line width relatively; the frozen
				// GlobalSettings has no field for it, so it is recognised and dropped,
				// like the colour keys above (review round on card 013).
				warn(line, key, "unknown ctikzset key")
			}
		}
		spans.push([m.index, close])
	}

	// \begin{tikzpicture}[...] — default line width and colour; other keys are ignored silently.
	const picRe = /\\begin\{tikzpicture\}\s*\[/g
	for (let m = picRe.exec(text); m !== null; m = picRe.exec(text)) {
		const open = m.index + m[0].length - 1
		const close = matchBracketGroup(text, open)
		if (close < 0) continue
		for (const raw of splitTopLevel(text.slice(open + 1, close - 1), ",")) {
			const item = raw.trim()
			const eq = item.indexOf("=")
			if (eq < 0) continue
			const key = item.slice(0, eq).trim()
			const value = item.slice(eq + 1).trim()
			if (key === "line width") doc.settings.defaultLineWidth = value
			else if (key === "color") doc.settings.defaultColor = value
		}
		spans.push([m.index, close])
	}

	doc.text = blankSpans(text, spans)
	return doc
}
