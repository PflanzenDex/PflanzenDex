# shadcn compatibility: `info` and `diff` of the owned primitives against upstream

As of: 2026-11-26 · Issue 2509 (owner decisions d-132 and d-133) · Stories: ADR 0007, DS-01, FR-QG-21 · Evaluation only: no upstream fix is applied in this pull request. Each fix in the list below becomes a follow-up issue.

## Summary

- **`components.json` works.** `app/packages/web/components.json` maps `ui` to `@/shared/ui`, `utils` to `@/shared/lib/utils` and `tailwind.css` to `src/styles/tokens.css`. The CLI (version 4.23.1) reads it from the package root.
- **`info --json` lists the 13 owned primitives:** `badge`, `button`, `checkbox`, `dialog`, `field`, `form`, `input`, `label`, `select`, `sheet`, `skeleton`, `table`, `textarea`. The files are flat in `src/shared/ui` (`<name>.tsx`), which is the place the CLI looks in. The composites that sit there too (`form-bar`, `more-help`, `letter-strip`, `search-input`) are not listed (the CLI lists the names of the upstream registry). Saved as `info.json` (the absolute path of the machine is replaced by `app/packages/web`).
- **`diff` shows real differences with `add <name> --dry-run --diff`.** The command `shadcn diff <name>` is deprecated in this CLI version, and it answers `No updates found for <name>` for all 13 names, also with flat files. The command it names as its successor, `add <name> --dry-run --diff`, finds `src/shared/ui/<name>.tsx` and prints a unified diff. `--dry-run` writes nothing (checked with `git status` after the 14 runs). Never run `add` without `--dry-run` on an owned primitive: it overwrites the file.
- **The differences are mostly by design.** Our primitives carry the style guide (44 px targets, tokens, `texts()`, the network gate, `invalid`, the German labels) and use the `forwardRef` form and the separate `@radix-ui/*` packages. Upstream uses React 19 `ref` props, `data-slot` attributes and the unified `radix-ui` package. Four upstream details are worth a follow-up (next section).

## Upstream details worth a follow-up issue

1. **The textarea grows with its text.** Upstream sets `field-sizing-content` (CSS `field-sizing: content`). Ours is fixed at `min-h-[88px] resize-none` (`textarea.tsx`, line 13). Check the browser support on the four devices and at 200 % text before the change. Value: notes on a phone (P-11).
2. **Icons in a button do not shrink.** Upstream adds `[&_svg]:pointer-events-none`, `[&_svg]:shrink-0` and a default `size-4` for an SVG without a size class. The base class of our `button.tsx` has no SVG rule. Measure first: a long German label with an icon at 320 px and at 200 % text, before and after.
3. **A group of related controls has no group name.** Upstream `Field` family has `FieldSet`, `FieldLegend` and `role="group"` for a set of checkboxes or radios. Our `field.tsx` has no group semantics. Ask the `a11y-auditor` to check the checkbox and radio sets of the forms (WCAG 1.3.1 and 4.1.2) before any change.
4. **The table has no footer and no selected row.** Upstream exports `TableFooter` and styles `data-[state=selected]` rows. Ours has neither. Add them when the first table needs a total row or a selection.

Not taken, by design:

- the Radix `Select` (ours wraps the native `<select>`, ADR 0007, E-22);
- the Radix `Checkbox` (ours is the native box inside a 44 px row, with the network gate, US-QS-30);
- the English `Close` label of the upstream dialog (a literal, the UI text rule forbids it);
- the upstream `Skeleton`, which has no `aria-hidden` and no `SkeletonGroup` (DS-52, DS-56);
- the upstream `Label` without `optional` (SG-FORM-01).

## Method

All commands ran in `app/packages/web` with `DISABLE_TELEMETRY=1` and `SHADCN_DISABLE_TELEMETRY=1`, stdin closed.

| Command                                                   | Exit | Result                                                              |
| --------------------------------------------------------- | ---- | ------------------------------------------------------------------- |
| `npx shadcn@latest info --json`                           | 0    | the 13 primitives in `components`; paths from `components.json`     |
| `npx shadcn@latest diff <name>` (13 names)                | 0    | `No updates found for <name>.` for each name (false negative)       |
| `npx shadcn@latest add <name> --dry-run` (button)         | 0    | `~ src/shared/ui/button.tsx overwrite`: the CLI finds the flat file |
| `npx shadcn@latest add <name> --dry-run --diff` (14 runs) | 0    | a unified diff of each primitive (the files `diff-<name>.diff`)     |

