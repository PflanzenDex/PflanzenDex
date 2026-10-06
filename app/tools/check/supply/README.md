# Supply gates and the initial JS bundle report (QG-U6, FR-QG-10)

`check-bundle-budget.mjs` is the blocking budget gate; `report-bundle.mjs` is its report. `make bundle-report` prints where the initial JavaScript of the web app comes from, as Markdown. The CI job `ci` appends the same table to its job summary (step "Initial JS bundle report"). The report never fails and changes no threshold.

## What it measures

- Same definition of "initial" as the gate (`app/tools/check/supply/check-bundle-budget.mjs`, DS-08): the entry chunk, its modulepreloads and everything they import statically, in gzip bytes (1 kB = 1000 bytes). The total matches the gate's number.
- The script (`app/tools/check/supply/report-bundle.mjs`) builds the web app once more into `app/packages/web/node_modules/.cache/bundle-report` with `vite build --sourcemap` (a CLI flag; the Vite config is untouched) and reads the sourcemaps.
- Per chunk: the real gzip size of each initial file.
- Per package: the minified bytes the sourcemap attributes to an npm package (`react-dom`, `@radix-ui/react-dialog`, ...) or to our own code (`web/<directory>`, `core/<directory>`). A chunk's gzip size is shared by those byte shares, so the package column is an **estimate** (gzip is not additive) that sums exactly to the total. `(unattributed)` is code without a source (bundler glue). Only the 25 largest packages are listed; the rest is one summed row.

## Targets

| Number                    | Value  | Effect                                                                                          |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Hard limit                | 136 kB | `bundle.initialJsGzipBytes` in `app/quality-limits.json`; the blocking gate; only ever lowered. |
| Working target (starting) | 140 kB | Assumption (owner decision 2026-10-06, phones are the main target). Report only, never blocks.  |

The gap between the target and the limit is not room to spend: the target is where the bundle should move, the limit is the ratchet.

## How to read it

1. Compare the total with the target line at the top. "Over the working target" is the current state, not an error.
2. Per package, look for large shares that a story did not need on first load: a library used by one route (load it lazily, DS-08), a second library for the same job, an icon import that pulls a whole set.
3. A new entry in the table after your change names the package that grew the bundle; check whether it can load with its route.

## When the ratchet may be lowered

- After a change that makes the measured total clearly smaller (lazy loading, a dropped dependency), lower `bundle.initialJsGzipBytes` to the new measurement plus a small headroom, in the same PR or a follow-up (FR-QG-16/18). Never raise it.
- Lowering is a change to a gate file: its own PR with the reason, human merge (US-QG-07).
- The working target is lowered or dropped only by the project owner. It is not a gate; do not byte-golf below the hard limit just to meet it.
