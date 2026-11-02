# Test log: accessibility per route (FR-QG-24, QG-U7, issue 467)

Date: 2026-11-02. Local run on the developer machine; CI is the reference environment and rebuilds the baseline from its artifact.

## Method

- Register: `app/packages/e2e/support/display/screens.json` (121 screens: views, layers, dialogs, sign-in pages), the register of the one-screen gate (issue 1137). The web unit tests `routes-register.test.ts` and `layer-host-guard.test.ts` fail on a route or layer without an entry.
- Run: `make a11y-routes` (Playwright project `a11y-routes`, 4 workers, `TAXONOMY_BUILD=off`, demo seed `states`). Each screen is opened once at 390x844 and resized to 1920x1080; every non-GET call to the API is aborted.
- axe: tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa; impact serious or critical counts.
- Keyboard walk (Tab only): `reach`, `focus-visible`, `not-hidden`, `no-trap` (Shift+Tab goes back; Escape closes a modal layer, checked at desktop size), `skip-link` (signed-in screens without click steps).
- Baseline: `app/config/gates/baselines/a11y-routes-baseline.json`, entries `{screen, size, kind, rule, count}`.

## First run

242 measurements (121 screens x 2 sizes), 3 min 37 s with 4 workers. Findings:

| size | kind | rule | screens | elements |
| --- | --- | --- | --- | --- |
| 390x844 | axe | label-content-name-mismatch | 1 | 2 |
| 390x844 | keyboard | focus-visible | 3 | 7 |
| 390x844 | keyboard | not-hidden | 1 | 5 |
| 1920x1080 | axe | label-content-name-mismatch | 6 | 28 |
| 1920x1080 | keyboard | focus-visible | 3 | 7 |
| 1920x1080 | keyboard | not-hidden | 1 | 1 |

Baseline: 15 entries. Where they come from:

- `focus-visible`: the Keycloak sign-in pages (`welcome-keycloak-*`: username, password and e-mail fields show no ring).
- `not-hidden`: `collection-plants-course`, the file inputs `photo-action-*` receive the focus but are covered.
- `label-content-name-mismatch`: the wishlist rows and sheets (`collection-view-wishlist*`, `wishlist-wish-layer`).
- No finding for `reach`, `skip-link` or the Escape check.

First attempt, for the record: a `no-trap` finding on 21 single-control layers (Shift+Tab stays on the only control) was a flaw of the walk, not of the app; the check now needs more than one interactive element.

## Verification

- A second full run against the written baseline passed (128 tests: 121 screens and 7 self-tests).
- Deliberate break: `a[href="/collection"]:focus-visible { outline: none; box-shadow: none; }` in `tokens.css` made the screen `today` fail with `today at 390x844: keyboard focus-visible, 1 element(s): a "Sammlung"` (and the same at 1920x1080); reverted.
- `npm run a11y-routes:baseline -- <results.json>` rebuilt a byte-identical baseline from the results file of the full run.
