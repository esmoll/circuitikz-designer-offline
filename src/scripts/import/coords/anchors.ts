/**
 * Sub-node anchors: `(VT.G)`, `(VS.G)`, `(L1.center)`.
 *
 * `docs/anchor-map.md` (card `003`) answers how a circuitikz pin name maps to a
 * point inside a designer symbol and states the fallback rule verbatim. This
 * module implements that answer without touching any component class:
 *
 * - the pin geometry the map cites is a hard-coded table below — no SVG parsing
 *   and no I/O at call time;
 * - `G` → `gate` for thyristors and `A`/`K` → `START`/`END` are the alias table
 *   the map requires; a bare `center` is always the component's own point;
 * - everything else that cannot be resolved degrades to the component's point
 *   plus one warning, never to a dropped statement.
 *
 * ## Frames
 *
 * Pin offsets are quoted in SVG pixels in the *symbol frame* (y down), exactly
 * as `src/data/symbols.svg` declares them, and are converted to the importer's
 * centimetres (y up) with `PX_PER_CM` once at module load. Adding an offset to
 * the registered point assumes that point is the symbol's variant `mid`.
 * Placement along a segment — the rotation that makes the `nigfete` gate point
 * the right way — belongs to card `042`; this module never rotates.
 *
 * ## Identity and warnings
 *
 * `CoordContext` is `{ named, anchors, lastPoint, bipolesLength }`: it has no
 * warning sink, and `ctx.named` stores only a `Point`, never the symbol a name
 * belongs to. Both gaps are bridged by the returned resolver object, which is
 * structurally an {@link AnchorResolver} and additionally carries:
 *
 * - `setSymbol(node, tikzName)` / `symbolOf` — the identity hook. Card `042`
 *   registers `name=VT` for `nigfete`; it must also call
 *   `setSymbol("VT", "nigfete")` (or assign `symbolOf`) so that `(VT.G)` can
 *   pick the right pin. `symbolOf` wins when both are set. With no identity the
 *   module follows the anchor-map fallback: component point + one warning.
 * - `warnings` (live array) and `takeWarnings()` — the warning sink card `051`
 *   flushes into `BuildContext.report` with {@link flushAnchorWarnings}.
 *
 * `resolveAnchor` cannot reach a sink through `CoordContext`, so it duck-types
 * `ctx.anchors`: a `warn(warning)` method is called, else an array `warnings`
 * is pushed into; with any other resolver the warning is dropped (there is no
 * third place to put it). There is no module-level mutable state — each
 * `makeAnchorResolver` call owns its warnings.
 *
 * @module import/coords/anchors
 */

import type { AnchorResolver, CoordContext, CoordResolver, ImportWarning, Point } from "../types"
import { PX_PER_CM } from "./absolute"

/** A pin offset in SVG pixels in the symbol frame, y pointing down. */
type PinPixels = { x: number; y: number }

/** A pin offset in centimetres in the importer frame, y pointing up. */
type PinOffset = { x: number; y: number }

/**
 * Pin geometry quoted from `src/data/symbols.svg` by `docs/anchor-map.md` §4
 * (line numbers there). Designer `tikz` name → pin name → offset in the symbol
 * frame. `circ`/`ocirc` declare no pins at all, so only their centre exists.
 *
 * @readonly
 */
