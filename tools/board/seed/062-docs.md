---
id: "062"
title: "README + CHANGELOG — document the .tex import"
track: acceptance
pool: local
wave: 6
size: S
deps: ["052"]
writes:
  - README.md
  - CHANGELOG.md
---

## Goal

Tell a user of the fork that `.tex` files can now be opened, with the limits
stated plainly.

## README.md

Add one section, English, near the existing "Load / Save" description:

```markdown
## Importing CircuiTikZ sources (.tex)

The load dialog accepts `.tex`, `.tikz` and `.pgf` files (as well as the native
`.json`). The importer handles hand-written CircuiTikZ drawings that use:

- `\draw` with `--` and `to[...]` paths;
- absolute `(x,y)`, relative `++(dx,dy)` and named `(A)` coordinates;
- `calc` forms `$(A)+(dx,dy)$` and `$(A)!t!(B)$`;
- sub-node anchors such as `(VT.G)`;
- `\foreach` loops (expanded by textual substitution);
- `\ctikzset`, `\definecolor` and `\usepackage[european,RPvoltages]{circuitikz}`.

After loading, a summary is shown: `imported N, skipped M`. Skipped lines are
listed in the developer console with their line numbers.

Not supported: plain-TikZ block diagrams (`positioning`, `block/.style`),
`circuitikz` environment syntax, `rectangle`/`arc`/`|-` paths, `\pgfmathsetmacro`.
```

## CHANGELOG.md

Add under a new heading at the top, keeping the existing style:

```markdown
## 0.9.0

### Added
- Import of hand-written CircuiTikZ `.tex` sources (24-file acceptance corpus).
- Import report: imported/skipped counts plus line-level diagnostics.
```

Do not invent an unreleased date if the file uses dates — mirror the existing
formatting and leave the version heading as `## 0.9.0`.

## Rules

- English only, no emoji.
- Do not restructure the README; one new section, nothing else.
- Do not claim support for anything in the "Not supported" list.

## Acceptance

- `git diff --name-only` is exactly `README.md` and `CHANGELOG.md`.
- The README section names every supported construct listed above and the four
  unsupported ones.
- Markdown renders: no broken tables, no unclosed code fences.

## Out of scope

Translating the README, changing the app UI, screenshots.