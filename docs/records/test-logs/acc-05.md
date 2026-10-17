# Test log: US-ACC-05 Access by invitation only (issue #56)

**Branch:** `feat/acc-05-zugang-nur-per-einladung`
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54805, a fresh database `acc05_manual` inside it, migrations 0001-0018 applied, dropped afterwards), API port 55305 (started with `DATABASE_URL` pointing at that database), web (Vite) port 55805, Keycloak 26.8 with the repo realm import in a throwaway container on port 55971 (redirect address of client `pflanzendex-web` changed to port 55805 in a copy of the realm file outside the repo, throwaway admin password). The shared test database (54329) and the shared sign-in service (18081) were not touched. Chromium via Playwright, locale de-DE, time zone Europe/Berlin; date 2026-10-04.
**Method:** automated tests (core, db, api, web), `make ci`, then a manual run with a throwaway Playwright script (not checked in): users created through the Keycloak admin API (verified email), the operator role granted by SQL in the throwaway database (roles are assigned administratively, never through the app), everything else through the UI at 1440x900 and 375x812, fresh users per viewport, axe (wcag2a/aa, 21a/aa) on the operator page and the invitation form. The script ran four times while fixing findings (section 5); the counts in the last screenshots therefore include accounts and codes of the earlier runs. Screenshots and raw observations are in `acc-05/` (`observation.json`).

Legend: ✅ as expected · ⚠️ works, with a finding · ❌ error · ⏭️ not checked

## 0. Gates and red evidence

- ✅ `make ci` exit 0 on the last commit before this log (see the PR for the final run).
- ✅ Red evidence before implementing, exit code 1 each: `acc-05/red-core.txt` (`newInvitationCode is not a function`, 46 failed) and `acc-05/red-web.txt` (`./invitation-page` missing).
- ✅ Review round 1, red first (exit code 1): `acc-05/red-idem-core.txt` (kernel `secret` operations and the invitation replay: 3 failed), `acc-05/red-idem-api.txt` (the idempotency table holds the plain code: 1 failed), `acc-05/red-rls-db.txt` (row security on both tables: 1 failed).
- ✅ Re-captured honest reds for db and api (the first captures were invalid: an old stale container, and a setup bug in the test that was fixed before the first commit): the implementation was temporarily replaced by stubs and restored afterwards. `acc-05/red-db.txt`: 15 failed, 11 passed (with the stub, tests that only expect a rejection pass vacuously); `acc-05/red-api.txt`: 14 failed, 7 passed (the gate tests still pass because the gate lives in the middleware, which was not stubbed).
- ⏭️ `make e2e` (shared suite) not run; no e2e test added.

## 1. Criterion: registration only with a valid invitation code, as long as the operator set it that way

- ✅ Tests: db `access.test.ts` (mode off by default, only the operator switches it, new subject not admitted while on), api `access.test.ts` (403 `invitation.required` on every protected path, no account created), web `invitation-page.test.tsx`, `session.test.tsx`, `App.test.tsx`.
- ✅ By hand: the operator switches on "Nur mit Einladungscode erlauben"; the page says "Im Moment: nur mit Einladungscode" and the status line "Registrierung: ab jetzt nur mit Einladungscode." (`04-mode-on-*.png`).
- ✅ By hand: a person who signs in at Keycloak without an app account sees the form "Einladungscode" and no navigation (`05-invitation-form-*.png`); the database has no account for the subject (`newcomer-accounts-before: 0`).
- ✅ By hand: a wrong code shows "Dieser Einladungscode ist ungültig, abgelaufen oder schon benutzt. ..." in an alert, keeps the input and puts the focus on the field; still no account (`06-code-wrong-*.png`).
- ✅ By hand: a valid code, typed in lower case with spaces, creates the account and lands in the app without the tab "Betreiber" (`07-registered-*.png`, `newcomer-accounts-after-valid: 1`).
- ✅ By hand: an existing account signs in as before while the mode is on.
- ✅ By hand: after "Für alle öffnen" a new person gets an account without a code.
- ⚠️ Registration at Keycloak itself stays open (realm setting, not part of the app): a stranger can still create a sign-in identity, but gets no account and no data. Owner decision, see PR.