const PIN_PIXELS: Record<string, Record<string, PinPixels>> = {
	nigfete: {
		D: { x: 0, y: -29.10236 },
		G: { x: -37.03903, y: 10.186 },
		S: { x: 0, y: 29.10238 },
	},
	"empty thyristor": {
		START: { x: -26.45657, y: 0 },
		END: { x: 26.45656, y: 0 },
		gate: { x: 26.45656, y: -29.10235 },
	},
	"full thyristor": {
		START: { x: -26.45657, y: 0 },
		END: { x: 26.45656, y: 0 },
		gate: { x: 26.45656, y: -29.10235 },
	},
	"stroke thyristor": {
		START: { x: -26.45657, y: 0 },
		END: { x: 26.45656, y: 0 },
		gate: { x: 26.45656, y: -29.10235 },
	},
	"european voltage source": {
		START: { x: -15.87408, y: 0 },
		END: { x: 15.87408, y: 0 },
	},
	"sinusoidal voltage source": {
		START: { x: -15.87408, y: 0 },
		END: { x: 15.87408, y: 0 },
	},
	capacitor: {
		START: { x: -5.29122, y: 0 },
		END: { x: 5.29121, y: 0 },
	},
	"european resistor": {
		START: { x: -21.16532, y: 0 },
		END: { x: 21.16532, y: 0 },
	},
	"american inductor": {
		START: { x: -21.1653, y: 0 },
		END: { x: 21.16532, y: 0 },
		center: { x: 0, y: 0 },
	},
	"full diode": {
		START: { x: -10.58246, y: 0 },
		END: { x: 10.58246, y: 0 },
	},
	"empty diode": {
		START: { x: -10.58246, y: 0 },
		END: { x: 10.58246, y: 0 },
	},
	battery1: {
		START: { x: -7.93703, y: 0 },
		END: { x: 7.93703, y: 0 },
	},
	generic: {
		START: { x: -21.16532, y: 0 },
		END: { x: 21.16532, y: 0 },
	},
	circ: {},
	ocirc: {},
}

/**
 * Circuitikz anchor → designer pin, per designer symbol (`docs/anchor-map.md`
 * §3). Only thyristors need a translation: `G` is their gate, `A`/`K` are the
 * path ends, which `symbols.svg` calls `START`/`END`. Two-terminal `+`/`-`
 * anchors are deliberately absent: the map declares them geometric rather than
 * pin-backed (the end offsets depend on the draw statement, card `042`), so
 * they hit the fallback instead of a guessed half-length.
 *
 * @readonly
 */
const ANCHOR_ALIASES: Record<string, Record<string, string>> = {
	"empty thyristor": { G: "gate", A: "START", K: "END" },
	"full thyristor": { G: "gate", A: "START", K: "END" },
	"stroke thyristor": { G: "gate", A: "START", K: "END" },
}

/**
 * The same table converted once to centimetres in the importer frame: designer
 * `tikz` name → pin name → offset with y flipped, so it can be added to a point
 * from `ctx.named`. A pin name may repeat across symbols with different offsets
 * (`G` on `nigfete` versus `gate` on a thyristor), which is why the lookup is
 * keyed by symbol and needs the identity hook.
 *
 * @readonly
 */
const PINS: Record<string, Record<string, PinOffset>> = Object.keys(PIN_PIXELS).reduce(
	(table, symbol) => {
		const pins: Record<string, PinOffset> = {}
		for (const [name, px] of Object.entries(PIN_PIXELS[symbol])) {
			pins[name] = { x: px.x / PX_PER_CM, y: -px.y / PX_PER_CM }
		}
		table[symbol] = pins
		return table
	},
	{} as Record<string, Record<string, PinOffset>>,
)

/**
 * Node names: a leading letter, then letters, digits, `_` or `-` — the same
 * shape card `032` accepts, so `(VT.G)` and `(R_2.G)` both work.
 *
 * @readonly
 */
const nodePattern = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * Anchor names as the card defines them: `G`, `D`, `S`, `A`, `K`, `+`, `-`.
 *
 * @readonly
 */
const anchorPattern = /^[A-Za-z+-]+$/

/**
 * The part of an error-free token this resolver consumes, for warning text.
 *
 * @param token - the token being resolved
 * @param index - index of the opening parenthesis
 * @param close - index of the closing parenthesis
 * @returns the `(name.anchor)` segment as written
 */
function segment(token: string, index: number, close: number): string {
	return token.slice(index, close + 1)
}

/**
 * A resolver that is an {@link AnchorResolver} plus the identity hook and the
 * warning sink that the frozen `CoordContext` cannot carry.
 */