The CLI shows the file it would write as `a/` (ours) and `b/` (upstream, after the CLI changed its imports to our aliases). In a `diff-<name>.diff` file a line that starts with `-` exists only in our file, a line that starts with `+` exists only in the upstream file. The CLI transforms the upstream import of `cn` to a placeholder (`"cn"`) that does not resolve in this package: this is the reason for the first lines of each diff. A primitive that needs another item (for example `field` needs `label` and `separator`) prints their diffs too; the files here hold the diff of the primitive's own file only.

Two names need a note:

- `sheet`: upstream `sheet` is the Radix side panel. Our `Sheet` is the Vaul bottom sheet (ADR 0007), which upstream calls `drawer`. `diff-sheet.diff` shows the unrelated Radix `sheet`; `diff-drawer.diff` shows our `sheet.tsx` against the upstream `drawer`. The second run used a scratch project outside the repository (the same `components.json`, our `sheet.tsx` copied as `drawer.tsx`), because the CLI compares files by their name.
- `form`: the upstream `form` item has no files (`No changes`). Our `Form` is the react-hook-form and zod family (DS-47, DS-48) and has no upstream text to compare.

## Result per primitive

`-` lines exist only in our file, `+` lines only in the upstream file.

| Upstream item | Our file                     | `-` | `+` | Main difference                                                                   |
| ------------- | ---------------------------- | --: | --: | --------------------------------------------------------------------------------- |
| `button`      | `src/shared/ui/button.tsx`   | 161 |  46 | roles (`tinted`, `plain`, `destructive-plain`), 44 px sizes, the network gate     |
| `badge`       | `src/shared/ui/badge.tsx`    |  20 |  31 | our states are neutral (SG-COLOR-01); upstream has `asChild` and more variants    |
| `label`       | `src/shared/ui/label.tsx`    |  22 |  12 | `optional` and `texts()`; upstream wraps the Radix `Label`                        |
| `skeleton`    | `src/shared/ui/skeleton.tsx` |  26 |   6 | `aria-hidden`, `SkeletonGroup`, reduced motion                                    |
| `table`       | `src/shared/ui/table.tsx`    |  68 |  95 | scroll region with a name; upstream has `TableFooter`                             |
| `checkbox`    | `src/shared/ui/checkbox.tsx` |  76 |  20 | native box in a 44 px row, `needsNetwork`; upstream wraps the Radix `Checkbox`    |
| `input`       | `src/shared/ui/input.tsx`    | 137 |  11 | `suffix`, `invalid`, enter-key hint, `TextField`                                  |
| `select`      | `src/shared/ui/select.tsx`   |  19 | 182 | native select (ADR 0007); upstream is the Radix `Select`                          |
| `textarea`    | `src/shared/ui/textarea.tsx` |  12 |   9 | upstream grows with its text (fix 1)                                              |
| `dialog`      | `src/shared/ui/dialog.tsx`   |  76 | 156 | scroll region, pinned bar, layer scope; upstream has header and footer parts      |
| `sheet`       | `src/shared/ui/sheet.tsx`    | 142 | 110 | unrelated item (Radix side panel), see the note above                             |
| `drawer`      | `src/shared/ui/sheet.tsx`    | 143 |  97 | Vaul bottom sheet: lazy panel, detents, loading state; upstream is the plain wrap |
| `field`       | `src/shared/ui/field.tsx`    |  40 | 228 | different component: ours labels one `Input`; upstream is a layout family (fix 3) |
| `form`        | `src/shared/ui/form.tsx`     |   0 |   0 | upstream item has no files                                                        |

## Notes on the tool

- `info --json` shows `frameworkVersion: null` and `tailwindCss: null` for this package. The `preset` block is the CLI's own guess (font Geist, theme neutral); the app uses Figtree. None of it changes what `add` or `view` do.
- `shadcn view <name>` and `shadcn docs <name>` read the upstream code and documents and need no local file.
- The CLI adds upstream code with `"use client"` at the top (for example `switch`). DS-07 forbids the directive. A new primitive from `add` loses it in the adapt step.

## Files

- `info.json`: the output of `npx shadcn@latest info --json`.
- `diff-<name>.diff`: the unified diff of one primitive (14 files, see the table).
