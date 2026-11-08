#!/usr/bin/env node
/**
 * Task board for this repository — GitHub Issues as the source of truth.
 *
 * Zero dependencies. Node 20+ (global fetch).
 *
 *   node tools/board.mjs init
 *   node tools/board.mjs status [--ready] [--pool local|remote] [--json]
 *   node tools/board.mjs next --pool local
 *   node tools/board.mjs claim <id> --owner <agent>
 *   node tools/board.mjs done <id> --note "what was done"
 *   node tools/board.mjs block <id> --reason "..."
 *   node tools/board.mjs release <id>
 *   node tools/board.mjs export [path]
 *
 * Environment:
 *   GH_TOKEN / GITHUB_TOKEN   preferred
 *   BOARD_REPO                owner/repo, otherwise derived from `git remote get-url origin`
 */

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..")
const SEED_DIR = path.join(HERE, "board", "seed")
const LOCK_PATH = path.join(HERE, "board", ".lock")
const API = "https://api.github.com"

const LABEL_COLORS = {
	pool: "0e8a16",
	track: "1d76db",
	wave: "bfdadc",
	size: "d4c5f9",
	status: "fbca04",
	owner: "ededed",
	card: "000000",
}

// ---------------------------------------------------------------- utilities

const die = (msg) => {
	console.error(`board: ${msg}`)
	process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
	const positional = []
	const flags = {}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg.startsWith("--")) {
			const key = arg.slice(2)
			const next = argv[i + 1]
			if (next === undefined || next.startsWith("--")) flags[key] = true
			else {
				flags[key] = next
				i++
			}
		} else positional.push(arg)
	}
	return { positional, flags }
}