## 2. Criterion: codes are single-use and expire

- ✅ Tests: db (20 concurrent registrations with one code: exactly one account, 19 `invalid`; expired and just-expiring codes refused; an existing account keeps the code unused; two codes racing for one subject use up at most one), core (CSPRNG port with exactly 15 bytes, grouping, normalization, validity 1-30 days, default 7).
- ✅ By hand: the used code is refused with the identical text and creates no account (`08-code-used-*.png`, `used-same-text-as-wrong: true`).
- ✅ By hand: a code whose expiry was moved into the past by SQL is refused with the identical text (`expired-same-text-as-wrong: true`), and the person then registers with the third, valid code.
- ✅ The database holds only hashes: no row contains a plain code (`db-plain-code-anywhere: 0`); the code is shown once in `03-code-created-*.png` and is gone after a reload (`code-in-page-after-reload: false`).
- ⚠️ Default validity 7 days, limits 1-30 and a code length of 120 bits are assumptions (starting values). Expiry is an UTC instant; the list shows it in the profile time zone.
- ⚠️ No rate limit on redeeming (guessing 120-bit codes is infeasible; no oracle between unknown, used and expired). A per-subject limit can come with general API rate limits.

## 3. Criterion: the operator sees accounts, active users and cost per user, no content

- ✅ By hand: "Konten", "Aktive Nutzer (letzte 30 Tage)" and "Kosten pro Nutzer: unbekannt (die Kostenmessung gibt es noch nicht)" (`02-operator-overview-*.png`); the list of invitations shows only state and dates (`09-operator-after-*.png`).
- ⚠️ The cost per user is "unbekannt" because the cost measurement (NFR-16, TE-10) does not exist; no number is invented (P-08). This is why the story is 🟨.
- ⚠️ "Active" means: opened the app (loaded the own account) in the last 30 days. Assumption, starting value; `last_active_at` is the only source.
- ✅ Tests: db sweep (the operator account reads no row of any other account in any tenant table except the review cases that reviewers read by design, US-BES-10), no row rule uses `is_operator()`, overview carries only counts, mode and invitation states (core, api).
- ✅ By hand and tests: a plant keeper and a reviewer get 403 `access.denied` on `GET /operator/overview`, `POST /operator/invitations` and `PUT /operator/registration` (`keeper-*` observations, api tests), and never see the tab "Betreiber".

## 4. Tenant isolation (P-04)

- ✅ `invitation` and `access_setting` have no `account_id`: justified entries in `WITHOUT_ACCOUNT_ID`; the application role has no right on them (tested: `permission denied` even for the operator) and reaches them only through `security definer` functions that check the operator role in the database again. Two-account tests: a keeper and a reviewer cannot create, read, switch or redeem; `findSchemaViolations` and the generic tenant test are green.

## 5. Findings during the run

- ❌ → ✅ Script, not app: the first run read the old code before the new one appeared, so two "codes" were the same and the "expired" case tested a used code. Fixed in the script (wait for the new code); the third run checked three distinct codes (`codes-distinct: 3`).
- ❌ → ✅ The label "Einladungscode" sat directly under the hint text (no spacing, `06-code-wrong-*.png` of the earlier run). Added spacing to the form.
- ⚠️ The invitation list grows without paging (the database returns at most 100, an assumption); after many codes the page gets long (`09-operator-after-mobil.png`).

## 6. Layout and accessibility

- ✅ Desktop 1440x900 and mobile 375x812: no horizontal scroll and no interactive element below 48 px height on the operator page and the invitation form (measured, `observation.json`, `small: []`); axe reported no violations on both pages.
- ⏭️ Screen reader and keyboard-only passes by hand not done; the form is a native form (Enter submits) and focus moves to the field after a refusal (tested).

## Open points

- Owner decisions: close self-registration in the Keycloak realm when the invitation phase starts; decide the source and shape of the cost measurement (TE-10) so "Kosten pro Nutzer" can show a number; whether the mode should default to "invitation only" on a public deployment (today off, so nothing changes for existing installations).
- `invitation.create` is marked `secret`: nothing of it is stored in `idempotency`; a repeat with the same key creates another code. A client that loses the answer must create a new code.
