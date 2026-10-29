# Supply gates and the initial JS bundle report (QG-U6, FR-QG-10)

`check-bundle-budget.mjs` is the blocking budget gate; `report-bundle.mjs` is its report. `make bundle-report` prints where the initial JavaScript of the web app comes from, as Markdown. The CI job `ci` appends the same table to its job summary (step "Initial JS bundle report"). The report never fails and changes no threshold.

## What it measures

- Same definition of "initial" as the gate (`app/tools/check/supply/check-bundle-budget.mjs`, DS-08): the entry chunk, its modulepreloads and everything they import statically, in gzip bytes (1 kB = 1000 bytes). The total matches the gate's number.
- The script (`app/tools/check/supply/report-bundle.mjs`) builds the web app once more into `app/packages/web/node_modules/.cache/bundle-report` with `vite build --sourcemap` (a CLI flag; the Vite config is untouched) and reads the sourcemaps.
- Per chunk: the real gzip size of each initial file.
- Per package: the minified bytes the sourcemap attributes to an npm package (`react-dom`, `@radix-ui/react-dialog`, ...) or to our own code (`web/<directory>`, `core/<directory>`). A chunk's gzip size is shared by those byte shares, so the package column is an **estimate** (gzip is not additive) that sums exactly to the total. `(unattributed)` is code without a source (bundler glue). Only the 25 largest packages are listed; the rest is one summed row.

## Targets

| Number     | Value  | Effect                                                                                                                |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Goal       | 125 kB | `GOAL_BYTES` in `report-bundle.mjs` (owner decision 2026-10-29, ADR 0018). Report only, never blocks.                 |
| Hard limit | 140 kB | `bundle.initialJsGzipBytes` in `app/config/gates/quality-limits.json`; the blocking gate; a fixed ceiling (ADR 0018). |

The gap between the goal and the limit is room for a story that cannot load its code lazily, not room to spend: the goal is where the bundle should stay, the limit is where a PR stops.

## How to read it

1. Compare the total with the goal line at the top. "Over the goal" is not an error, but the PR says why and what will bring it back.
2. Per package, look for large shares that a story did not need on first load: a library used by one route (load it lazily, DS-08), a second library for the same job, an icon import that pulls a whole set.
3. A new entry in the table after your change names the package that grew the bundle; check whether it can load with its route.

## When the numbers change

- The hard limit is a fixed ceiling, not a ratchet: it stays at 140 kB when the bundle shrinks (ADR 0018). Until 2026-10-29 it was lowered to the measurement plus about 5 kB after every saving (170 → 152 → 136 → 125 kB); at 125.0 of 125.0 kB every web change failed the gate, and freeing room would have meant byte-golfing in the framework code (react-dom, react-router, tailwind-merge), not in our own.
- Changing the limit or the goal is an owner decision and a change to a gate file: its own PR with the reason, human merge (US-QG-07). Raising the limit again needs a new ADR that names what the extra code buys.
- When the total is over the goal, the next story that touches the web app first looks for code that can leave the first load (a library used by one route, DS-08).