function gitRemote() {
	try {
		const url = execFileSync("git", ["remote", "get-url", "origin"], {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim()
		const match = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
		return match ? `${match[1]}/${match[2]}` : null
	} catch {
		return null
	}
}

function credentialToken() {
	try {
		const out = execFileSync("git", ["credential", "fill"], {
			cwd: ROOT,
			input: "protocol=https\nhost=github.com\n\n",
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
		})
		const line = out.split(/\r?\n/).find((l) => l.startsWith("password="))
		return line ? line.slice("password=".length).trim() : null
	} catch {
		return null
	}
}

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || credentialToken()
const REPO = process.env.BOARD_REPO || gitRemote()

if (!TOKEN) die("no GitHub token (set GH_TOKEN or configure git credentials)")
if (!REPO) die("cannot determine repository (set BOARD_REPO=owner/repo)")

async function api(method, endpoint, body) {
	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(`${API}${endpoint}`, {
			method,
			headers: {
				Authorization: `token ${TOKEN}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "circuitikz-board",
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		})
		if (res.status === 204) return null
		const text = await res.text()
		if (res.ok) return text ? JSON.parse(text) : null
		const retryable = res.status === 429 || (res.status === 403 && /rate limit/i.test(text))
		if (retryable && attempt < 2) {
			await sleep(2000 * (attempt + 1))
			continue
		}
		die(`${method} ${endpoint} -> ${res.status} ${text.slice(0, 300)}`)
	}
}

async function paginate(endpoint) {
	const out = []
	for (let page = 1; ; page++) {
		const sep = endpoint.includes("?") ? "&" : "?"
		const chunk = await api("GET", `${endpoint}${sep}per_page=100&page=${page}`)
		out.push(...chunk)
		if (chunk.length < 100) return out
	}
}

// ---------------------------------------------------------------- seed cards

function parseFrontmatter(text) {
	if (!text.startsWith("---")) return { data: {}, body: text }
	const end = text.indexOf("\n---", 3)
	if (end === -1) return { data: {}, body: text }
	const raw = text.slice(3, end).trim()
	const body = text.slice(text.indexOf("\n", end + 1) + 1)
	const data = {}
	let currentKey = null
	for (const line of raw.split(/\r?\n/)) {
		const listItem = line.match(/^\s+-\s+(.*)$/)
		if (listItem && currentKey) {
			if (!Array.isArray(data[currentKey])) data[currentKey] = []
			data[currentKey].push(unquote(listItem[1]))
			continue
		}
		const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/)
		if (!kv) continue
		const [, key, value] = kv
		currentKey = key
		if (value === "") data[key] = []
		else if (value.startsWith("[") && value.endsWith("]")) {
			const inner = value.slice(1, -1).trim()
			data[key] = inner ? inner.split(",").map((s) => unquote(s.trim())) : []
		} else data[key] = unquote(value)
	}
	return { data, body }
}

const unquote = (s) => s.replace(/^["']|["']$/g, "")

async function loadSeeds() {
	if (!fs.existsSync(SEED_DIR)) die(`seed directory missing: ${SEED_DIR}`)
	const files = (await fsp.readdir(SEED_DIR)).filter((f) => f.endsWith(".md")).sort()
	return Promise.all(
		files.map(async (file) => {
			const raw = await fsp.readFile(path.join(SEED_DIR, file), "utf8")
			const { data, body } = parseFrontmatter(raw)
			if (!data.id) die(`seed ${file} has no id`)
			return {
				file,
				id: String(data.id),
				title: String(data.title || file),
				track: String(data.track || "misc"),
				pool: String(data.pool || "local"),
				wave: String(data.wave || "1"),
				size: String(data.size || "S"),
				deps: Array.isArray(data.deps) ? data.deps.map(String) : [],
				writes: Array.isArray(data.writes) ? data.writes.map(String) : [],
				body,
			}
		})
	)
}

function issueBody(card, allIds) {
	const meta = [
		`**Card:** \`${card.id}\`  `,
		`**Track:** ${card.track} · **Pool:** \`${card.pool}\` · **Wave:** ${card.wave} · **Size:** ${card.size}  `,
		`**Writes:** ${card.writes.map((w) => `\`${w}\``).join(", ") || "—"}  `,
		`**Depends on:** ${card.deps.length ? card.deps.map((d) => `\`${d}\``).join(", ") : "—"}`,
	]
	if (allIds) meta.push(`  \n**Blocks:** ${allIds.filter((o) => o !== card.id && SEED_DEPS[o]?.includes(card.id)).map((o) => `\`${o}\``).join(", ") || "—"}`)
	return `${meta.join("\n")}\n\n${card.body.trim()}\n`
}

let SEED_DEPS = {}

// ---------------------------------------------------------------- labels/milestones

const labelName = (kind, value) => `${kind}:${value}`

async function ensureMilestone(title) {
	const existing = await paginate(`/repos/${REPO}/milestones?state=all`)
	if (!existing.some((m) => m.title === title)) {
		await api("POST", `/repos/${REPO}/milestones`, { title })
	}
}

// ---------------------------------------------------------------- lock

async function withLock(fn) {
	const deadline = Date.now() + 10_000
	let handle = null
	while (!handle) {
		try {
			handle = await fsp.open(LOCK_PATH, "wx")
		} catch (e) {
			if (e.code !== "EEXIST") throw e
			const stat = await fsp.stat(LOCK_PATH).catch(() => null)
			if (stat && Date.now() - stat.mtimeMs > 60_000) {
				await fsp.unlink(LOCK_PATH).catch(() => {})
				continue
			}
			if (Date.now() > deadline) die("board is locked by another agent (.lock is fresh)")
			await sleep(200)
		}
	}
	try {
		await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`)
		return await fn()
	} finally {
		await handle.close()
		await fsp.unlink(LOCK_PATH).catch(() => {})
	}
}

// ---------------------------------------------------------------- issue helpers

async function allIssues(state = "all") {
	return paginate(`/repos/${REPO}/issues?state=${state}`)
}

const cardLabel = (issue, prefix) => (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name)).find((n) => n.startsWith(prefix))

const labelsOf = (issue) => (issue.labels || []).map((l) => (typeof l === "string" ? l : l.name))

async function findIssueByCard(id, issues) {
	const label = labelName("card", id)
	const list = issues || (await allIssues())
	return list.find((i) => labelsOf(i).includes(label))
}

async function blockedByOpen(issueNumber) {
	const blockers = await api("GET", `/repos/${REPO}/issues/${issueNumber}/dependencies/blocked_by`)
	return blockers.filter((b) => b.state === "open")
}

async function addLabels(number, names) {
	await api("POST", `/repos/${REPO}/issues/${number}/labels`, { labels: names })
}

async function removeLabel(number, name) {
	try {
		await api("DELETE", `/repos/${REPO}/issues/${number}/labels/${encodeURIComponent(name)}`)
	} catch {
		/* not present */
	}
}

