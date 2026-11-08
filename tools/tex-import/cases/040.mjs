/**
 * Card 040 - symbols/index.ts
 *
 * The mapping table is checked against the real symbol names in
 * `src/data/symbols.svg`, under both document settings profiles.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "040"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const SVG = path.join(ROOT, "src", "data", "symbols.svg")

/** Every `tikz="…"` name declared by the designer, with its component type. */
function readSvgSymbols() {
	const svg = fs.readFileSync(SVG, "utf8")
	const names = new Set()
	const types = new Map()

	for (const match of svg.matchAll(/tikz="([^"]+)"/g)) names.add(match[1])
	for (const match of svg.matchAll(/<component\b[^>]*>/g)) {
		const tag = match[0]
		const tikz = /tikz="([^"]+)"/.exec(tag)
		const type = /type="([^"]+)"/.exec(tag)
		if (tikz && type) types.set(tikz[1], type[1])
	}

	return { names, types }
}

const base = { rpvoltages: false, bipolesLength: 1, defaultLineWidth: null, defaultColor: null }
const profiles = {
	// ctikzset european, no inductor style
	P1: { ...base, european: true, inductorStyle: null },
	// american bipoles, explicit american inductors
	P2: { ...base, european: false, inductorStyle: "american" },
}

/**
 * `kind` says which mapping emits the symbol (a bipole along a segment, or a
 * pole node), not the `type="…"` of the SVG component. The two disagree for
 * `nigfete` only: the SVG declares it a node (docs/anchor-map.md records the
 * same fact for card 042), while circuitikz places it along a `to[...]` path.
 * Spell the divergence out so a future change in either place is noticed.
 */
const SVG_TYPE_EXCEPTIONS = { nigfete: "node" }

/**
 * One row per line of the card's mapping table: input, the profile it applies
 * to (`*` means both), the expected designer name and its component type.
 */
const TABLE = [
	["R", "P1", "european resistor", "path"],
	["R", "P2", "american resistor", "path"],
	["L", "P2", "american inductor", "path"],
	["L", "P1", "european inductor", "path"],
	["C", "*", "capacitor", "path"],
	["V", "P1", "european voltage source", "path"],
	["V", "P2", "american voltage source", "path"],
	["sV", "*", "sinusoidal voltage source", "path"],
	["D", "*", "full diode", "path"],
	["Ty", "*", "full thyristor", "path"],
	["Tnigfete", "*", "nigfete", "path"],
	["generic", "*", "generic", "path"],
	["battery1", "*", "battery1", "path"],
	["circ", "*", "circ", "node"],
	["ocirc", "*", "ocirc", "node"],
]

export async function run(ctx) {
	const { resolveSymbol, ALIASES } = ctx.require("./../.build/src/scripts/import/symbols/index.js")
	const svg = readSvgSymbols()

	// --- 1. the card's mapping table, under both profiles ----------------
	let resolved = 0
	for (const [input, profile, tikz, kind] of TABLE) {
		for (const [profileName, settings] of Object.entries(profiles)) {
			if (profile !== "*" && profile !== profileName) continue

			const got = resolveSymbol(input, settings)
			const where = `${input} under ${profileName}`
			ctx.assert(got !== null, `${where}: expected ${tikz}, got null`)
			ctx.assert(got.tikz === tikz, `${where}: expected ${tikz}, got ${got.tikz}`)
			ctx.assert(got.kind === kind, `${where}: expected kind ${kind}, got ${got.kind}`)
		}
		resolved++
	}

	// --- 2. every target name exists in symbols.svg ----------------------
	for (const [, , tikz, kind] of TABLE) {
		ctx.assert(svg.names.has(tikz), `${tikz} is not a tikz="…" name in symbols.svg`)
		const svgType = SVG_TYPE_EXCEPTIONS[tikz] ?? kind
		ctx.assert(
			svg.types.get(tikz) === svgType,
			`${tikz} is type="${svg.types.get(tikz)}" in symbols.svg, expected ${svgType}`,
		)
	}

	// --- 3. full designer names are accepted as input as well ------------
	for (const [, , tikz, kind] of TABLE) {
		for (const settings of Object.values(profiles)) {
			const got = resolveSymbol(tikz, settings)
			ctx.assert(got !== null, `${tikz} should resolve to itself, got null`)
			ctx.assert(got.tikz === tikz && got.kind === kind, `${tikz} should resolve to itself, got ${JSON.stringify(got)}`)
		}
	}

	// --- 4. unknown and wrongly-cased names return null ------------------
	let unknown = 0
	for (const name of ["Xyz", "", "R ", "r", "Generic", "european artificial resistor", "constructor", "toString"]) {
		for (const settings of Object.values(profiles)) {
			const got = resolveSymbol(name, settings)
			if (got !== null) unknown++
			ctx.assert(got === null, `unknown name ${JSON.stringify(name)} should return null, got ${JSON.stringify(got)}`)
		}
	}

	// --- 5. the alias table is exported and keeps the short keys ---------
	ctx.assert(ALIASES && typeof ALIASES === "object", "ALIASES must be exported as an object")
	for (const [input] of TABLE) {
		ctx.assert(typeof ALIASES[input] === "function", `ALIASES.${input} must be a function of GlobalSettings`)
	}

	console.log(`symbols: ${resolved}/${TABLE.length} resolve, ${unknown} unknown`)
}