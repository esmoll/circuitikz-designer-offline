# AGENTS.md

Guidance for AI agents working in this repository. Read this before claiming a card.

## Repository

Fork of CircuiTikZ Designer — an Electron + TypeScript + Parcel desktop app that
draws CircuiTikZ schematics. Default branch: `main`. Upstream is kept as the
`upstream-main` branch and the `upstream` remote; never commit to either.

Build: `npm run build`. There is no test framework in the project — do not add one.

## Task board

The board is GitHub Issues in this repository, driven by a zero-dependency script.

```
node tools/board.mjs status            # table of all cards
node tools/board.mjs status --ready    # cards with no open blockers
node tools/board.mjs next --pool local # first card you may take
node tools/board.mjs claim <id> --owner <agent>
node tools/board.mjs done  <id> --note "what was done"
node tools/board.mjs block <id> --reason "..."
node tools/board.mjs release <id>
```

Rules:

- **WIP = 1.** Do not claim a second card while you own one.
- Claim only through `board.mjs`. It holds `.board.lock`; hand-editing labels
  invites a duplicate claim.
- One card = one file in `writes`. `git diff --name-only` must match it exactly.
- Card bodies contain the contract, examples and Definition of Done. They are
  self-sufficient — you do not need any other conversation to start.
- `tools/board/seed/*.md` is a temporary archive of the card texts. Do not edit
  those files; they are removed by card 064 after v0.9.0.

## Working a card

1. `next --pool <your pool>` — take the returned id.
2. `claim <id> --owner <you>`.
3. `worktree_create task/<id>` and do the work there — never in the shared checkout.
4. Satisfy every item in the card's DoD and run `npm run build`.
5. `push origin task/<id>`.
6. `done <id> --note "..."`, then squash-merge into `main` after review.

Commits: one per card, message prefixed with the card id, e.g.
`030: coords/absolute — cm to px conversion`.

## Current run: CircuiTikZ `.tex` import

Goal: open 24 hand-written CircuiTikZ files in the designer.

- Corpus and acceptance fixtures: `tests/fixtures/tex/` (24 files).
- New code lives in `src/scripts/import/`; only two existing files change:
  `src/scripts/controllers/saveController.ts` and `src/pages/index.html`.
- Parser output is `ComponentSaveObject[]`, loaded through the existing
  `SaveController.loadFromJSON()`. Do not instantiate components directly.
- The importer must report `imported N / skipped M` plus the list of unparsed lines.

Locked decisions:

- Unknown construct — skip that line, record it in `skipped[]`, keep going.
- `cell.tex` is a plain-TikZ block diagram (`positioning`, `block/.style`), not
  circuitikz. It is out of scope: report it as unsupported and exit cleanly.
- Tests run as `npm run test:import` → `tsc -p tsconfig.test.json && node ...`.
  No new npm packages.

Tracks: contract, preprocess, scanner, coords, mapping, pipeline, acceptance.
32 cards total; `000` (types.ts) blocks most of them.

## Environment (Windows)

- PowerShell has no heredocs; `>` writes UTF-16 — use `-OutFile` / `Set-Content`.
- `git` writes progress to stderr and may exit 1 on success; check the output, not
  only `$LASTEXITCODE`.
- `gh` CLI is not installed. Use the GitHub REST API via `Invoke-RestMethod` or
  `fetch()`. The token comes from `GH_TOKEN`, falling back to `git credential fill`.
  The token has `repo` scope only — Projects v2 is unavailable and not needed.
- Console code page is cp866; Russian text garbles. Run `chcp 65001` or keep CLI
  output in English.

## Do not

- Push to `main` directly.
- Modify `package.json` unless the card's `writes` lists it.
- Add npm dependencies.
- Edit issues or the seed files by hand to route around the board script.
- Touch `node_modules/`, `dist/`, `out/`, `.parcel-cache/` — build artifacts.