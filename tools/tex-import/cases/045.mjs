// Card 045 — commands/labels.ts: l= and l_= labels onto path symbols.
// Unit checks for the applyLabels post-processing hook. Runs automatically via `npm run test:import`.

export const id = "045"

function makeCtx() {
	return {
		settings: {},
		colors: {},
		coords: {},
		report: [],
	}
}

function cmd(args, line = 1) {
	return { kind: "draw", options: "", arguments: args, line, source: "\\draw " + args }
}

function pathComp(name) {
	return { type: "path", id: name, points: [] }
}

export async function run(ctx) {
	const { applyLabels } = ctx.require("../.build/src/scripts/import/commands/labels.js")

	// exceptions become failures naming the offending arguments, instead of aborting the case
	const callQuiet = (components, command, context) => {
		let threw = null
		try {
			applyLabels(components, command, context)
		} catch (error) {
			threw = error
		}
		ctx.assert(threw === null, `applyLabels must not throw for ${JSON.stringify(command.arguments)}, got ${threw && String(threw.message)}`)
	}

	// acceptance — l= lands on the paired path component
	{
		const resistor = pathComp("american resistor")
		const context = makeCtx()
		applyLabels([resistor], cmd("(0,0) to[R, l=$R_1$] (2,0)"), context)
		ctx.assert(resistor.label !== undefined && resistor.label.value === "$R_1$" && resistor.label.otherSide === false, `to[R, l=$R_1$] must attach { value: "$R_1$", otherSide: false }, got ${JSON.stringify(resistor.label)}`)
		ctx.assert(context.report.length === 0, `the acceptance case must not warn, got ${JSON.stringify(context.report)}`)
	}

	// l_ strips braces and flips the side
	{
		const capacitor = pathComp("c")
		const context = makeCtx()
		applyLabels([capacitor], cmd("(0,0) to[C, l_={$C_1$}] (2,0)"), context)
		ctx.assert(capacitor.label !== undefined && capacitor.label.value === "$C_1$" && capacitor.label.otherSide === true, `to[C, l_={$C_1$}] must attach { value: "$C_1$", otherSide: true }, got ${JSON.stringify(capacitor.label)}`)
		ctx.assert(context.report.length === 0, `l_ alone must not warn, got ${JSON.stringify(context.report)}`)
	}

	// the n-th to[] pairs with the n-th path; an unlabeled to[] stays silent
	{
		const first = pathComp("r")
		const second = pathComp("l")
		const context = makeCtx()
		applyLabels([first, second], cmd("(0,0) to[R, l=$R_1$] (1,0) to[L] (2,0)"), context)
		ctx.assert(first.label !== undefined && first.label.value === "$R_1$" && first.label.otherSide === false, `the label must land on the first path component, got ${JSON.stringify(first.label)}`)
		ctx.assert(second.label === undefined, `the second to[] carries no label and must attach nothing, got ${JSON.stringify(second.label)}`)
		ctx.assert(context.report.length === 0, `2 to[] vs 2 paths must not warn, got ${JSON.stringify(context.report)}`)
	}

	// non-path components are skipped by the pairing
	{
		const wire = { type: "wire" }
		const resistor = pathComp("r")
		const capacitor = pathComp("c")
		const context = makeCtx()
		applyLabels([wire, resistor, capacitor], cmd("(0,0) to[R, l=$a$] (1,0) to[C, l_=$b$] (2,0)"), context)
		ctx.assert(resistor.label !== undefined && resistor.label.value === "$a$" && resistor.label.otherSide === false, `the first labeled to[] must reach the first path, got ${JSON.stringify(resistor.label)}`)
		ctx.assert(capacitor.label !== undefined && capacitor.label.value === "$b$" && capacitor.label.otherSide === true, `the second labeled to[] must reach the second path, got ${JSON.stringify(capacitor.label)}`)
		ctx.assert(wire.label === undefined, `the wire must stay untouched, got ${JSON.stringify(wire.label)}`)
		ctx.assert(context.report.length === 0, `pairing over a wire must not warn, got ${JSON.stringify(context.report)}`)
	}

	// more to[] elements than path components: one pairing warning, nothing attached
	{
		const only = pathComp("r")
		const command = cmd("(0,0) to[R, l=$a$] (1,0) to[C, l_=$b$] (2,0)")
		const context = makeCtx()
		applyLabels([only], command, context)
		ctx.assert(context.report.length === 1, `2 to[] vs 1 path must warn exactly once, got ${context.report.length}`)
		ctx.assert(/pairing/.test(context.report[0].reason), `the mismatch reason must mention pairing, got ${JSON.stringify(context.report[0].reason)}`)
		ctx.assert(context.report[0].line === command.line, `the mismatch warning must carry the command line, got ${context.report[0].line}`)
		ctx.assert(context.report[0].text === command.source, `the mismatch warning must quote the command source, got ${JSON.stringify(context.report[0].text)}`)
		ctx.assert(only.label === undefined, `a mismatched call must not partially attach labels, got ${JSON.stringify(only.label)}`)
	}

	// one to[] with no path components at all
	{
		const context = makeCtx()
		applyLabels([], cmd("(0,0) to[R, l=$a$] (2,0)"), context)
		ctx.assert(context.report.length === 1 && /pairing/.test(context.report[0].reason), `1 to[] vs 0 paths must warn about pairing, got ${JSON.stringify(context.report)}`)
	}

	// l2= / l2_= warn once per file, deduped across calls
	{
		const context = makeCtx()
		const labeled = pathComp("r")
		applyLabels([labeled], cmd("(0,0) to[R, l=$a$, l2=$b$] (1,0)"), context)
		ctx.assert(labeled.label !== undefined && labeled.label.value === "$a$" && labeled.label.otherSide === false, `l2= must not stop l= from attaching, got ${JSON.stringify(labeled.label)}`)
		ctx.assert(context.report.length === 1, `the first l2= must warn exactly once, got ${context.report.length}`)
		ctx.assert(context.report[0].reason === "second label not imported", `the l2 reason must be exact, got ${JSON.stringify(context.report[0].reason)}`)
		const bare = pathComp("c")
		applyLabels([bare], cmd("(0,0) to[C, l2_=$c$] (1,0)"), context)
		ctx.assert(bare.label === undefined, `l2_= alone must attach nothing, got ${JSON.stringify(bare.label)}`)
		ctx.assert(context.report.length === 1, `a second l2 warning must be deduped per file, got ${context.report.length}`)
	}

	// value cleaning: trim, tilde to space, exactly one brace layer
	{
		const cleaning = [
			["(0,0) to[R, l={ $R_1$ }] (1,0)", "$R_1$", false],
			["(0,0) to[R, l=A~B] (1,0)", "A B", false],
			["(0,0) to[R, l={$L_{1}$}] (1,0)", "$L_{1}$", false],
			["(0,0) to[R, l_=  $x$] (1,0)", "$x$", true],
		]
		for (const [args, value, otherSide] of cleaning) {
			const component = pathComp("r")
			const context = makeCtx()
			applyLabels([component], cmd(args), context)
			ctx.assert(component.label !== undefined && component.label.value === value && component.label.otherSide === otherSide, `${JSON.stringify(args)} must attach ${JSON.stringify({ value, otherSide })}, got ${JSON.stringify(component.label)}`)
			ctx.assert(context.report.length === 0, `${JSON.stringify(args)} must not warn, got ${JSON.stringify(context.report)}`)
		}
	}

	// voltage-sign spellings l_<= and l_>=
	{
		const le = pathComp("r")
		const ge = pathComp("r")
		const context = makeCtx()
		applyLabels([le], cmd("(0,0) to[R, l_<=$x$] (1,0)"), context)
		applyLabels([ge], cmd("(0,0) to[R, l_>=$x$] (1,0)"), context)
		ctx.assert(le.label !== undefined && le.label.value === "$x$" && le.label.otherSide === true, `l_<= must count as the other side, got ${JSON.stringify(le.label)}`)
		ctx.assert(ge.label !== undefined && ge.label.value === "$x$" && ge.label.otherSide === true, `l_>= must count as the other side, got ${JSON.stringify(ge.label)}`)
		ctx.assert(context.report.length === 0, `voltage-sign spellings must not warn, got ${JSON.stringify(context.report)}`)
	}

	// v= and i= are ignored silently
	{
		const volt = pathComp("v")
		const current = pathComp("i")
		const both = pathComp("r")
		const context = makeCtx()
		applyLabels([volt], cmd("(0,0) to[V, v=$u$] (1,0)"), context)
		applyLabels([current], cmd("(0,0) to[R, i=$i_1$] (1,0)"), context)
		applyLabels([both], cmd("(0,0) to[R, i=$x$, l=$y$] (1,0)"), context)
		ctx.assert(volt.label === undefined, `v= must attach nothing, got ${JSON.stringify(volt.label)}`)
		ctx.assert(current.label === undefined, `i= must attach nothing, got ${JSON.stringify(current.label)}`)
		ctx.assert(both.label !== undefined && both.label.value === "$y$" && both.label.otherSide === false, `l= must still apply next to i=, got ${JSON.stringify(both.label)}`)
		ctx.assert(context.report.length === 0, `v= and i= must never warn, got ${JSON.stringify(context.report)}`)
	}

	// an existing label is never overwritten
	{
		const component = pathComp("r")
		component.label = { value: "keep", otherSide: false }
		const context = makeCtx()
		applyLabels([component], cmd("(0,0) to[R, l=$new$] (1,0)"), context)
		ctx.assert(component.label !== undefined && component.label.value === "keep" && component.label.otherSide === false, `an existing label must survive applyLabels, got ${JSON.stringify(component.label)}`)
		ctx.assert(context.report.length === 0, `skipping an existing label must stay silent, got ${JSON.stringify(context.report)}`)
	}

	// empty values attach nothing
	{
		const bare = pathComp("r")
		const braced = pathComp("r")
		const context = makeCtx()
		applyLabels([bare], cmd("(0,0) to[R, l=] (1,0)"), context)
		applyLabels([braced], cmd("(0,0) to[R, l={}] (1,0)"), context)
		ctx.assert(bare.label === undefined, `l= with an empty value must attach nothing, got ${JSON.stringify(bare.label)}`)
		ctx.assert(braced.label === undefined, `l={} must attach nothing, got ${JSON.stringify(braced.label)}`)
		ctx.assert(context.report.length === 0, `empty values must not warn, got ${JSON.stringify(context.report)}`)
	}

	// to[] without any label key pairs cleanly and stays silent
	{
		const component = pathComp("r")
		const context = makeCtx()
		applyLabels([component], cmd("(0,0) to[R] (2,0)"), context)
		ctx.assert(component.label === undefined, `to[R] without a label key must attach nothing, got ${JSON.stringify(component.label)}`)
		ctx.assert(context.report.length === 0, `1 to[] vs 1 path must not warn, got ${JSON.stringify(context.report)}`)
	}

	// warnings carry the command's line number
	{
		const context = makeCtx()
		const mismatched = pathComp("r")
		applyLabels([mismatched], cmd("(0,0) to[R, l=$a$] (1,0) to[C, l_=$b$] (2,0)", 7), context)
		ctx.assert(context.report.length === 1 && context.report[0].line === 7, `the pairing mismatch must warn on line 7, got ${JSON.stringify(context.report)}`)
		const paired = pathComp("c")
		applyLabels([paired], cmd("(0,0) to[C, l2=$c$] (1,0)", 3), context)
		ctx.assert(context.report.length === 2 && context.report[1].line === 3 && context.report[1].reason === "second label not imported", `the l2 warning must sit on line 3, got ${JSON.stringify(context.report[1])}`)
	}

	// never throws: malformed option text stays harmless, 0 wires mentality
	{
		const unterminated = pathComp("r")
		callQuiet([unterminated], cmd("(0,0) to[R, l={$x] (1,0)"), makeCtx())
		ctx.assert(unterminated.label === undefined, `an unterminated brace in the options must attach no label, got ${JSON.stringify(unterminated.label)}`)
		const empty = pathComp("r")
		callQuiet([empty], cmd("(0,0) to[R, l=] (1,0)"), makeCtx())
		ctx.assert(empty.label === undefined, `an empty l= must attach no label, got ${JSON.stringify(empty.label)}`)
		const ok = pathComp("r")
		callQuiet([ok], cmd("(0,0) to[R, l=$ok$] (1,0)"), makeCtx())
		ctx.assert(ok.label !== undefined && ok.label.value === "$ok$" && ok.label.otherSide === false, `a well-formed to[] must still label normally, got ${JSON.stringify(ok.label)}`)
	}

	// node commands pair as 0 to[] vs 0 paths
	{
		const context = makeCtx()
		const node = { kind: "node", options: "", arguments: "\\node[draw] (a) at (1,2) {block};", line: 1, source: "\\node[draw] (a) at (1,2) {block};" }
		applyLabels([], node, context)
		ctx.assert(context.report.length === 0, `a node command with no to[] and no paths must pair cleanly, got ${JSON.stringify(context.report)}`)
	}
}
