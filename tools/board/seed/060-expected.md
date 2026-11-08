---
id: "060"
title: "tests/fixtures/expected.json — acceptance baseline for all 24 files"
track: acceptance
pool: local
wave: 6
size: M
deps: ["052"]
writes:
  - tests/fixtures/expected.json
---

## Goal

Freeze the acceptance numbers so that any later change to the importer is checked
against a recorded baseline instead of a human eyeballing the canvas.

## What to produce

`tests/fixtures/expected.json`:

```json
{
  "generatedBy": "npm run test:import -- --record",
  "files": {
    "buck.tex": { "components": 17, "skipped": 0, "settings": { "european": true, "bipolesLength": 1.0 }, "colors": { "ink": "#1f2a33" } },
    "vsi3ph.tex": { "components": 42, "skipped": 0, "settings": { "european": true, "bipolesLength": 1.0 }, "colors": {} },
    "cell.tex": { "components": 0, "skipped": 1, "unsupported": true }
  }
}
```

One entry per file in `tests/fixtures/tex/`, all 24.

## How to generate

1. Add `--record` support to `tools/tex-import/run.mjs` (the runner exists and
   accepts it after card `002`/scaffolding; if not, coordinate on the board).
2. Run `npm run test:import -- --record` — it writes the file from real output.
3. **Read the numbers before committing.** Recording a broken run freezes the
   bug. For every file, check:
   - `skipped === 0` for all 23 circuitikz files;
   - `cell.tex` has `components === 0`, `unsupported: true`;
   - component counts are plausible: `buck.tex` (a buck converter) should have
     roughly 10–20 components; `vsi3ph.tex` (three-phase inverter with
     `\foreach`) should have 40+.
4. Commit the file and re-run in verify mode (no `--record`).

## Acceptance

```bash
npm run test:import
```

prints one line per file and exits 0:

```
buck.tex            17/17   0 skipped
...
cell.tex             0/0    1 skipped (unsupported)
24 files: 23 ok, 1 unsupported, 0 failed
```

And:

```bash
git diff --name-only
```

is exactly `tests/fixtures/expected.json`.

## Out of scope

Fixing importer bugs found while recording — report them on the board
(`node tools/board.mjs block 060 --reason "..."`) instead of patching other cards'
files.