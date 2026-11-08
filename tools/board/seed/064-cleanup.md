---
id: "064"
title: "cleanup — remove seed cards and switch the board to issues-only"
track: acceptance
pool: local
wave: 7
size: S
deps: ["063"]
writes:
  - tools/board/seed/
  - AGENTS.md
---

## Goal

`tools/board/seed/*.md` was a bootstrap archive: it existed so the card texts
survived in git while the feature was being built. After `v0.9.0` the issues are
the only source of truth, and the seeds become a stale duplicate — two places to
edit, one of them wrong.

## Steps

1. Confirm every card `000`–`063` is closed. If one is not, this card is blocked.
2. `git rm -r tools/board/seed` — the directory disappears from the tree; the
   files stay in history (`git log -- tools/board/seed`).
3. Make `tools/board.mjs` fail with a clear message when the seed directory is
   missing **and** the command needs it:
   - `init` → `board: seed directory removed after v0.9.0; cards live in issues`
   - `status` / `next` / `claim` / `done` / `block` / `release` / `export` must
     keep working **without** seeds, reading titles, tracks, pools and
     dependencies from the issues themselves (`card:` label, `blocked_by` links,
     `wave:*` / `pool:*` / `track:*` labels).
4. Update `AGENTS.md`: delete the sentence about `tools/board/seed/*.md` and the
   card-064 reference; the board section stays otherwise unchanged.
5. Commit as `064: board is issues-only, seed archive removed`.

## Notes for the implementation

- `status` currently joins seeds with issues. Without seeds, iterate issues that
  carry a `card:` label and read `track`/`pool`/`wave` from their labels.
- Card order for `next`: `wave` label ascending, then `card` label ascending.
- `export` writes the same table, with the title taken from the issue title
  (strip the `NNN — ` prefix).

## Acceptance

- `node tools/board.mjs status` prints all 32 rows, no error, no seed directory.
- `node tools/board.mjs init` fails with the message above and exit code 1.
- `grep -rn "board/seed" --include=*.mjs --include=*.md .` returns nothing.
- `npm run build` passes; `git status` clean.

## Out of scope

Deleting closed issues, changing labels, touching the importer code.