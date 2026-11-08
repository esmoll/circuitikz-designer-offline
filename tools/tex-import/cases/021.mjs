/**
 * Card 021 - scanner/statements.ts
 *
 * `splitPath()` turns a path argument into an ordered list of coord/op/to/node
 * elements. The module is a leaf, so it is loaded straight from the compiled
 * tree instead of through the `index.js` facade (card 052).
 */

export const id = "021"

export async function run(ctx) {
	const { splitPath } = ctx.require("./../.build/src/scripts/import/scanner/statements.js")

	const show = (value) => JSON.stringify(value)

	const kinds = (elements) => elements.map((element) => element.kind)

	const expectKinds = (input, expected, why) => {
		const actual = kinds(splitPath(input))
		ctx.assert(
			show(actual) === show(expected),
			`${show(input)}: kinds ${show(actual)}, expected ${show(expected)} (${why})`,
		)
	}

	// --- acceptance fixture 1: to with nested braces ----------------------
	{
		const elements = splitPath("(0,0) to[L, l={$L_1$}] (2,0)")
		expectKinds("(0,0) to[L, l={$L_1$}] (2,0)", ["coord", "to", "coord"], "to inside a path")
		ctx.assert(elements[0].text === "(0,0)", `fixture 1: first coord ${show(elements[0].text)}`)
		ctx.assert(
			elements[1].options === "L, l={$L_1$}",
			`fixture 1: to options ${show(elements[1].options)}, expected "L, l={$L_1$}"`,
		)
		ctx.assert(elements[2].text === "(2,0)", `fixture 1: last coord ${show(elements[2].text)}`)
	}

	// --- acceptance fixture 2: -- and an empty circ node ------------------
	{
		const input = "(0,0) -- (1,0) node[circ]{}"
		const elements = splitPath(input)
		expectKinds(input, ["coord", "op", "coord", "node"], "-- between coordinates")
		ctx.assert(elements[1].text === "--", `fixture 2: op ${show(elements[1].text)}, expected "--"`)
		ctx.assert(elements[3].options === "circ", `fixture 2: node options ${show(elements[3].options)}`)
		ctx.assert(elements[3].content === "", `fixture 2: node content ${show(elements[3].content)}`)
		ctx.assert(elements[3].at === undefined, `fixture 2: node.at should be undefined`)
	}

	// --- acceptance fixture 3: relative coordinates -----------------------
	{
		const input = "++(0,-0.5) to[R] ++(1,0)"
		const elements = splitPath(input)
		expectKinds(input, ["coord", "to", "coord"], "relative coordinates")
		ctx.assert(elements[0].text === "++(0,-0.5)", `fixture 3: first coord ${show(elements[0].text)}`)
		ctx.assert(elements[1].options === "R", `fixture 3: to options ${show(elements[1].options)}`)
		ctx.assert(elements[2].text === "++(1,0)", `fixture 3: last coord ${show(elements[2].text)}`)
	}

	// --- acceptance fixture 4: calc coordinate kept verbatim --------------
	{
		const input = "$(VT.G)+(0,-0.55)$ to[C] (2,2)"
		const elements = splitPath(input)
		expectKinds(input, ["coord", "to", "coord"], "calc coordinate")
		ctx.assert(
			elements[0].text === "$(VT.G)+(0,-0.55)$",
			`fixture 4: coord ${show(elements[0].text)} should be verbatim`,
		)
		ctx.assert(elements[1].options === "C", `fixture 4: to options ${show(elements[1].options)}`)
		ctx.assert(elements[2].text === "(2,2)", `fixture 4: coord ${show(elements[2].text)}`)
	}

	// --- acceptance fixture 5: node without `at` -------------------------
	{
		const input = "node[above left] {$+$}"
		const elements = splitPath(input)
		expectKinds(input, ["node"], "lone node")
		ctx.assert(elements[0].options === "above left", `fixture 5: options ${show(elements[0].options)}`)
		ctx.assert(elements[0].content === "$+$", `fixture 5: content ${show(elements[0].content)}`)
		ctx.assert(elements[0].at === undefined, `fixture 5: at should be undefined, got ${show(elements[0].at)}`)
	}

	// --- empty and blank input -------------------------------------------
	ctx.assert(show(splitPath("")) === "[]", `empty input should give [], got ${show(splitPath(""))}`)
	ctx.assert(show(splitPath("   \t ")) === "[]", `blank input should give [], got ${show(splitPath("   \t "))}`)

	// --- operators --------------------------------------------------------
	expectKinds("(0,0) -| (1,1)", ["coord", "op", "coord"], "-| operator")
	expectKinds("(0,0) |- (1,1)", ["coord", "op", "coord"], "|- operator")
	ctx.assert(splitPath("(0,0) -| (1,1)")[1].text === "-|", "-| must keep its text")
	ctx.assert(splitPath("(0,0) |- (1,1)")[1].text === "|-", "|- must keep its text")

	// operators glued to coordinates, no spaces at all
	expectKinds("(0,0)--(1,0)", ["coord", "op", "coord"], "no whitespace around --")

	// --- `to` without brackets --------------------------------------------
	{
		const elements = splitPath("(0,0) to (2,0)")
		expectKinds("(0,0) to (2,0)", ["coord", "to", "coord"], "to without options")
		ctx.assert(elements[1].options === "", `bare to options ${show(elements[1].options)}, expected ""`)
		ctx.assert(elements[2].text === "(2,0)", `bare to must not eat the next coord: ${show(elements[2].text)}`)
	}

	// --- node with `at` ---------------------------------------------------
	{
		const input = "node[circ] at (1,2) {}"
		const elements = splitPath(input)
		ctx.assert(elements.length === 1 && elements[0].kind === "node", `node at: ${show(elements)}`)
		ctx.assert(elements[0].options === "circ", `node at options ${show(elements[0].options)}`)
		ctx.assert(elements[0].at === "(1,2)", `node at position ${show(elements[0].at)}, expected "(1,2)"`)
		ctx.assert(elements[0].content === "", `node at content ${show(elements[0].content)}`)
	}

	// a calc position keeps the raw text, including the outer parentheses
	{
		const elements = splitPath("node[anchor=north] at ($(A)+(0,-1)$) {$x$}")
		ctx.assert(elements[0].at === "($(A)+(0,-1)$)", `calc at position ${show(elements[0].at)}`)
		ctx.assert(elements[0].content === "$x$", `calc at content ${show(elements[0].content)}`)
	}

	// node without brackets at all
	{
		const elements = splitPath("node {t}")
		ctx.assert(elements.length === 1 && elements[0].kind === "node", `bare node: ${show(elements)}`)
		ctx.assert(elements[0].options === "", `bare node options ${show(elements[0].options)}, expected ""`)
		ctx.assert(elements[0].content === "t", `bare node content ${show(elements[0].content)}`)
	}

	// --- balanced node content -------------------------------------------
	{
		const input = "node[left] {$\\frac{a}{b}$}"
		const elements = splitPath(input)
		ctx.assert(elements.length === 1, `nested braces should not split: ${show(elements)}`)
		ctx.assert(elements[0].content === "$\\frac{a}{b}$", `nested content ${show(elements[0].content)}`)
	}

	// a `;` inside node content is literal for this function too
	{
		const elements = splitPath("(0,0) node[above] {$a;b$}")
		ctx.assert(elements.length === 2, `semicolon in content: ${show(elements)}`)
		ctx.assert(elements[1].content === "$a;b$", `semicolon content ${show(elements[1].content)}`)
	}

	// --- several nodes in a row (midway label after a wire) ---------------
	{
		const input = "(0.6,3.4) node[ocirc]{} node[above left]{$+$} -- (1.4,3.4)"
		const elements = splitPath(input)
		expectKinds(input, ["coord", "node", "node", "op", "coord"], "two nodes in a row")
		ctx.assert(elements[1].options === "ocirc", `first node options ${show(elements[1].options)}`)
		ctx.assert(elements[2].options === "above left", `second node options ${show(elements[2].options)}`)
		ctx.assert(elements[2].content === "$+$", `second node content ${show(elements[2].content)}`)
		ctx.assert(elements[2].at === undefined, `second node at should be undefined`)
	}

	// --- unknown tokens ---------------------------------------------------
	{
		const elements = splitPath("(0,0) arc (0:90:1) (2,0)")
		ctx.assert(elements[1].kind === "op" && elements[1].text === "arc", `unknown token: ${show(elements)}`)
		// the parenthesis after `arc` is still a coordinate token
		ctx.assert(elements[2].kind === "coord" && elements[2].text === "(0:90:1)", `unknown + coord: ${show(elements)}`)
		ctx.assert(elements[3].kind === "coord" && elements[3].text === "(2,0)", `unknown tail: ${show(elements)}`)
	}

	// --- malformed input must not throw ----------------------------------
	{
		const inputs = [
			"(0,0",
			"++(1,2",
			"$(A)+(0,1",
			"to[L, l={$L_1$",
			"node[circ",
			"node[circ]{$x$",
			"(",
			"$",
			"+",
			"--",
			"]",
			"}",
			"to",
			"node",
			"at",
			"\\draw",
			"(0,0) -- ",
			"  ",
		]

		for (const input of inputs) {
			let elements
			try {
				elements = splitPath(input)
			} catch (error) {
				throw new Error(`${show(input)} threw ${error && error.message}`)
			}
			ctx.assert(Array.isArray(elements), `${show(input)} should return an array, got ${show(elements)}`)
		}

		// non-string input is tolerated as well
		ctx.assert(show(splitPath(null)) === "[]", "null should give []")
		ctx.assert(show(splitPath(undefined)) === "[]", "undefined should give []")

		// unterminated constructs keep the rest of the text, not a fragment
		const open = splitPath("to[L, l=$x$")
		ctx.assert(open[0].kind === "to" && open[0].options === "L, l=$x$", `unterminated to: ${show(open)}`)
		const partial = splitPath("(0,0) to[L] (2")
		ctx.assert(partial[2].kind === "coord" && partial[2].text === "(2", `unterminated coord: ${show(partial)}`)
	}
}