async function comment(number, body) {
	await api("POST", `/repos/${REPO}/issues/${number}/comments`, { body })
}

// ---------------------------------------------------------------- commands

async function cmdInit() {
	const seeds = await loadSeeds()
	SEED_DEPS = Object.fromEntries(seeds.map((s) => [s.id, s.deps]))
	const allIds = seeds.map((s) => s.id)

	console.log(`init: ${seeds.length} seed cards`)

	const existingLabels = new Set((await paginate(`/repos/${REPO}/labels`)).map((l) => l.name))
	const ensureLabel = async (kind, value) => {
		const name = labelName(kind, value)
		if (existingLabels.has(name)) return
		await api("POST", `/repos/${REPO}/labels`, {
			name,
			color: LABEL_COLORS[kind] || "ededed",
			description: `${kind} ${value}`,
		})
		existingLabels.add(name)
	}

	for (const kind of ["pool", "track", "wave", "size", "status", "owner"]) {
		const values = new Set()
		for (const s of seeds) {
			if (kind === "pool") values.add(s.pool)
			if (kind === "track") values.add(s.track)
			if (kind === "wave") values.add(s.wave)
			if (kind === "size") values.add(s.size)
		}
		if (kind === "status") ["in-progress", "blocked", "review"].forEach((v) => values.add(v))
		for (const v of values) await ensureLabel(kind, v)
	}
	const waves = [...new Set(seeds.map((s) => s.wave))].sort((a, b) => Number(a) - Number(b))
	for (const w of waves) await ensureMilestone(`Wave ${w}`)

	const issues = await allIssues()
	const byId = new Map()
	for (const issue of issues) {
		const label = cardLabel(issue, "card:")
		if (label) byId.set(label.slice("card:".length), issue)
	}

	const milestoneByTitle = new Map((await paginate(`/repos/${REPO}/milestones?state=all`)).map((m) => [m.title, m.number]))

	let created = 0
	for (const card of seeds) {
		if (byId.has(card.id)) continue
		const issue = await api("POST", `/repos/${REPO}/issues`, {
			title: `${card.id} — ${card.title}`,
			body: issueBody(card, allIds),
			labels: [
				labelName("card", card.id),
				labelName("pool", card.pool),
				labelName("track", card.track),
				labelName("wave", card.wave),
				labelName("size", card.size),
			],
			milestone: milestoneByTitle.get(`Wave ${card.wave}`) ?? undefined,
		})
		byId.set(card.id, issue)
		created++
		console.log(`  + ${card.id} #${issue.number} ${card.title}`)
		await sleep(1100)
	}

	let linked = 0
	for (const card of seeds) {
		const issue = byId.get(card.id)
		if (!issue) continue
		const existing = await api("GET", `/repos/${REPO}/issues/${issue.number}/dependencies/blocked_by`)
		const have = new Set(existing.map((e) => e.id))
		for (const dep of card.deps) {
			const blocker = byId.get(dep)
			if (!blocker) {
				console.warn(`  ! ${card.id}: unknown dependency ${dep}`)
				continue
			}
			if (have.has(blocker.id)) continue
			await api("POST", `/repos/${REPO}/issues/${issue.number}/dependencies/blocked_by`, { issue_id: blocker.id })
			linked++
			await sleep(300)
		}
	}

	console.log(`init: created ${created} issues, ${linked} dependency links`)
}

