// Card 020 — scanner/lexer.ts: tokenizer for draw/node statements.
// Unit checks for the tokenize stage. Runs automatically via `npm run test:import`.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const id = "020"

// The fixture corpus lives at <repoRoot>/tests/fixtures/tex, three levels up
// from this directory. Resolve it from this file, not from the cwd.
const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tests", "fixtures", "tex")

function makeDoc(source) {
	return {
		text: source,
		colors: {},
		settings: {
			european: false,
			rpvoltages: false,
			bipolesLength: 1.0,
			inductorStyle: null,
			defaultLineWidth: null,
			defaultColor: null,
		},
		warnings: [],
	}
}

// Independent count for the fixture sweep: the number of `;`-terminated
// statements that start with \draw or \node. Deliberately naive — from each
// \draw/\node start it only tracks brace/bracket depth and accepts the first
// `;` at depth 0 — so it stays an independent cross-check of the tokenizer.
function referenceDrawNodeCount(text) {
	let count = 0
	let i = 0
	while (i < text.length) {
		if (text[i] !== "\\") {
			i += 1
			continue
		}
		let nameEnd = i + 1
		while (nameEnd < text.length && /[A-Za-z]/.test(text[nameEnd])) nameEnd += 1
		const name = text.slice(i + 1, nameEnd)
		if (name !== "draw" && name !== "node") {
			i += 1 // any other command or a bare escape — keep scanning
			continue
		}
		let depth = 0
		let at = nameEnd
		let terminated = false
		while (at < text.length) {
			const ch = text[at]
			if (ch === "\\") {
				at += 2 // escape pair: \%, \\, \; — nothing inside can end the statement
				continue
			}
			if (ch === "{" || ch === "[") depth += 1
			else if (ch === "}" || ch === "]") depth -= 1
			else if (ch === ";" && depth === 0) {
				terminated = true
				break
			}
			at += 1
		}
		if (!terminated) break // unterminated tail — the statement does not count
		count += 1
		i = at + 1
	}
	return count
}

