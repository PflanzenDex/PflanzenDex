# Test log: US-POK-09 View details of a species (issue #95)

**Branch:** `feat/pok-09-details-zu-einer-art` (from `origin/dev` at `400e6f4`)
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54724, not the shared test database on 54329), API on port 55299 (the worktree port 55224 was taken by another process, so the API used 55299), web (Vite) on port 55724, Keycloak 26.8 in its own throwaway container (port 18861, realm import from the repo with the redirect address changed to `http://localhost:55724`, imported from a private directory). Chromium through Playwright (Europe/Berlin, de-DE); date 2026-10-04. The API ran against the own database URL (54724).
**Method:** red tests first, implementation, `make ci`, then a Playwright script (not checked in) against the real stack: two real Keycloak users (sign-in through the Keycloak form), species and specimens created through the API with the token of the real session, then the Pokédex page driven by mouse and keyboard at 1440x900 and 375x812. Screenshots in `pok-09/`, raw observations (texts, axe, horizontal scroll, tap targets) in `pok-09/observations.json`.

Legend: ✅ as expected · ⚠️ works, but something stands out · ❌ error · ⏭️ not checked

**Scope:** the page lists caught species only (no catalog tree US-POK-03, no wishlist US-WUN, no friends US-SOZ). Spec status is 🟨; the missing parts are under "Open points".

---

## 0. Red runs and gates

- ✅ Red runs saved before the implementation: `pok-09/red-core.txt` (2 of 15 failed), `pok-09/red-web.txt` (10 of 18 failed), `pok-09/red-api.txt` (1 of 11 failed). The exit code is not in the files (the capturing pipeline lost it; see the note at the end of each file).
- ⚠️ The first push was delayed: the pre-push gate (typecheck) cannot pass with tests that use props and fields that do not exist yet, so the red tests were committed locally and pushed together with the implementation.
- ✅ `make ci` exit 0 on the own database (port 54724) after the last code change before the manual run (a first run failed on lint complexity and function length rules and was fixed by extracting `addSpecimen`, `useDetail` and `useViews`). After the tap-target CSS fix found in this run, `make ci` was run again (see the PR).

## 1. Criterion: a tap opens a detail view with image, German name, short text, genus, catch status, specimen count, cultivar chips, source link and the link to the species profile

**Observed:**

- ✅ Tap on the card name or on the card area (click at the bottom right corner of the card) opens the detail view (`03-details-full-*.png`): "Geigenfeige" as heading, "Ficus … lyrata", "Gattung", "Familie: Moraceae (Maulbeergewächse)", "Status: gefangen", "3 Exemplare", "gefangen 04.10.2026", source link "Quelle öffnen (de.wikipedia.org)" (`href` is the catalog source), buttons "Zum Artprofil" and "Schließen".
- ✅ Cultivar chip `'Albispina'` shown in the details of the species with plain species and cultivar specimen (`04-details-cultivar-*.png`, 2 Exemplare).
- ✅ "Zum Artprofil" opens the species profile of the catalog (Arten tab, "Zurück zur Suche", profile of the species, `05-species-profile-*.png`).
- ⚠️ The larger image is not available: the detail view says "Noch kein Bild vorhanden." (the Wikipedia image comes with the taxonomy build, US-POK-03).
- ⚠️ The full short text is not available: "Kurztext: unbekannt" (same reason). A species without family or source shows "Familie: unbekannt" and "Quelle: unbekannt" (`02-details-no-data-*.png`), nothing is invented (P-08). The source link is the catalog's own source field, not yet the taxonomy build's.
- ⚠️ The caught date reads 04.10.2026 for every species: the create route sets `caughtAt` to today by design (FR-BES-04), so the date I sent was not used. The date logic itself is covered by the US-POK-07 tests.
- ✅ Automated: core tests (species ID and source on the card, plain species wins over a cultivar), web tests (content, unknown values, non-http source as plain text, profile link), API test (fields through the real route).

## 2. Criterion: at most one detail view open; closing is unambiguous

- ✅ Only one `region` "Details zu …" exists at any time and the list (all other cards) is hidden while it is open (`regionsOpen: 1`, `listHiddenWhileOpen: true`).
- ✅ Closing by the button "Schließen" and by Escape; after closing the focus returns to the card that opened it (`focusBack` is the species of the card). Opening by keyboard (focus the card, Enter) works; the focus moves to the heading of the details.
- ⏭️ Closing by browser back is not provided (the details are a state of the page, not a route).

## 3. Criterion: for Missing, the actions "to the wishlist" and "Friend has it"

- ⏭️ Not implemented: the page shows caught species only, so there is no Missing card (needs the species list of the catalog tree, US-POK-03); the wishlist (US-WUN) and friends (US-SOZ-07) do not exist yet. A test checks that no such action appears on a caught species.

## 4. Tenant isolation, layout, accessibility

- ✅ Second account sees "Noch keine Art gefangen. …" and no card button (`06-other-account-desktop.png`). No new table or write route; the route only gained the species ID and source of species the account can already read.
- ✅ No horizontal scroll and no enabled button, link or input under 47.5 px height at 1440x900 and 375x812 (list, both detail views, species profile). The first run found the source link at less than 48 px; fixed in `pokedex.css` and run again.
- ✅ axe (wcag2a, wcag2aa, wcag21a, wcag21aa): 0 violations on the list, both detail views and the species profile, both sizes.
- ⏭️ Dark scheme, screen reader and real touch devices were not tested.

## Open points

- Larger image and full short text need the taxonomy build (US-POK-03); the source link should then come from there.
- Missing cards with "to the wishlist" (US-WUN, `Source: Pokédex`, US-ENT-05) and "Friend has it" (US-SOZ-07) need the catalog tree, the wishlist and friends.
