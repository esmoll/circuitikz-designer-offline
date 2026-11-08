#!/usr/bin/env node
/**
 * Acceptance runner for the CircuiTikZ .tex importer.
 *
 *   npm run test:import              verify against tests/fixtures/expected.json
 *   npm run test:import -- --record  regenerate expected.json from the current build
 *   npm run test:import -- --case 030 run a single card's case file
 *
 * How cards add their own checks
 * ------------------------------
 * NEVER edit this file from a card. Put unit checks in
 *
 *     tools/tex-import/cases/<card id>.mjs
 *
 * exporting `{ id, run }`, where `run(ctx)` receives:
 *
 *     ctx.require   — createRequire bound to run.mjs, so compiled modules are
 *                     required as ctx.require("../.build/src/scripts/import/<name>.js")
 *     ctx.importer  — the compiled facade, or null while card 052 is pending. Early
 *                     cases load their own module through ctx.require instead.
 *     ctx.assert    — throws on false, with a message
 *     ctx.approx    — number comparison with a tolerance
 *
 * Every file in `cases/` is discovered and executed automatically. One card,
 * one case file — no shared file to conflict on.
 */

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..", "..")
const IMPORT_SRC = path.join(ROOT, "src", "scripts", "import")
const BUILD = path.join(ROOT, "tools", ".build")
const FIXTURES = path.join(ROOT, "tests", "fixtures", "tex")
const EXPECTED = path.join(ROOT, "tests", "fixtures", "expected.json")
const CASES = path.join(HERE, "cases")
const require = createRequire(import.meta.url)

const argv = process.argv.slice(2)
const record = argv.includes("--record")
const caseFilter = argv.includes("--case") ? argv[argv.indexOf("--case") + 1] : null

const assert = (condition, message) => {
	if (!condition) throw new Error(message)
}

const approx = (actual, expected, eps = 1e-6) =>
	assert(Math.abs(actual - expected) <= eps, `expected ${expected} ± ${eps}, got ${actual}`)

function listTs(dir) {
	if (!fs.existsSync(dir)) return []
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listTs(full))
		else if (entry.name.endsWith(".ts")) out.push(full)
	}
	return out
}

function compile() {
	const sources = listTs(IMPORT_SRC)
	if (!sources.length) {
		console.log(`test:import — no modules in src/scripts/import yet (${listTs(IMPORT_SRC).length} files). Board cards 010+ still pending.`)
		return false
	}
	const tsc = path.join(ROOT, "node_modules", "typescript", "bin", "tsc")
	if (!fs.existsSync(tsc)) {
		console.error("test:import — local typescript not installed (node_modules/typescript/bin/tsc)")
		process.exit(1)
	}
	const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.test.json"], {
		cwd: ROOT,
		stdio: "inherit",
	})
	if (result.status !== 0) {
		console.error("test:import — compilation failed")
		process.exit(1)
	}
	return true
}

function loadImporter() {
	const file = path.join(BUILD, "src", "scripts", "import", "index.js")
	if (!fs.existsSync(file)) {
		console.warn(
			`test:import — ${path.relative(ROOT, file)} missing (card 052 pending); fixture acceptance skipped, case files only`
		)
		return null
	}
	return require(file)
}

function fixtureNames() {
	if (!fs.existsSync(FIXTURES)) return []
	return fs
		.readdirSync(FIXTURES)
		.filter((f) => f.endsWith(".tex"))
		.sort()
}

function runFixtures(importer) {
	const expected = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, "utf8")) : { files: {} }
	const rows = []
	const problems = []

	for (const name of fixtureNames()) {
		const source = fs.readFileSync(path.join(FIXTURES, name), "utf8")
		let outcome
		try {
			outcome = importer.texToSaveFile(source, name)
		} catch (error) {
			problems.push(`${name}: threw ${error.message}`)
			rows.push({ name, components: "throw", skipped: "throw", status: "FAIL" })
			continue
		}
		const { saveFile, result } = outcome
		const unsupported = (result.skipped || []).some((s) => /unsupported document/.test(s.reason))
		const row = {
			name,
			components: saveFile.components.length,
			skipped: result.skipped.length,
			unsupported,
			settings: result.settings,
			colors: result.colors,
		}
		rows.push(row)

		if (!record) {
			const want = expected.files?.[name]
			if (!want) problems.push(`${name}: not present in expected.json (run with --record)`)
			else if (want.components !== row.components) problems.push(`${name}: components ${row.components}, expected ${want.components}`)
			else if (want.skipped !== row.skipped) problems.push(`${name}: skipped ${row.skipped}, expected ${want.skipped}`)
		}
	}

	if (record) {
		const files = {}
		for (const row of rows.sort((a, b) => a.name.localeCompare(b.name))) {
			files[row.name] = {
				components: row.components,
				skipped: row.skipped,
				...(row.unsupported ? { unsupported: true } : {}),
				...(row.settings ? { settings: { european: row.settings.european, bipolesLength: row.settings.bipolesLength } } : {}),
				...(row.colors && Object.keys(row.colors).length ? { colors: row.colors } : {}),
			}
		}
		fs.writeFileSync(EXPECTED, `${JSON.stringify({ generatedBy: "npm run test:import -- --record", files }, null, 2)}\n`, "utf8")
		console.log(`test:import — recorded ${rows.length} files to ${path.relative(ROOT, EXPECTED)}`)
	}

	const pad = (s, n) => String(s).padEnd(n)
	console.log("")
	console.log(`${pad("FILE", 26)}${pad("COMPONENTS", 12)}${pad("SKIPPED", 9)}STATUS`)
	for (const row of rows) {
		const status = row.unsupported ? "unsupported" : row.skipped === 0 ? "ok" : "skipped"
		console.log(`${pad(row.name, 26)}${pad(row.components, 12)}${pad(row.skipped, 9)}${status}`)
	}

	const circuitikz = rows.filter((r) => !r.unsupported).length
	const unsupported = rows.filter((r) => r.unsupported).length
	console.log(`\n${rows.length} files: ${circuitikz} circuitikz, ${unsupported} unsupported, ${problems.length} failed`)
	for (const problem of problems) console.log(`  ! ${problem}`)
	return problems.length === 0
}

async function runCases(ctx) {
	if (!fs.existsSync(CASES)) return true
	const files = fs
		.readdirSync(CASES)
		.filter((f) => f.endsWith(".mjs"))
		.sort()
	if (!files.length) return true

	let failed = 0
	for (const file of files) {
		if (caseFilter && !file.startsWith(caseFilter)) continue
		const mod = await import(pathToFileURL(path.join(CASES, file)).href)
		const id = mod.id || file.replace(/\.mjs$/, "")
		try {
			await mod.run(ctx)
			console.log(`case ${id}: ok`)
		} catch (error) {
			failed++
			console.log(`case ${id}: FAIL — ${error.message}`)
		}
	}
	return failed === 0
}

const compiled = compile()
if (!compiled) process.exit(0)

const importer = loadImporter()
const fixturesOk = importer ? runFixtures(importer) : true
const casesOk = await runCases({ require, importer, assert, approx })
process.exit(fixturesOk && casesOk ? 0 : 1)