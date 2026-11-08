/**
 * `\definecolor` declarations, collected into a CSS colour map.
 *
 * Hand-written documents paint their elements with named colours:
 *
 * ```latex
 * \definecolor{ink}{RGB}{31,42,51}
 * \definecolor{grp}{HTML}{1F2A33}
 * \definecolor{acc}{rgb}{0.12,0.16,0.20}
 * ```
 *
 * Later stages apply them by name (`color=ink`, `draw=grp`, `text=grp`), so
 * every declaration is converted to a lowercase `#rrggbb` string and removed
 * from the document text. The line count is preserved, because every warning
 * in the pipeline refers to the 1-based line of the original file.
 *
 * @module import/preprocess/colors
 */

import type { ImportWarning, PreprocessStage, TextDoc } from "../types"

/** A channel triple in the 0–255 range, ready to be printed as hex. */
type Channels = [number, number, number]

/** Result of converting a `{model}{spec}` pair into a CSS colour. */
type Conversion = { css: string } | { reason: string }

/** Plain decimal number, with an optional sign and a bare leading dot. */
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/** Start of a declaration; `\definecolorx` must not match. */
const DECLARATION = /\\definecolor(?![A-Za-z@])\s*\{/g

/**
 * Formats three channels as `#rrggbb`, lowercase.
 *
 * @param channels - red, green and blue in the 0–255 range
 * @returns the CSS colour, always seven characters long
 */
function toCss([r, g, b]: Channels): string {
	return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/** Number of newlines before `index`, plus one — i.e. the 1-based line number. */
function lineAt(text: string, index: number): number {
	let line = 1
	for (let i = 0; i < index; i++) if (text[i] === "\n") line++
	return line
}

/**
 * Reads a `{...}` group, tolerating whitespace before the opening brace and
 * nested braces inside it.
 *
 * @param text - the document text
 * @param from - index to start searching from
 * @returns the group contents without the braces and the index just past the
 *   closing brace, or `null` when no group starts there
 */
function readGroup(text: string, from: number): { value: string; end: number } | null {
	let start = from
	while (start < text.length && /\s/.test(text[start])) start++
	if (text[start] !== "{") return null

	let depth = 0
	for (let i = start; i < text.length; i++) {
		const ch = text[i]
		if (ch === "\\" && i + 1 < text.length) {
			i++
			continue
		}
		if (ch === "{") depth++
		else if (ch === "}") {
			depth--
			if (depth === 0) return { value: text.slice(start + 1, i), end: i + 1 }
		}
	}
	return null
}

/**
 * Removes the consumed spans but keeps their newlines, so that line numbers in
 * later warnings still match the original file.
 *
 * Spans are blanked right-to-left, which keeps the offsets of the spans that
 * have not been touched yet valid.
 *
 * @param text - the document text
 * @param spans - half-open `[start, end)` ranges in any order
 * @returns the text with every span replaced by the newlines it contained
 */
function blankSpans(text: string, spans: Array<[number, number]>): string {
	const ordered = [...spans].sort((a, b) => a[0] - b[0])
	let out = text
	for (let i = ordered.length - 1; i >= 0; i--) {
		const [start, end] = ordered[i]
		let newlines = 0
		for (const ch of out.slice(start, end)) if (ch === "\n") newlines++
		out = out.slice(0, start) + "\n".repeat(newlines) + out.slice(end)
	}
	return out
}

/** Splits a colour specification on top-level commas and trims every part. */
function splitSpec(spec: string): string[] {
	return spec.split(",").map((part) => part.trim())
}

/**
 * Converts one `{model}{spec}` pair into a CSS colour.
 *
 * Supported models:
 *
 * - `RGB` — three integers in 0–255;
 * - `rgb` — three floats in 0–1, each rounded to the nearest 1/255 step;
 * - `HTML` — six hex digits, an optional leading `#` is tolerated;
 * - `gray` — one float in 0–1, rounded the same way as `rgb`.
 *
 * Anything else is reported through `reason` instead of throwing: an exotic
 * colour must not cost the user the rest of the document.
 *
 * @param model - the model name, e.g. `RGB`
 * @param spec - the model-specific specification, e.g. `31,42,51`
 * @returns either the CSS colour or the reason the colour was skipped
 */
function convert(model: string, spec: string): Conversion {
	const parts = splitSpec(spec)

	if (model === "HTML") {
		const digits = parts.length === 1 ? parts[0].replace(/^#/, "") : parts[0]
		if (parts.length !== 1 || !/^[0-9a-fA-F]{6}$/.test(digits)) {
			return { reason: `HTML colour "${spec}" is not six hex digits` }
		}
		return { css: `#${digits.toLowerCase()}` }
	}

	if (model === "RGB") {
		if (parts.length !== 3) return { reason: `RGB colour "${spec}" needs three channels` }
		const channels: number[] = []
		for (const part of parts) {
			if (!/^\d+$/.test(part)) return { reason: `RGB channel "${part}" is not an integer 0-255` }
			const channel = Number(part)
			if (channel > 255) return { reason: `RGB channel ${channel} is outside 0-255` }
			channels.push(channel)
		}
		return { css: toCss(channels as Channels) }
	}

	if (model === "rgb" || model === "gray") {
		const wanted = model === "rgb" ? 3 : 1
		if (parts.length !== wanted) {
			return { reason: `${model} colour "${spec}" needs ${wanted === 1 ? "one channel" : "three channels"}` }
		}
		const channels: number[] = []
		for (const part of parts) {
			const value = NUMBER.test(part) ? Number(part) : null
			if (value === null || value < 0 || value > 1) {
				return { reason: `${model} channel "${part}" is outside 0-1` }
			}
			channels.push(Math.round(value * 255))
		}
		if (model === "gray") return { css: toCss([channels[0], channels[0], channels[0]]) }
		return { css: toCss(channels as Channels) }
	}

	return { reason: `unsupported colour model "${model}"` }
}

/**
 * Collects `\definecolor` declarations and blanks them out of the document.
 *
 * `doc.colors` is merged, not replaced: colours collected by an earlier pass
 * survive, and a later definition of the same name wins. The declaration is
 * consumed even when its model is unsupported, so that no later stage trips
 * over raw TeX it cannot interpret.
 *
 * `%` comments are expected to be stripped by the comment stage that runs
 * first; a declaration that is already commented out is therefore invisible
 * here.
 *
 * @type {PreprocessStage}
 */
export const collectColors: PreprocessStage = (doc: TextDoc): TextDoc => {
	const source = doc.text
	const colors: Record<string, string> = { ...doc.colors }
	const warnings: ImportWarning[] = [...doc.warnings]
	const spans: Array<[number, number]> = []

	const warn = (index: number, text: string, reason: string) => {
		warnings.push({ line: lineAt(source, index), text: text.trim(), reason })
	}

	for (let match = DECLARATION.exec(source); match !== null; match = DECLARATION.exec(source)) {
		const start = match.index
		const nameGroup = readGroup(source, start + match[0].length - 1)
		if (!nameGroup) {
			warn(start, source.slice(start, start + 40), "unterminated colour name — skipped")
			continue
		}

		const modelGroup = readGroup(source, nameGroup.end)
		const specGroup = modelGroup ? readGroup(source, modelGroup.end) : null
		if (!modelGroup || !specGroup) {
			warn(start, source.slice(start, nameGroup.end), "unterminated \\definecolor declaration — skipped")
			DECLARATION.lastIndex = nameGroup.end
			continue
		}

		// The declaration is consumed even if it is unusable: nothing downstream
		// can do anything with a raw \definecolor.
		const declaration = source.slice(start, specGroup.end)
		spans.push([start, specGroup.end])
		DECLARATION.lastIndex = specGroup.end

		const name = nameGroup.value.trim()
		if (!name) {
			warn(start, declaration, "empty colour name — skipped")
			continue
		}

		const conversion = convert(modelGroup.value.trim(), specGroup.value.trim())
		if ("reason" in conversion) {
			warn(start, declaration, conversion.reason)
			continue
		}
		colors[name] = conversion.css
	}

	return { ...doc, text: blankSpans(source, spans), colors, warnings }
}