export type AnchorResolverWithWarnings = AnchorResolver & {
	/** Warnings collected so far, in call order. Live array, not a copy. */
	readonly warnings: ImportWarning[]
	/** Records one warning into {@link warnings}. */
	warn(warning: ImportWarning): void
	/** Returns the collected warnings and clears the list. */
	takeWarnings(): ImportWarning[]
	/**
	 * Registers which designer symbol a node name refers to, e.g.
	 * `setSymbol("VT", "nigfete")`. Card `042` calls this when it sees
	 * `name=<id>`.
	 */
	setSymbol(node: string, tikzName: string): void
	/** Identity hook; when assigned it wins over {@link setSymbol}. */
	symbolOf: (node: string) => string | null
}

/**
 * Looks a pin up by name, case-insensitively as `docs/anchor-map.md` §5 says.
 *
 * @param pins - the pin table of one designer symbol
 * @param name - the circuitikz anchor name
 * @returns a copy of the offset in cm, or `null`
 */
function findPin(pins: Record<string, PinOffset>, name: string): Point | null {
	if (Object.prototype.hasOwnProperty.call(pins, name)) {
		const pin = pins[name]
		return { x: pin.x, y: pin.y }
	}

	const lower = name.toLowerCase()
	for (const key of Object.keys(pins)) {
		if (key.toLowerCase() === lower) {
			const pin = pins[key]
			return { x: pin.x, y: pin.y }
		}
	}

	return null
}

/**
 * The offset of `anchor` inside `symbol`, alias table included.
 *
 * @param symbol - designer `tikz` name, e.g. `nigfete`
 * @param anchor - circuitikz anchor, e.g. `G`
 * @returns the offset in cm within the symbol frame, or `null`
 */
function offsetFor(symbol: string, anchor: string): Point | null {
	const pins = PINS[symbol]
	if (!pins) return null

	const direct = findPin(pins, anchor)
	if (direct) return direct

	const aliases = ANCHOR_ALIASES[symbol]
	if (!aliases) return null

	const lower = anchor.toLowerCase()
	for (const key of Object.keys(aliases)) {
		if (key.toLowerCase() !== lower) continue
		return findPin(pins, aliases[key])
	}

	return null
}

/**
 * The anchor-map fallback reason, verbatim (card `003` §5 in words).
 *
 * @param node - the component name
 * @param anchor - the anchor that could not be resolved
 */
function fallbackReason(node: string, anchor: string): string {
	return `anchor ${anchor} of ${node} not resolvable, using component centre`
}

/**
 * Builds the anchor resolver for one document.
 *
 * The pin table is read once here; `resolve` is a closure over `ctx` and the
 * resolver's own identity map, so repeated calls cost a map lookup only. It
 * never throws, never mutates `ctx.named` and returns copies.
 *
 * `resolve` returns `null` only when the node name is unknown, which lets card
 * `034` treat a failed anchor like a failed name. A known node whose anchor
 * cannot be resolved returns the component's own point and records one warning
 * `{ line: 0, text: "<node>.<anchor>", reason: "anchor <a> of <n> not
 * resolvable, using component centre" }`; the caller may rewrite `line` and
 * `text` before flushing. `resolveAnchor` uses the same `reason`, and its
 * `text` is the whole `(name.anchor)` segment, because only it sees the token.
 *
 * @param ctx - the document's coordinate context (`named` is read, never written)
 * @returns the resolver, its identity hook and its warning sink
 */
export function makeAnchorResolver(ctx: CoordContext): AnchorResolverWithWarnings {
	const symbols = new Map<string, string>()
	const warnings: ImportWarning[] = []
	const state: { symbolOf: (node: string) => string | null } = { symbolOf: () => null }

	const resolver: AnchorResolverWithWarnings = {
		warnings,
		warn(warning: ImportWarning): void {
			warnings.push(warning)
		},
		takeWarnings(): ImportWarning[] {
			return warnings.splice(0, warnings.length)
		},
		setSymbol(node: string, tikzName: string): void {
			symbols.set(node, tikzName)
		},
		get symbolOf(): (node: string) => string | null {
			return state.symbolOf
		},
		set symbolOf(fn: (node: string) => string | null) {
			state.symbolOf = fn
		},
		resolve(node: string, anchor: string): Point | null {
			const base = ctx.named.get(node)
			if (!base) return null

			const centre: Point = { x: base.x, y: base.y }
			if (anchor.toLowerCase() === "center") return centre

			const symbol = state.symbolOf(node) ?? symbols.get(node) ?? null
			const offset = symbol === null ? null : offsetFor(symbol, anchor)
			if (!offset) {
				warnings.push({
					line: 0,
					text: `${node}.${anchor}`,
					reason: fallbackReason(node, anchor),
				})
				return centre
			}

			return { x: base.x + offset.x, y: base.y + offset.y }
		},
	}

	return resolver
}

