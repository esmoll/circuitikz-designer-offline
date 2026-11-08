/**
 * CircuitikZ symbol names to designer symbols.
 *
 * The importer works with the short circuitikz keys used in the corpus
 * (`R`, `C`, `L`, …), while the designer identifies components by the
 * `tikz="…"` attribute of `src/data/symbols.svg`. This module bridges the two:
 * no I/O, only a hard-coded table.
 *
 * @module import/symbols
 */

import type { GlobalSettings } from "../types"

/** How the designer instantiates a resolved symbol. */
export type SymbolKind = "path" | "node"

/** A designer symbol name plus the component type it maps to. */
export type ResolvedSymbol = { tikz: string; kind: SymbolKind }

/**
 * Designer names that exist verbatim as `tikz="…"` in `src/data/symbols.svg`,
 * with the component `type` that the SVG declares for them.
 *
 * Keep this list in sync with the symbols the importer actually emits — it is
 * deliberately not the full 402-name catalogue, and it must never be read from
 * the SVG at runtime.
 *
 * @readonly
 */
const LITERALS: Record<string, SymbolKind> = {
	"american resistor": "path",
	"european resistor": "path",
	"american inductor": "path",
	"european inductor": "path",
	capacitor: "path",
	"american voltage source": "path",
	"european voltage source": "path",
	"sinusoidal voltage source": "path",
	"full diode": "path",
	"full thyristor": "path",
	nigfete: "path",
	generic: "path",
	battery1: "path",
	circ: "node",
	ocirc: "node",
}

/**
 * Builds a resolved symbol. Path is the default because most circuitikz
 * bipoles are two-terminal path symbols.
 *
 * @param tikz - designer symbol name
 * @param kind - designer component type
 */
const resolved = (tikz: string, kind: SymbolKind = "path"): ResolvedSymbol => ({ tikz, kind })

/**
 * Short circuitikz keys to a resolver. The function receives the document
 * settings because several bipoles have a european and an american variant.
 *
 * @readonly
 */
export const ALIASES: Record<string, (settings: GlobalSettings) => ResolvedSymbol | null> = {
	R: (settings) => resolved(settings.european ? "european resistor" : "american resistor"),
	L: (settings) => resolved(settings.inductorStyle === "american" ? "american inductor" : "european inductor"),
	C: () => resolved("capacitor"),
	V: (settings) => resolved(settings.european ? "european voltage source" : "american voltage source"),
	sV: () => resolved("sinusoidal voltage source"),
	D: () => resolved("full diode"),
	Ty: () => resolved("full thyristor"),
	Tnigfete: () => resolved("nigfete"),
	generic: () => resolved("generic"),
	battery1: () => resolved("battery1"),
	circ: () => resolved("circ", "node"),
	ocirc: () => resolved("ocirc", "node"),
}

/**
 * Resolves a circuitikz name (short key or full designer name) to a designer
 * symbol.
 *
 * `ALIASES` wins, then the literal SVG name. Lookup is case-sensitive and
 * unknown names return `null` — this function never throws.
 *
 * @param name - e.g. `R`, `sV` or `european resistor`
 * @param settings - document settings that select the bipole variant
 * @returns the designer symbol, or `null` if the name is not supported
 */
export function resolveSymbol(name: string, settings: GlobalSettings): ResolvedSymbol | null {
	if (typeof name !== "string") return null

	if (Object.prototype.hasOwnProperty.call(ALIASES, name)) {
		const alias = ALIASES[name](settings)
		if (alias) return alias
	}

	if (Object.prototype.hasOwnProperty.call(LITERALS, name)) {
		return resolved(name, LITERALS[name])
	}

	return null
}