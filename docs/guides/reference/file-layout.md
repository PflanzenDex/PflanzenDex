# File layout: how to group files by topic

`make layout` checks the file layout (FR-QG-21, US-QG-09). The rules are in `app/config/lint/layout.config.mjs`, the check is `app/tools/check/code/layout/check-layout.mjs`. Files that belong to one topic stay together. A big topic holds more files, and a sub-topic becomes a subfolder (owner decisions d-136 and d-138 of 2026-11-26, issue 2546).

## Units

A unit is a folder, or a group of files that share the name before the first dot. `card.tsx`, `card.test.tsx` and `card.stories.tsx` are one unit. The `README.md` of a folder counts as one unit, so the `expect` of its manifest includes that unit. Entries that start with a dot do not count.

## The size hint

A folder with more than 8 units prints a hint, and `make layout` passes. A folder without a manifest fails above 16 units (twice the hint).

## Subfolders first

When the hint fires, the check looks for the longest name prefix that three or more files of the folder share. It prints the prefix and the number of files, as a proposal for a subfolder:

```text
check-layout: hint app/x: 10 units, size hint 8, no failure
check-layout:   4 files start with plant-layer-: a subfolder plant-layer/ is a proposal
check-layout:   or write a manifest: README.md frontmatter with topic, why and expect (FR-QG-21)
```

If no prefix has three files, the hint names no prefix and only offers the manifest.

## A manifest for a big topic

A folder that holds one topic can hold more units. Declare it in the frontmatter of its `README.md`:

```md
---
topic: Plant layer: the sheet and its tabs
why: one feature, every tab and its parts belong together
expect: 25
---
```

- `topic` (what the folder holds) and `why` (why its files belong together) are text and must not be empty.
- `expect` is a whole number above 0. The folder may hold up to `expect` units. An `expect` below 8 is allowed.
- With a manifest, the check prints no size hint while the folder holds no more units than `expect`.
- A `README.md` without frontmatter is no manifest.
- A manifest that is malformed fails with `LY-7`. The message names the path and the key that is missing or invalid.

## What stays hard

- A per-path rule in `app/config/lint/layout.config.mjs` is a hard limit. A manifest does not raise it. Since d-139 (issue 2546) no per-path rule sets a number: the fixed limits are manifests (see below), and `app/packages/*/src` keeps no limit.
- Kebab-case names, one folder per component and the collections (migrations, ADRs, test logs, dated spike folders) keep their rules. A manifest does not replace a name pattern.

## Approval

A new manifest and a raised `expect` count as baseline growth. `make merge` refuses such a pull request, so the owner merges it. A lowered `expect` and a removed manifest pass. A limit that a per-path rule of the merge base gave the folder carries over into its manifest and is no growth (d-139): the `expect` may be that limit plus one unit for a new `README.md`. The hook (`run.mjs`) and `make merge` judge it the same way.

## The limits moved into manifests (d-139)

Before issue 2546 four places had a fixed per-path limit: the app root (6 units), `app/tools/check/code` (8), `docs/guides/operations` (10) and the module folders `app/packages/*/src/*` (10, for the folders with more than 8 units). Each has a manifest now, and `expect` is the old limit plus the README unit: 7, 9, 11 and 11. The module root `app/packages/*/src` has no limit, and the collections keep their name patterns.
