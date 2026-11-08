---
id: "063"
title: "release v0.9.0 — tag, CI build, published artifacts"
track: acceptance
pool: local
wave: 7
size: M
deps: ["060"]
writes: []
---

## Goal

Cut the release that contains the importer. This card changes no source files; it
tags, pushes and verifies the existing CI.

## Preconditions

- `npm run test:import` prints `24 files: 23 ok, 1 unsupported, 0 failed`.
- `npm run build` passes on `main`.
- Card `061` verdict is `blocking: none`.
- `package.json` version is `0.8.2` and must become `0.9.0`.

## Steps

1. `npm version 0.9.0 --no-git-tag-version` (updates `package.json` and
   `package-lock.json`), commit as `063: release 0.9.0`.
2. `git tag v0.9.0 && git push origin main --tags`.
3. Wait for the `Build & Release` workflow (`.github/workflows/release.yml`).
   It builds the Windows installers and attaches them to the release.
4. Verify the release page: three assets present, `SHA256SUMS.txt` matches the
   uploaded files.
5. Install the produced `Setup.exe` on Windows and import `buck.tex` once —
   a release that crashes on the first file is not a release.

## Rules

- Never `--force` a tag. If the tag is wrong, delete the release and the tag,
  fix, and start over.
- The workflow needs the `workflow` scope; it is already granted on this machine.
- Do not edit `release.yml` in this card — if it fails, raise a defect and block.

## Acceptance

- `git ls-remote --tags origin v0.9.0` returns the tag.
- Release `v0.9.0` exists with the three assets.
- The installer launches and imports `buck.tex` with `skipped 0`.
- `git status` clean, `main` == `origin/main`.

## Out of scope

Removing the seed cards (card `064`), documentation (card `062`).