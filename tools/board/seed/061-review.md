---
id: "061"
title: "review — independent check of src/scripts/import/"
track: acceptance
pool: remote
wave: 6
size: M
deps: ["052"]
writes: []
---

## Goal

An agent that did not write the importer checks that the cards were actually
delivered, not just marked done. This is the only card with no `writes` field:
you produce **comments on issues**, not code.

## Checklist

For each card `010`–`055`, open the issue and verify:

1. **File exists** at the path listed in `writes` and is the only file changed by
   that card's commit (`git log --follow --name-only`).
2. **Contract matches** `src/scripts/import/types.ts` as written by card `000` —
   no local re-declarations of `Point`, `RawCommand`, `CoordResult`.
3. **DoD was executed**, not assumed: the acceptance command's output is quoted
   in the issue or reproducible by you.
4. **No cross-writes**: no card modified another card's file.
5. **No new dependencies**: `git diff package.json package-lock.json` is empty
   for the whole run.

Then check the whole:

6. `npm run build` passes on `main`.
7. `npm run test:import` prints `24 files: 23 ok, 1 unsupported, 0 failed`.
8. `grep -rn "console\." src/scripts/import/` shows no debug logging.
9. `src/scripts/import/` has no import of `MainController`, `CanvasController` or
   `@svgdotjs` — the core must stay runnable in Node.

## How to report

For every problem found, comment on the offending issue with:

```
review: <what is wrong>
evidence: <command output or file:line>
expected: <what the card asked for>
```

For every card that passes, comment `review: ok` — a silent pass is
indistinguishable from a skipped review.

## Verdict

Post a final comment on this issue:

```
review: <n>/<n> cards ok, <k> issues raised
blocking: <list of card ids or "none">
```

If `blocking` is not `none`, do **not** close card `063` (release) until the
listed cards are reopened and fixed.

## Acceptance

- Every card `010`–`055` has either `review: ok` or a defect comment.
- This issue has the verdict comment.
- No source file was modified by this card (`git status` clean).

## Out of scope

Fixing defects yourself. Raise them; the owner of the card fixes them.