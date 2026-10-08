# Test log: US-POK-06 Derive ownership automatically from my plants (issue #92)

**Branch:** `feat/pok-06-besitz-automatisch-aus-meinen` (from `origin/dev` at `aab2a30`)
**Environment:** Linux, Docker; PostgreSQL 16 in its own container (port 54754 from `worktree-env.mjs`), API port 55254, web (Vite) port 55754, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18806 (the shared sign-in service on 18081 was not touched). The realm is a copy with the redirect address changed to `http://localhost:55754`; the test accounts `anna` and `ben` were created through the admin API (email confirmed, sign-in with the email address). Chromium through Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-04.
**Method:** tests first (red runs in `pok-06/red-*.txt`), then implementation, `make ci`, then operation by hand (Playwright script, not checked in) against the real Keycloak, API and database. Species and specimens were created through the API with the token of the signed-in account (the token was read from the browser session), the Pokédex view was operated in the browser. Screenshots desktop 1440×900 and mobile 375×812 in `pok-06/`, raw observations (texts, axe, target sizes) in `pok-06/observation.json`. The throwaway Keycloak, the servers and the database container were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but something stands out · ❌ error · ⏭️ not checked

**What this is about:** which species an account has "caught" is derived live from its active specimens (P-01), never stored. `speciesKey` (core) cuts the Latin name down to species and chip, `pokedexOwnership` (core) counts active specimens per species, `GET /pokedex/ownership` (API) serves it, the tab "Pokédex" (web) shows it. Collector cards (number, photo, catch date, missing species) are other stories (POK-01, POK-07 to POK-09) and not part of this one.

---

## 0. Red runs and gates

- ✅ `red-core.txt`: 13 of 17 tests red (the key and the derivation were placeholders that return nothing; the 4 green ones check "nothing" and pass vacuously).
- ✅ `red-api.txt`: 3 of 6 red (the route was a placeholder with an empty answer).
- ✅ `red-web.txt`: 6 of 6 red (the page was a placeholder that renders nothing).
- ✅ `make ci` on this branch: exit 0 with its own test database (port 54754): lint, types, boundaries, format, tests with coverage (web lines 98.4 %), build.
- ⚠️ One API test (the read-only check) first counted all specimens of the shared database and failed once because other test files write in parallel. It now counts the specimens of its own account only.

## 1. Criterion: species = first two words, hybrid sign skipped

**Expected:** `Citrus x limon` becomes `Citrus limon`; case is normalized (`ficus BENJAMINA` → `Ficus benjamina`).

**Observed:**

- ✅ Covered by the unit tests of `speciesKey` (`species-key.test.ts`: normalization, `x` and `×`, extra white space). Not re-run one by one here (they are part of `make ci`).
- ⏭️ Not done by hand: the species catalog rejects a name with a hybrid sign (it accepts only `Genus epithet 'Cultivar'`, see `parseLatin`), so a hybrid cannot be created through the app. The rule is used when such names exist (catalog build, POK-02/03).

## 2. Criterion: additions appear as a chip, not in the assignment

**Expected:** `Opuntia microdasys var. albispina` is the species `Opuntia microdasys` with the chip `var. albispina`.

**Observed:**

- ✅ By hand: the species `Opuntia microdasys` and `Opuntia microdasys 'Albispina'` give **one** card "Opuntia microdasys" with the chip `'Albispina'` and "2 Exemplare" (`02-caught-and-unidentified-*.png`).
- ✅ `var.`, `subsp.`, `f.` and the quoted cultivar are covered by the unit tests of `speciesKey` and of the ownership (`ownership.test.ts`).
- ⏭️ `var.`, `subsp.` and `f.` cannot reach the view by hand: they belong to the specimen extra (DM-BES-02), which does not exist yet. Today only a cultivar from the catalog name becomes a chip. Recorded in the spec status.

## 3. Criterion: caught = at least one active specimen; archived does not count

**Expected:** an active specimen catches its species; an archived one does not.

**Observed:**

- ✅ With five active specimens of four species plus one cutting the page says "4 Arten gefangen" (Aloe vera, Citrus limon, Ficus lyrata, Opuntia microdasys). After archiving the Aloe specimen (reason "abgegeben") and reloading it says "3 Arten gefangen" and the Aloe card is gone (`03-after-archive-*.png`).
- ⚠️ A **cutting** counts as caught (the Ficus lyrata cutting). The spec says "active specimen"; in this code base every non-archived specimen is active (`isActive`, the same rule as in the lists and the distribution). That is an assumption, to be confirmed for the Pokédex.

## 4. Criterion: missing epithet does not count and the app points it out

**Expected:** `Hippeastrum` (and `Parodia sp.`) does not count; the app says "identify the species, then it counts".

**Observed:**

- ✅ The specimen of the species `Hippeastrum` is not among the caught species. Under "Noch nicht gezählt" a card says that it does not count yet and "Bestimme die Art, dann zählt es." (P-09, P-10).
- ⚠️ The sentence reads „Hippeastrum – Amaryllis“ (Hippeastrum): the specimen name already contains the Latin name when the species has no German name (here the test species used its Latin name as German name), so the name is repeated. Cosmetic, not changed.
- ⏭️ `Parodia sp.` by hand: the catalog does not accept the dot, so the case is only in the unit tests.
- ⏭️ The action is text only; there is no link to the specimen or the species yet (the species of a specimen cannot be changed, no operation for that exists).

## 5. Tenant isolation (P-04, P-05)

**Expected:** an account sees only its own species.

**Observed:**

- ✅ Account `ben` sees "Noch keine Art gefangen. Lege ein Exemplar mit bestimmter Art an, dann zählt es." and none of the names of `anna` (`05-other-account-empty-*.png`, no leak in `observation.json`).
- ✅ After `ben` creates the species `Echeveria elegans 'Perle'` and a specimen, his page shows exactly that card with the chip `'Perle'` and again none of `anna`'s names (`06-…`).
- ✅ Two-account tests in core (`ownership.test.ts`) and API (`ownership.test.ts`). The route has no table, so there is no new generic tenant test.

## 6. Layout, accessibility, wording

- ✅ Mobile (375×812) and desktop: no horizontal scroll in any state; the cards stack to one column on the phone, two columns on desktop.
- ✅ Tap targets of the navigation: all 48 px high (`observation.json`, `navTargets`).
- ✅ axe (WCAG 2.1 A/AA) on the Pokédex view with caught species, light and dark scheme: no violations. The footer contrast finding of #249 is fixed on `dev`.
- ✅ Dark scheme looks right (`04-dark-desktop.png`).
- ⏭️ Keyboard: the page has no controls besides the navigation; one Tab from the "Pokédex" tab moved the focus to the next tab. No further check.
- ⏭️ Screen reader not checked (list with the label "Gefangene Arten" and the chips list "Zusätze" are in the markup).
- ⏭️ Loading and error states (failed request, "Erneut laden") only through the web tests, not by hand.

## 7. Open points

- Collector cards (number, family grouping, catch date, photo, "not caught yet", search, filters) need the catalog tree and the stories POK-01, POK-03, POK-07 to POK-09. The view here lists only caught species.
- `var.`, `subsp.`, `f.` as chips wait for the specimen extra (DM-BES-02).
- To confirm: whether a cutting counts as caught.
- Wording of the unidentified card when the species has no German name (name repeats the Latin name).
- Environment: the first run of the script failed because the API was started against a database name that does not exist; the database of the container is `pflanzendex_test`. Not a product finding.
