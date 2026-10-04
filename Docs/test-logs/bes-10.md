# Test log: US-BES-10 Review and approve catalog proposals (issue #180)

**Branch:** `feat/bes-10-katalogvorschlaege-pruefen-und` (from `origin/dev`)
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54651, not the shared test database on 54329), API port 55151 and web (Vite) port 55651 started from this worktree against that database, Keycloak in its own throwaway container on port 55851 (realm import from the repo). Chromium via Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-04.
**Method:** automated tests first (core, db, api, web, all named with `US-BES-10`), then `make ci`, then a manual run with a Playwright script (not checked in) against the real stack. Three real Keycloak users were created: Mara (plant keeper, creator), Ben (plant keeper, bystander), Olga (operator; role row inserted into `account_role` in the own database). Proposals were created through the API with the tokens of the real sessions, the review itself was done through the UI. Screenshots at 1440x900 and 375x812 in `bes-10/`, raw measurements in `bes-10/observations.json`.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates

- ✅ `make ci` exit code 0 (before this manual run).
- ⏭️ `make e2e` (shared Playwright suite) was not run and no e2e test was added; the manual run replaces it for this story.
- ⚠️ The red runs of the test-first step were not recorded as files (the first agent was cut off by a rate limit); the tests were reviewed and extended by the second agent instead.

## 1. Criterion: review list with proposals, AI marking, required fields, sources, duplicate hint

- ✅ Operator Olga sees the tab "Prüfliste", the summary "21 offene Vorschläge, der älteste heute. Arbeite die Liste von oben nach unten ab." and per entry the fields, "Quelle" (or "unbekannt") and "Nutzervorschlag · angelegt heute" (`02-review-list-*.png`).
- ✅ A proposal without a source: "Freigeben" is disabled and the entry says "Freigabe noch nicht möglich: Quelle fehlt (Pflicht für Lichtbedarf und Ruhephase)" (`03-*.png`).
- ✅ Duplicate hint: a proposal whose name is contained in an approved species shows "Mögliche Dublette: …" with the existing species and a merge button (`04-duplicate-hint-desktop.png`).
- ⏭️ The AI marking ("KI-erstellt, noch nicht von Menschen geprüft") was not seen in the browser: no AI connection exists yet; core and web tests cover the badge.
- ⚠️ The list shows leftover proposals from aborted earlier runs of the script in the same own database (21 open); harmless, the database is thrown away.

## 2. Criterion: approve, reject with a reason, merge

- ✅ Approve: "Vorschlag freigegeben. Die Art ist jetzt für alle sichtbar."; Ben (not the creator) can now read the species (HTTP 200) (`05-*.png`).
- ✅ Reject: "Zurückweisen" is disabled until a reason is typed; after rejecting, Mara reads status `rejected` with the reason through the API, Ben gets 404 (the proposal stays private) (`06-*.png`).
- ✅ Merge: "Vorschlag zusammengeführt. 2 Exemplare übernommen; 1 Pflegeprofil übernommen." Mara's two specimens and her care profile now point to the target species, the proposal is gone for her (404) (`07-*.png`). Atomicity, the target rules and the marker conflict (409 `review.merge_conflict`) are covered by db and api tests, not by hand.
- ✅ The creator sees the rejection reason in the species view (`08-creator-sees-rejection-reason-desktop.png`).

## 3. Criterion: approval only with complete fields and a source; an AI connection can never approve

- ✅ Approval runs `checkApprovalReadiness` in the operation (core and api tests); the UI blocks it before (section 1).
- ⏭️ AI connection: does not exist yet, so only the missing role guards it (open point in the spec).

## 4. Criterion: roles and tenant isolation (P-04, FR-BES-11)

- ✅ Plant keeper Mara has no tab "Prüfliste" at 1440 and 375 (`01-*.png`); `GET /review` and `POST /review/:id/decide` answer 403 (`observations.json`).
- ✅ Two-account tests in `api/src/catalog/review.test.ts` and `db/src/collection/repointers.test.ts` (keeper cannot list, approve, reject, merge; foreign proposal invisible).

## 5. Layout and accessibility

- ✅ axe (wcag2a, wcag2aa, wcag21a, wcag21aa) on the list at 1440x900 and 375x812: no violations. Only the list view was scanned, not the states after actions.
- ✅ Mobile: no horizontal scroll; all buttons in the list and navigation at least 48 px high.

## Open points

- The creator cannot yet edit a rejected proposal (no species edit operation).
- The taxonomy build after approval (US-POK-03) and the re-pointing of wishes (WUN) do not exist yet; the port for wishes is ready.
- No runbook for the weekly routine (US-DEV-03).
- The creator gets no hint of their own after a merge; the specimens simply show the existing species.