async function cmdStatus(flags) {
	const seeds = await loadSeeds()
	const seedById = new Map(seeds.map((s) => [s.id, s]))
	const issues = await allIssues()
	const byId = new Map()
	for (const issue of issues) {
		const label = cardLabel(issue, "card:")
		if (label) byId.set(label.slice("card:".length), issue)
	}

	const rows = []
	for (const seed of seeds) {
		const issue = byId.get(seed.id)
		const labels = issue ? labelsOf(issue) : []
		const owner = labels.find((l) => l.startsWith("owner:"))?.slice(6) || "-"
		const statusLabel = labels.find((l) => l.startsWith("status:"))?.slice(7)
		let status = "todo"
		if (!issue) status = "not-created"
		else if (issue.state === "closed") status = "done"
		else if (statusLabel) status = statusLabel

		let blockers = []
		if (issue && issue.state === "open" && !statusLabel) {
			blockers = (await blockedByOpen(issue.number)).map((b) => {
				const label = labelsOf(b).find((l) => l.startsWith("card:"))
				return label ? label.slice(5) : `#${b.number}`
			})
		}
		let blockedReason = "-"
		if (status === "todo" && blockers.length) {
			status = "blocked"
			blockedReason = blockers.join(",")
		}
		rows.push({
			id: seed.id,
			track: seed.track,
			pool: seed.pool,
			wave: seed.wave,
			status,
			owner,
			blockedBy: blockedReason,
			issue: issue ? issue.number : null,
			title: seed.title,
		})
	}

	let filtered = rows
	if (flags.pool) filtered = filtered.filter((r) => r.pool === flags.pool)
	if (flags.wave) filtered = filtered.filter((r) => r.wave === String(flags.wave))
	if (flags.owner) filtered = filtered.filter((r) => r.owner === flags.owner)
	if (flags.ready) filtered = filtered.filter((r) => r.status === "todo")
	if (flags.status) filtered = filtered.filter((r) => r.status === flags.status)

	if (flags.json) {
		console.log(JSON.stringify(filtered, null, 2))
		return
	}
	if (!filtered.length) {
		console.log("no cards match the filter")
		return
	}
	const pad = (s, n) => String(s).padEnd(n)
	console.log(`${pad("ID", 6)}${pad("TRACK", 12)}${pad("POOL", 8)}${pad("WAVE", 6)}${pad("STATUS", 15)}${pad("OWNER", 14)}${pad("BLOCKED", 12)}TITLE`)
	console.log("-".repeat(120))
	for (const r of filtered) {
		console.log(
			`${pad(r.id, 6)}${pad(r.track, 12)}${pad(r.pool, 8)}${pad("w" + r.wave, 6)}${pad(r.status, 15)}${pad(r.owner, 14)}${pad(r.blockedBy, 12)}${r.title}`
		)
	}
	const counts = filtered.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {})
	console.log(`\n${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  ")}`)
}

async function cmdNext(flags) {
	const pool = flags.pool || "any"
	const seeds = await loadSeeds()
	const issues = await allIssues()
	const owned = issues.filter((i) => i.state === "open" && labelsOf(i).some((l) => l.startsWith("owner:")))
	if (flags.owner && owned.some((i) => labelsOf(i).includes(`owner:${flags.owner}`))) {
		die(`WIP=1: ${flags.owner} already owns an open card`)
	}
	for (const seed of seeds.sort((a, b) => Number(a.wave) - Number(b.wave) || a.id.localeCompare(b.id))) {
		if (pool !== "any" && seed.pool !== pool) continue
		const issue = await findIssueByCard(seed.id, issues)
		if (!issue || issue.state !== "open") continue
		const labels = labelsOf(issue)
		if (labels.some((l) => l.startsWith("owner:") || l === "status:blocked" || l === "status:review")) continue
		const blockers = await blockedByOpen(issue.number)
		if (blockers.length) continue
		console.log(`${seed.id}  ${seed.title}`)
		console.log(`  issue: #${issue.number}  track: ${seed.track}  wave: ${seed.wave}  writes: ${seed.writes.join(", ") || "-"}`)
		return
	}
	console.log("no ready card in this pool")
}

async function cmdClaim(id, owner) {
	if (!owner) die("claim requires --owner <name>")
	await withLock(async () => {
		const seeds = await loadSeeds()
		const seed = seeds.find((s) => s.id === id)
		if (!seed) die(`unknown card ${id}`)
		const issues = await allIssues()
		const issue = await findIssueByCard(id, issues)
		if (!issue) die(`card ${id} is not on the board — run init`)
		if (issue.state === "closed") die(`card ${id} is already done`)

		const labels = labelsOf(issue)
		const holder = labels.find((l) => l.startsWith("owner:"))
		if (holder && holder !== `owner:${owner}`) die(`card ${id} is already claimed by ${holder.slice(6)}`)
		if (labels.includes("status:blocked")) die(`card ${id} is blocked — fix the reason or release it`)

		const mine = issues.filter((i) => i.state === "open" && labelsOf(i).includes(`owner:${owner}`) && i.number !== issue.number)
		if (mine.length) die(`WIP=1: ${owner} already owns #${mine[0].number}`)

		const blockers = await blockedByOpen(issue.number)
		if (blockers.length) {
			die(`card ${id} is blocked by ${blockers.map((b) => "#" + b.number).join(", ")}`)
		}

		await addLabels(issue.number, [`owner:${owner}`, "status:in-progress"])
		await comment(issue.number, `Claimed by \`${owner}\` at ${new Date().toISOString()}.\n\nWork in \`worktree_create task/${id}\`, run \`npm run build\` and the card's acceptance command before \`done\`.`)
		console.log(`claimed ${id} as ${owner} (issue #${issue.number})`)
	})
}

