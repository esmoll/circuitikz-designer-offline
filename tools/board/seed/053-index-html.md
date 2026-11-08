---
id: "053"
title: "index.html — accept .tex files in the load dialog"
track: pipeline
pool: local
wave: 1
size: S
deps: []
writes:
  - src/pages/index.html
---

## Goal

Let the file picker show `.tex`, `.tikz` and `.pgf` files. One attribute change.

## Current state

`src/pages/index.html`, the load-file input, currently reads:

```html
accept=".json,.txt"
```

## Change

```html
accept=".json,.txt,.tex,.tikz,.pgf"
```

Nothing else in the file changes. Do not rename ids, classes or handlers.

## Rules

- The input is also used for drag & drop; the attribute governs the picker only,
  so dropping a `.tex` file will work even before the dispatcher exists.
- Keep the existing attribute order and quoting style.

## Acceptance

```bash
grep -n "accept=" src/pages/index.html
```

shows `.json,.txt,.tex,.tikz,.pgf`.

```bash
git diff --name-only
```

is exactly `src/pages/index.html`.

```bash
npm run build
```

passes (parcel copies `index.html` verbatim, so a malformed attribute fails here).

## Out of scope

Handling the file after selection — that is card `054`.