# Test log: US-BES-01 Choose a species from the catalog or create a new one (issue #57)

**Branch:** `feat/bes-01-art` (from `origin/dev`, merged again with `origin/dev` before the push)
**Environment:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54683 from `worktree-env.mjs`), API port 55183, web (Vite) port 55683, Keycloak 26.8 with the realm import from the repo (own throwaway container on port 18581, because the shared sign-in service on 18081 was restarted by another session during the test; the redirect address of the web client was extended by port 55683 at runtime via the admin API, not in the repo), Mailpit (shared, read only); Chromium via Playwright; date 2026-10-03.
**Method:** tests first (red runs in `bes-01/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script) against the real Keycloak. Test accounts were registered in the UI (`mara…@example.test`, `ben…@example.test`). Screenshots desktop 1440×900 and mobile 375×812 in `bes-01/`. The app UI is German; quoted UI texts are given verbatim.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

Note: the code was renamed to English after this test (e.g. table `art` is now `species`, `OHNE_KONTO_KENNUNG` is now `WITHOUT_ACCOUNT_ID`); the log keeps the names of the time of the test. The raw `red-*.txt` outputs are unchanged evidence of the German-named test runs.

---

## 0. Red runs before the implementation and gates

**Expected:** the tests from the criteria fail as long as the function does not exist; afterwards `make ci` is green.

**Observed:**

- ✅ Red before the implementation: `red-1-core.txt` (modules missing, 2 files), `red-4-api.txt` (all 9 API tests red), `red-5-web.txt` (module missing).
- ⚠️ `red-2-db.txt`: the database test also ran red, but only because the table `art` was missing (13 tests skipped, the cleanup step failed), not with individual red checks.
- ✅ `red-3-tenant-test.txt`: with the migration, but without an entry in `OHNE_KONTO_KENNUNG`, the generic tenant test fails on `art` and `art_name` (3 tests red); one further red test was an error in my test (wrong search term).
- ✅ `make ci` exit code 0 with all gates (lint, types, boundaries, baseline, knip, format, spec and traceability check, tests with coverage thresholds, build). Tests: api 39, core 114, db 61, web 41.
- ✅ The generic tenant test treats `art` and `art_name` as a justified exception and still demands enforced row rules (`KATALOG_TABELLEN`); a test proves that it raises an alarm if one of them is missing.
- ⚠️ The database tests were additionally run against a database with an owner without superuser rights (rule `katalog_freigegeben` needed): the 14 catalog tests pass. Several older tests of other stories fail in this setup because they query the tables with the owner instead of the application role; that is not part of this story.

## 1. Criterion: search by Latin or German name, see the profile and choose

**Expected:** the search finds a species in the catalog via the name; I see its profile (fields from DM-BES-01) and choose it.

**Observed:**

- ✅ Search for "bogenhanf" (German) and "dracaena" (Latin) finds "Dracaena trifasciata" (`12-after-approval-ben-*.png`, `13-…`); partial words, case and accents do not matter (DB and core tests).
- ✅ Profile with all fields from DM-BES-01 except image and attributes; what is missing stands as "unbekannt" (P-08) (`06-profile-proposal-*.png`).
- ✅ "Diese Art wählen" shows "Gewählt: Dracaena trifasciata …" (`07-species-chosen-*.png`).
- ⚠️ **Limit:** "choose" remembers the species only in the UI. The specimen for it arises with US-BES-02; the page says so openly.
- ⚠️ **Limit:** the catalog is empty (`01-catalog-empty-*.png`) until POK-03 or operator batches fill it. The search over approved species is proven with a species approved via a review case, not with a real catalog.

## 2. Criterion: species not in the catalog, "Art vorschlagen" with all required fields

**Expected:** form with required fields; status `Vorschlag`, visible only to me, review list; I can choose the species.

**Observed:**

- ✅ Without hits the page offers "Art vorschlagen" (`02-no-hits-*.png`); the form takes over the search text and explains visibility and review list beforehand (`03-form-empty-*.png`).
- ✅ Required fields (Latin name, difficulty, default level, lux, growth measure, etiolation signs, success criteria) are `required`; the empty submit attempt reports 6 invalid fields in the browser (the name was prefilled).
- ✅ Server check (browser check switched off): "Aloe vera var. chinensis" and lux 0 yield "Bitte prüfe: Lateinischer Name, Lichtbedarf." (`04-server-error-*.png`); nothing was written (test).
- ✅ Valid proposal: profile with badge "Vorschlag" and the note "nur für dich sichtbar … Art prüfen lassen, dann zählt sie." (`06-…`).
- ✅ A second account sees the proposal neither in the list nor by id (`11-foreign-account-sees-nothing-*.png`; API test: 404); an operator does not see private species either (script: 0 rows).
- ✅ The proposal lies as review case `vorschlag` in the creator's review list (DB test).
- ✅ After approval by an operator (via the database layer, the reviewer UI comes with BES-10) both accounts see the species as "Geprüft" without a proposal note (`12-…`, `13-…`).
- ⏭️ The path via the task to the AI client (US-KI-08) does not exist yet (R4).
- ⏭️ "I can still create a specimen" and "counts in the Pokédex after approval": depending on BES-02 and POK-06, not checkable.

## 3. Criterion: species without epithet

**Expected:** allowed as an entry, does not count as a Pokédex catch.

**Observed:**

- ✅ "Haworthia" can be proposed; the profile says "Nur die Gattung ist angegeben. Ein solcher Eintrag zählt nicht als Pokédex-Fang." (`10-genus-only-*.png`).
- ⏭️ The Pokédex itself does not exist; only the note is checked.

## 4. Criterion: duplicates and synonyms

**Expected:** the same normalized name or synonym is recognized and the existing species is referenced; the search finds synonyms (Sansevieria → Dracaena).

**Observed:**

- ✅ Search "sansevieria" shows "Dracaena trifasciata – Gefunden über Synonym: Sansevieria trifasciata" (`08-search-synonym-*.png`).
- ✅ Proposal "Sansevieria trifasciata" is rejected: "Diese Art gibt es schon …" with button "Vorhandene Art ansehen: Dracaena trifasciata", which opens the profile (`09-duplicate-*.png`). The same spellings with different case or spaces count as equal (tests).
- ⚠️ Private proposals of different accounts deliberately do not count as duplicates, otherwise the error would reveal foreign data; BES-10 merges them.
- ⚠️ On the first script run the list after "bogenhanf" still showed the result of the previous search, because the script read before the debounce (250 ms); on the second run the list is right. The debounce is no error, but a visible intermediate image.

## 5. Tenant isolation, repeat guard, P-08

- ✅ Row rules on `art` and `art_name`: foreign proposals are invisible, inserting only with an own review case, `erstellt_von` ≠ `nutzer` only for reviewers, no changing and deleting for the application (DB tests).
- ✅ The same `Idempotency-Key` creates no second species; without a key 400 (tests).
- ✅ Unknown values stay `null` and appear as "unbekannt"; no number is added. Limits (name 120, texts 200/1,000 characters, lux 1–200,000) are **assumptions**.

## 6. Mobile (375 px) and operation

- ✅ All states as a mobile screenshot; document width 375 px at a 375 px window (no horizontal scrolling) in all steps.
- ⚠️ In the desktop form, choice fields and input fields sit slightly offset in the two-column view (`09-duplicate-desktop.png`), because help texts make the row height different. Cosmetics, not fixed.
- ⚠️ The profile is long on mobile (18 fields one below the other); condensing would be follow-up work.
- ⚠️ Browser console: a `pageerror` ("Cannot read properties of null (reading 'addEventListener')", presumably on the Keycloak page, not attributed) as well as the expected 400 and 409 of the deliberate failed attempts.
- ⏭️ No contrast measurement, no screen reader test, no dark mode screenshot.

## Open points

- Catalog job (POK-03) and operator batches are missing: without them the catalog stays empty and only own proposals are visible.
- Editing an own proposal, versions (FR-BES-12) and image/attributes are missing.
- TE-08 lets every user create review cases with status `ki_ungeprueft`; the spec names this status for operator batches (visible to all). Here it stays private; the rights have to be clarified with the AI access (R4/R5).