async function cmdDone(id, note) {
	await withLock(async () => {
		const issues = await allIssues()
		const issue = await findIssueByCard(id, issues)
		if (!issue) die(`card ${id} is not on the board`)
		if (issue.state === "closed") die(`card ${id} is already closed`)
		const labels = labelsOf(issue).filter((l) => l.startsWith("status:") || l.startsWith("owner:"))
		for (const label of labels) await removeLabel(issue.number, label)
		await comment(issue.number, `Done.${note ? `\n\n${note}` : ""}`)
		await api("PATCH", `/repos/${REPO}/issues/${issue.number}`, { state: "closed", state_reason: "completed" })
		console.log(`done ${id} (issue #${issue.number})`)
	})
}

async function cmdBlock(id, reason) {
	await withLock(async () => {
		const issues = await allIssues()
		const issue = await findIssueByCard(id, issues)
		if (!issue) die(`card ${id} is not on the board`)
		await addLabels(issue.number, ["status:blocked"])
		await comment(issue.number, `Blocked${reason ? `: ${reason}` : ""} — ${new Date().toISOString()}`)
		console.log(`blocked ${id} (issue #${issue.number})`)
	})
}

async function cmdRelease(id) {
	await withLock(async () => {
		const issues = await allIssues()
		const issue = await findIssueByCard(id, issues)
		if (!issue) die(`card ${id} is not on the board`)
		for (const label of labelsOf(issue).filter((l) => l.startsWith("status:") || l.startsWith("owner:"))) {
			await removeLabel(issue.number, label)
		}
		await comment(issue.number, `Released back to the pool — ${new Date().toISOString()}`)
		console.log(`released ${id}`)
	})
}

async function cmdExport(target) {
	const seeds = await loadSeeds()
	const issues = await allIssues()
	const byId = new Map()
	for (const issue of issues) {
		const label = cardLabel(issue, "card:")
		if (label) byId.set(label.slice(5), issue)
	}
	const lines = ["# Board snapshot", "", "Generated by `node tools/board.mjs export`. Do not edit by hand.", "", "| ID | Track | Pool | Wave | Status | Owner | Issue |", "| --- | --- | --- | --- | --- | --- | --- |"]
	for (const seed of seeds) {
		const issue = byId.get(seed.id)
		const labels = issue ? labelsOf(issue) : []
		const owner = labels.find((l) => l.startsWith("owner:"))?.slice(6) || "—"
		const status = !issue ? "not-created" : issue.state === "closed" ? "done" : labels.find((l) => l.startsWith("status:"))?.slice(7) || "todo"
		lines.push(`| ${seed.id} | ${seed.track} | ${seed.pool} | ${seed.wave} | ${status} | ${owner} | ${issue ? "#" + issue.number : "—"} |`)
	}
	const out = lines.join("\n") + "\n"
	const file = target || path.join(ROOT, "docs", "board-snapshot.md")
	await fsp.mkdir(path.dirname(file), { recursive: true })
	await fsp.writeFile(file, out, "utf8")
	console.log(`exported ${seeds.length} cards to ${path.relative(ROOT, file)}`)
}

// ---------------------------------------------------------------- main

const { positional, flags } = parseArgs(process.argv.slice(2))
const command = positional[0]

switch (command) {
	case "init":
		await cmdInit()
		break
	case "status":
		await cmdStatus(flags)
		break
	case "next":
		await cmdNext(flags)
		break
	case "claim":
		await cmdClaim(positional[1], flags.owner)
		break
	case "done":
		await cmdDone(positional[1], flags.note)
		break
	case "block":
		await cmdBlock(positional[1], flags.reason)
		break
	case "release":
		await cmdRelease(positional[1])
		break
	case "export":
		await cmdExport(positional[1])
		break
	default:
		console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("/**")[1].trim())
		process.exit(command ? 1 : 0)
}