export async function run(ctx) {
	const { tokenize } = ctx.require("../.build/src/scripts/import/scanner/lexer.js")

	// basic draw with a to[] label that nests braces and math
	{
		const cmds = tokenize(makeDoc("\\draw (0,0) to[L, l={$L_1$}, name=L1] (2,0);\n"))
		ctx.assert(cmds.length === 1, `one command, got ${cmds.length}`)
		ctx.assert(cmds[0].kind === "draw", `kind must be "draw", got ${cmds[0].kind}`)
		ctx.assert(cmds[0].options === "", `no options after the name, got ${JSON.stringify(cmds[0].options)}`)
		ctx.assert(cmds[0].arguments === "(0,0) to[L, l={$L_1$}, name=L1] (2,0)", `arguments must keep the label intact, got ${JSON.stringify(cmds[0].arguments)}`)
		ctx.assert(cmds[0].source === "\\draw (0,0) to[L, l={$L_1$}, name=L1] (2,0)", `source excludes only the terminating ;, got ${JSON.stringify(cmds[0].source)}`)
		ctx.assert(cmds[0].line === 1, `the statement starts on line 1, got ${cmds[0].line}`)
	}

	// node statement with options
	{
		const cmds = tokenize(makeDoc("\\node[circ] at (1,2){};\n"))
		ctx.assert(cmds.length === 1, `one command, got ${cmds.length}`)
		ctx.assert(cmds[0].kind === "node", `kind must be "node", got ${cmds[0].kind}`)
		ctx.assert(cmds[0].options === "circ", `options must be "circ", got ${JSON.stringify(cmds[0].options)}`)
		ctx.assert(cmds[0].arguments === "at (1,2){}", `arguments exclude the name and options, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// ; inside the {...} node text does not split the statement
	{
		const cmds = tokenize(makeDoc("\\node at (0,0) {a;b};\n"))
		ctx.assert(cmds.length === 1, `; inside braces must not split, got ${cmds.length} commands`)
		ctx.assert(cmds[0].arguments === "at (0,0) {a;b}", `arguments keep the inner ;, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	{
		const cmds = tokenize(makeDoc("\\node at (0,0) {$f(x);g$};\n"))
		ctx.assert(cmds.length === 1, `; inside math in braces must not split, got ${cmds.length} commands`)
		ctx.assert(cmds[0].arguments === "at (0,0) {$f(x);g$}", `arguments keep the math text, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// ; inside $...$ math in options does not split
	{
		const cmds = tokenize(makeDoc("\\draw (0,0) to[L, l={$a;b$}] (2,0);\n"))
		ctx.assert(cmds.length === 1, `; inside math in to[] options must not split, got ${cmds.length} commands`)
		ctx.assert(cmds[0].arguments === "(0,0) to[L, l={$a;b$}] (2,0)", `arguments keep the math label, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// several statements on one line come back in document order
	{
		const cmds = tokenize(makeDoc("\\draw (0,0) -- (1,0); \\node[circ] at (1,0){};\n"))
		ctx.assert(cmds.length === 2, `two statements on one line, got ${cmds.length}`)
		ctx.assert(cmds[0].kind === "draw" && cmds[1].kind === "node", `kinds must be draw then node, got ${cmds[0].kind}, ${cmds[1].kind}`)
		ctx.assert(cmds[0].line === 1 && cmds[1].line === 1, `both statements start on line 1, got ${cmds[0].line}, ${cmds[1].line}`)
		ctx.assert(cmds[0].source === "\\draw (0,0) -- (1,0)", `first source is trimmed before the ;, got ${JSON.stringify(cmds[0].source)}`)
		ctx.assert(cmds[1].source === "\\node[circ] at (1,0){}", `second source starts after the first ;, got ${JSON.stringify(cmds[1].source)}`)
	}

	// a statement spanning lines reports the line of its backslash
	{
		const source = [
			"\\begin{tikzpicture}",
			"  \\draw (0,0)",
			"        to[R]",
			"        (2,0);",
			"\\end{tikzpicture}",
			"",
		].join("\n")
		const cmds = tokenize(makeDoc(source))
		ctx.assert(cmds.length === 1, `a multiline statement stays whole, got ${cmds.length} commands`)
		ctx.assert(cmds[0].kind === "draw", `kind survives the line breaks, got ${cmds[0].kind}`)
		ctx.assert(cmds[0].line === 2, `line is the line of the backslash, got ${cmds[0].line}`)
		ctx.assert(!cmds[0].source.includes(";"), `source excludes the terminating ;, got ${JSON.stringify(cmds[0].source)}`)
	}

	// ... and with the terminating ; on its own line
	{
		const cmds = tokenize(makeDoc("\\draw (0,0) -- (1,0)\n;\n"))
		ctx.assert(cmds.length === 1, `a lone ; still terminates, got ${cmds.length} commands`)
		ctx.assert(cmds[0].line === 1, `line is the line of the backslash, got ${cmds[0].line}`)
		ctx.assert(cmds[0].arguments === "(0,0) -- (1,0)", `arguments are trimmed before the lone ;, got ${JSON.stringify(cmds[0].arguments)}`)
		ctx.assert(cmds[0].source === "\\draw (0,0) -- (1,0)", `source excludes the terminating ;, got ${JSON.stringify(cmds[0].source)}`)
	}

	// \path and \fill tokenize but stay "unknown"
	{
		const cmds = tokenize(makeDoc("\\path (0,0) -- (1,1);\n"))
		ctx.assert(cmds.length === 1 && cmds[0].kind === "unknown", `\\path must be kind "unknown", got ${JSON.stringify(cmds)}`)
		ctx.assert(cmds[0].arguments === "(0,0) -- (1,1)", `arguments exclude the name, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	{
		const cmds = tokenize(makeDoc("\\fill (0,0) -- (1,1);\n"))
		ctx.assert(cmds.length === 1 && cmds[0].kind === "unknown", `\\fill must be kind "unknown", got ${JSON.stringify(cmds)}`)
		ctx.assert(cmds[0].arguments === "(0,0) -- (1,1)", `arguments exclude the name, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// a \foreach body may contain a nested statement: one unknown + one node
	{
		const cmds = tokenize(makeDoc("\\foreach \\x in {0,1} \\node at (\\x,0) {};\n"))
		ctx.assert(cmds.length === 2, `the nested statement is returned too, got ${cmds.length} commands`)
		ctx.assert(cmds.filter((c) => c.kind === "unknown").length === 1, `exactly one unknown command for the \\foreach, got ${JSON.stringify(cmds.map((c) => c.kind))}`)
		ctx.assert(cmds.filter((c) => c.kind === "node").length === 1, `exactly one node command from the body, got ${JSON.stringify(cmds.map((c) => c.kind))}`)
		const node = cmds.find((c) => c.kind === "node")
		ctx.assert(node.arguments === "at (\\x,0) {}", `the nested node keeps its arguments, got ${JSON.stringify(node.arguments)}`)
	}

	// options are the [...] block right after the name
	{
		const cmds = tokenize(makeDoc("\\draw[line width=1pt] (0,0) -- (1,0);\n"))
		ctx.assert(cmds.length === 1, `one command, got ${cmds.length}`)
		ctx.assert(cmds[0].options === "line width=1pt", `options text without brackets, got ${JSON.stringify(cmds[0].options)}`)
		ctx.assert(cmds[0].arguments === "(0,0) -- (1,0)", `arguments exclude the options, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	{
		const cmds = tokenize(makeDoc("\\draw (0,0) -- (1,0);\n"))
		ctx.assert(cmds.length === 1, `one command, got ${cmds.length}`)
		ctx.assert(cmds[0].options === "", `no options means an empty string, got ${JSON.stringify(cmds[0].options)}`)
	}

	// nested braces in a to[] label survive into the arguments untouched
	{
		const cmds = tokenize(makeDoc("\\draw (0,0) to[R, l={$R_1$}] (1,0);\n"))
		ctx.assert(cmds.length === 1, `label braces must not split the statement, got ${cmds.length} commands`)
		ctx.assert(cmds[0].options === "", `to[] options belong to the arguments, not to the command, got ${JSON.stringify(cmds[0].options)}`)
		ctx.assert(cmds[0].arguments === "(0,0) to[R, l={$R_1$}] (1,0)", `inner options text "R, l={$R_1$}" stays intact, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// escapes inside node text: \\ and \% are literal characters, the scan survives
	{
		const cmds = tokenize(makeDoc("\\node at (0,0) {a\\\\b\\%c};\n"))
		ctx.assert(cmds.length === 1, `escape pairs must not break the scan, got ${cmds.length} commands`)
		ctx.assert(cmds[0].kind === "node", `kind survives escapes, got ${cmds[0].kind}`)
		ctx.assert(cmds[0].arguments === "at (0,0) {a\\\\b\\%c}", `escape pairs are kept verbatim, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// preamble without ; never swallows the first \draw
	{
		const source = [
			"\\documentclass{standalone}",
			"\\usepackage{circuitikz}",
			"\\begin{document}",
			"\\draw (0,0) -- (1,0);",
			"\\end{document}",
			"",
		].join("\n")
		const cmds = tokenize(makeDoc(source))
		ctx.assert(cmds.length === 1, `only the draw is emitted, got ${cmds.length} commands`)
		ctx.assert(cmds[0].kind === "draw" && cmds[0].line === 4, `the draw is found on line 4, got ${cmds[0].kind} at line ${cmds[0].line}`)
		ctx.assert(cmds[0].arguments === "(0,0) -- (1,0)", `arguments are clean, got ${JSON.stringify(cmds[0].arguments)}`)
	}

	// unterminated input must not throw
	{
		const tokenizeQuiet = (source) => {
			try {
				return tokenize(makeDoc(source))
			} catch (error) {
				ctx.assert(false, `tokenize must not throw on unterminated input, threw: ${error.message}`)
			}
		}
		const tail = tokenizeQuiet("\\draw (0,0) -- (1,0);\n\\end{tikzpicture}\n\\end{document}")
		ctx.assert(tail.length === 1, `trailing \\end lines are not emitted, got ${tail.length} commands`)
		ctx.assert(tail[0].kind === "draw" && tail[0].line === 1, `the draw before \\end{tikzpicture} survives, got ${tail[0].kind} at line ${tail[0].line}`)
		const cut = tokenizeQuiet("\\draw (0,0) -- (1,0")
		ctx.assert(cut.length === 1, `EOF mid-statement yields one command, got ${cut.length}`)
		ctx.assert(cut[0].kind === "unknown", `EOF mid-statement is reported as unknown, got ${cut[0].kind}`)
		ctx.assert(cut[0].source === "\\draw (0,0) -- (1,0", `the unterminated source is the whole input, got ${JSON.stringify(cut[0].source)}`)
	}

	// fixture sweep: every corpus file tokenizes without throwing and its
	// draw/node count matches an independent reference scan of the raw text
	{
		const names = fs.readdirSync(FIXTURES).filter((n) => n.endsWith(".tex")).sort()
		ctx.assert(names.length > 0, `no .tex fixtures found at ${FIXTURES}`)
		for (const name of names) {
			const text = fs.readFileSync(path.join(FIXTURES, name), "utf8")
			let cmds
			try {
				cmds = tokenize(makeDoc(text))
			} catch (error) {
				ctx.assert(false, `${name}: tokenize threw: ${error.message}`)
			}
			const drawNode = cmds.filter((c) => c.kind === "draw" || c.kind === "node")
			const reference = referenceDrawNodeCount(text)
			ctx.assert(drawNode.length === reference, `${name}: tokenizer found ${drawNode.length} draw/node statements, reference scan found ${reference}`)
			for (const cmd of cmds) {
				ctx.assert(typeof cmd.line === "number" && cmd.line >= 1, `${name}: command line must be a number >= 1, got ${JSON.stringify(cmd.line)}`)
				ctx.assert(typeof cmd.source === "string" && cmd.source.length > 0, `${name}: command source must be non-empty, got ${JSON.stringify(cmd.source)}`)
			}
		}
	}
}