/**
 * Pushes a warning into whatever sink `ctx.anchors` exposes.
 *
 * `CoordContext` has no warning channel of its own, so the sink is found by
 * duck typing: a `warn` method first, then a `warnings` array. Any other
 * resolver silently drops the warning — there is nowhere else to put it.
 *
 * @param ctx - the coordinate context whose resolver may collect warnings
 * @param warning - the warning to record
 */
function recordWarning(ctx: CoordContext, warning: ImportWarning): void {
	const sink = ctx.anchors as (AnchorResolver & { warn?: (w: ImportWarning) => void; warnings?: ImportWarning[] }) | null
	if (!sink) return
	if (typeof sink.warn === "function") {
		sink.warn(warning)
		return
	}
	if (Array.isArray(sink.warnings)) sink.warnings.push(warning)
}

/**
 * Resolves `(<name>.<anchor>)` at `index` — the `G` of `(VT.G)`.
 *
 * The component is looked up in `ctx.named`; an unknown name or a shape this
 * resolver does not own (`(A)`, `(1,2)`, `$(VT.G)+(0,1)$`, any whitespace such
 * as `(inv.north west)`) returns `null` without throwing. A bare `center`
 * anchor is the component's own point. Everything else is delegated to
 * `ctx.anchors.resolve`; when that yields nothing, the point degrades to the
 * component's point with exactly one warning
 * {@link fallbackReason}.
 *
 * `lastPoint` is the resolved point and `next` sits just past `)`; `ctx` is
 * never mutated, the caller commits `lastPoint` from the result.
 *
 * @type {CoordResolver}
 */
export const resolveAnchor: CoordResolver = (token, index, ctx) => {
	if (token?.[index] !== "(") return null

	const close = token.indexOf(")", index + 1)
	if (close === -1) return null

	const inner = token.slice(index + 1, close).trim()
	const dot = inner.indexOf(".")
	// No dot is a plain name (card 032); a leading dot is malformed.
	if (dot <= 0) return null

	const node = inner.slice(0, dot).trim()
	const anchor = inner.slice(dot + 1).trim()
	if (!nodePattern.test(node)) return null
	if (!anchorPattern.test(anchor)) return null

	const base = ctx.named.get(node)
	if (!base) return null

	const centre: Point = { x: base.x, y: base.y }
	if (anchor.toLowerCase() === "center") {
		return { point: centre, next: close + 1, lastPoint: centre }
	}

	const resolved = ctx.anchors ? ctx.anchors.resolve(node, anchor) : null
	if (resolved) {
		const point: Point = { x: resolved.x, y: resolved.y }
		return { point, next: close + 1, lastPoint: point }
	}

	recordWarning(ctx, {
		line: 0,
		text: segment(token, index, close),
		reason: fallbackReason(node, anchor),
	})
	return { point: centre, next: close + 1, lastPoint: centre }
}

/**
 * Drains the warnings an anchor resolver collected, for card `051` to append to
 * `BuildContext.report`.
 *
 * Works for {@link makeAnchorResolver} results (`takeWarnings`) and for any
 * other resolver exposing a `warnings` array; anything else yields `[]`.
 *
 * @param resolver - `ctx.coords.anchors`, or `null`
 * @returns the collected warnings, and clears them from the resolver
 */
export function flushAnchorWarnings(resolver: AnchorResolver | null): ImportWarning[] {
	if (!resolver) return []

	const sink = resolver as Partial<AnchorResolverWithWarnings>
	if (typeof sink.takeWarnings === "function") return sink.takeWarnings()
	if (Array.isArray(sink.warnings)) return sink.warnings.splice(0, sink.warnings.length)

	return []
}