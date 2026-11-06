# Test log: US-ACC-01 Register and sign in (issue #52)

**Branch:** `feat/acc-01-anmeldung` (base `origin/dev` @ `257be45`)
**Environment:** WSL2/Linux, Node 24, Docker; Keycloak 26.8.0 (`make auth-up`) with Mailpit, PostgreSQL 16 (own database `pflanzendex_acc01`), API on port 3000, web (Vite) on port 5173; browser Chromium via Playwright, locale `en`/Keycloak in German via `ui_locales=de`; date 2026-10-03.
**Method:** `make ci`, then the flow by hand in the browser against the real Keycloak. Screenshots desktop 1440×900 and mobile 375×812 in `acc-01/`. Test account: `lena@example.test`. The app UI is German; quoted UI texts are given verbatim.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

Note: the code was renamed to English after this test (e.g. column `subjekt` is now `subject`, `emailBestaetigt` is now `emailConfirmed`, `mitKonto` is now `withAccount`); the log keeps the names of the time of the test where it quotes them.

---

## 0. Gates

**Expected:** `make ci` runs green (lint, types, boundaries, format, tests, build).

**Observed:**
- ✅ `make ci` exit code 0 with its own test database. Tests: api 15, core 31, db 19, web 12, check scripts 17.
- ✅ The tests run without Keycloak (token with a locally generated key; account routes against real PostgreSQL).
- ⚠️ In CI (GitHub) no Keycloak runs: the flow below is proven **only manually**, not automated.

## 1. Criterion: registration with email and an established method (E-03)

**Expected:** start → "Konto anlegen" → registration form of the sign-in service (email, name), the password is not processed by us; after registration the person stands signed in in the app.

**Observed:**
- ✅ Start page with "Konto anlegen" and "Anmelden" (`01-start-mobile.png`, `01-start-desktop.png`).
- ✅ "Konto anlegen" opens the registration directly at Keycloak (`prompt=create`), German thanks to `ui_locales=de` (`02-registration-mobile.png`, `02-registration-desktop.png`).
- ⚠️ Without `ui_locales` the page appeared in English (browser language); fixed with the parameter.
- ✅ The registration form asks for **no password**; Keycloak 26.8 first demands email confirmation and then the password assignment (see 2). The password policy (at least 10 characters) applies: "Ungültiges Passwort: Es muss mindestens 10 Zeichen lang sein." (`04-password-too-short-mobile.png`).
- ✅ After a valid password, return to the app, signed in: "Hallo, Lena Beispiel", email visible (`05-signed-in-mobile.png`, `06-signed-in-desktop.png`).
- ✅ In the database there is exactly one account with `subjekt` = Keycloak `sub`, account data (email, display name "Lena Beispiel", `email_bestaetigt = true`). There is no password column (FR-ACC-03).
- ⏭️ Magic link and third-party sign-in: not configured (the criterion names them as alternatives; password is implemented).
- ⏭️ Registration with an already taken email: not checked; Keycloak reports there by default that the address is taken (hint of existence, deliberately not part of the criterion "wrong credentials").

## 2. Criterion: the email address is confirmed before data is shared with friends

**Expected:** the account receives a confirmation mail; without confirmation sharing is blocked.

**Observed:**
- ✅ After "Registrieren" Keycloak shows "E-Mail verifizieren" (`03-confirm-email-mobile.png`); the mail is in Mailpit with a link valid for 5 minutes; the link leads to the password assignment and then into the app.
- ✅ Control check: `emailVerified` set to `false` via the admin API, sign-in → Keycloak demands the confirmation again and does not let the person into the app (`13-confirm-email-again-mobile.png`). After clicking the new link they are signed in.
- ✅ API: a token with `email_verified: false` yields `emailBestaetigt: false` and `darfMitFreundenTeilen: false`; the barrier `nurMitBestaetigterEmail` answers `403 email_unbestaetigt` (API test with real database).
- ⚠️ The note "E-Mail-Adresse bestätigen …" in the app (unconfirmed state) is proven only by a component test: under this realm configuration an unconfirmed person does not get into the app at all (see above). It is a fallback level for later sign-in paths.
- ⏭️ Sharing with friends itself does not exist yet (SOZ); only the barrier is checked.

## 3. Criterion: the sign-in stays but is revocable

**Expected:** reloading the page stays signed in; "Auf allen Geräten abmelden" ends all sessions.

**Observed:**
- ✅ Reloading the page: still signed in (token in browser storage, renewal via refresh token).
- ✅ "Abmelden" ends the session at Keycloak and in the app; afterwards "Du bist abgemeldet." (`07-signed-out-mobile.png`).
- ✅ "Auf allen Geräten abmelden" (second browser context as a second device): before 3 sessions in the account API, afterwards "Du bist auf allen Geräten abgemeldet." (`10-signed-out-everywhere-mobile.png`). The refresh token of the second device then yields `invalid_grant`.
- ⚠️ **Finding during the test:** the first attempt failed (in the UI "… fehlgeschlagen"), because the account API delivers no CORS headers without `Accept: application/json`. Fixed (header set, test adjusted), then checked again.
- ⚠️ Access tokens are JWTs with a 5-minute lifetime and are verified by the API only locally: an already issued token of the second device stays valid for up to 5 minutes until it expires. Not measured, follows from the design.
- ⚠️ After signing out, the note "Du bist abgemeldet." was initially missing (the marker was deleted in the double effect run of React Strict Mode). Fixed and seen again.

## 4. Criterion: wrong credentials do not reveal whether the email exists

**Expected:** known email with wrong password and unknown email show the same message.

**Observed:**
- ✅ Both cases: "Ungültiger Benutzername oder Passwort." (text identical, `09-wrong-login-desktop.png` for the known case; login page `08-login-desktop.png`, `12-login-mobile.png`).
- ⏭️ No measurement of response times; brute-force protection is switched on in the realm (5 failed attempts), the lockout itself was not triggered.

## 5. API: verify token and set the account per request

**Expected:** without or with an invalid token 401; a valid token sets the account via `mitKonto`; foreign accounts are invisible.

**Observed:**
- ✅ `curl /konto` without token: `401`, `WWW-Authenticate: Bearer`, answer `nicht_angemeldet` without a reason.
- ✅ Tests with a local key: wrong issuer, wrong audience, expired, foreign signature, `alg: none` and nonsense are rejected.
- ✅ With a real Keycloak token the app delivers the own account (section 1).
- ✅ DB tests: simultaneous first sign-in (3 parallel calls) yields exactly one account; the sign-in path sees no rows without a subject; account data is separate per account; the generic tenant test stays green.
- ⏭️ Token with a wrong audience against the real Keycloak: checked only in the component test.

## 6. Mobile (375 px)

- ✅ Start page, sign-in, registration (Keycloak), signed-in view and signing out are readable in the screenshots without cut-off content; buttons 48 px high.
- ⏭️ No automatic test for horizontal scrolling and no contrast measurement.
- ⚠️ The pages of Keycloak use the default theme (not PflanzenDex design); adjustment is not part of this story.
- ⚠️ `favicon.ico` is missing (404 in the console).

## Open points

- The Keycloak flow is checked only manually (no Keycloak in CI); an integration test with a container would be follow-up work.
- The realm export is for development (`start-dev`, H2, `http`). Production operation (database, HTTPS, real mail relay, domains of the redirect URIs) belongs to TE-03/operation.
- Keycloak warns that "Full scope allowed" for the web client is outdated.

## 7. Another account on the welcome page (issue 667, 2026-11-06)

**Method:** keyboard walk with Playwright (Chromium, locale `de-DE`) against the Vite dev server on port 5173 of this worktree, desktop 1440×900 and phone 390×844. Keycloak was stubbed in the walk: its discovery document was answered locally and every other request to its origin was recorded and answered locally, so the shared sign-in service was not used. The walk script is not part of the repository.

**Keyboard walk (welcome page, both sizes):**

| # | Element | Visible focus | Result |
| --- | --- | --- | --- |
| 1 | "Anmelden" | ✅ yes | Tab order as in the view |
| 2 | "Konto anlegen" | ✅ yes | Tab order as in the view |
| 3 | "Anderes Konto" | ✅ yes, 48 px high, fully in view | Enter and Space send the browser to the sign-in service's logout endpoint with `client_id` and `post_logout_redirect_uri` (no `id_token_hint`) |
| – | Shift+Tab from 3 | ✅ | back to 2, then 1 (reverse order) |

The welcome page has no skip link because it has no navigation block; the first stop is the first action.

**Other checks:**
- ✅ `make a11y-routes` for the welcome route (axe and keyboard walk), run read-only: passes.
- ✅ `make one-screen` for the welcome route at 360×640 with 200 % text: passes after the copy change below. Before, the page was 808 px (label of two lines and the long tagline) and 712 px (one-line label) of 640 px high, because a third control costs 72 px at this size.
- ⏭️ Screen reader: none installed on this machine (orca and nvda not found); no spoken result.
- ⏭️ Zoom 400 %, user text spacing, forced colors and reduced motion: not walked by hand for this change (the control uses the existing button, no animation).
- ✅ The e2e tests of `sign-in.spec.ts` ran against a throwaway Keycloak, not the shared realm (section 8).

**Copy change for the owner:** the welcome tagline lost its second sentence ("Lege ein Konto an, um zu starten."), which repeated the "Konto anlegen" button, and the action label is "Anderes Konto". The longer label "Mit anderem Konto anmelden" wraps to two lines at 200 % text and overflows at 360×640.

## 8. "Konto anlegen" with a live sign-in of another person (issue 667, 2026-11-06)

**Environment:** Linux, Docker; Keycloak 26.8.1 with the repo realm import (redirect address of `pflanzendex-web` extended by port 55611 through the admin API) in a throwaway compose project on port 18991, with its own Mailpit on 18926; PostgreSQL 16 in this worktree's own container (port 54611, database `pflanzendex_test`, migrations 0001 to 0105); API port 55111, web (Vite dev server) port 55611. Chromium via Playwright 1.64.1, locale de-DE, time zone Europe/Berlin, phone viewport 390×844. The throwaway Keycloak, Mailpit and the worktree servers were removed after the run. The shared sign-in service (18081) and the shared test databases were not touched.

**Before the change (the reported state, measured):**
- Person A signed in; app storage cleared; welcome page; "Konto anlegen" opens the registration form of the sign-in service directly (`prompt=create`). A's sign-in service session is still alive (1 session).
- Registration of person B, mail link, password page, submit: the sign-in service shows "Da ist etwas schiefgelaufen. Sie sind in dieser Session bereits mit einem anderen Benutzer … angemeldet. Bitte melden Sie sich zuerst ab." (the refusal at the end of registration). A's session is still alive (1 session).
- Control, no session: "Konto anlegen" opens the registration at once; mail link, password, then signed in on "Heute".

**After the change:**
- With A's live session: "Konto anlegen" sends one silent check (`prompt=none`, a top-level redirect, no sign-in service page shown). The check returns with A's code; the existing sign-out path ends the session with its id token, so no logout page is committed in the browser; the return then sends one `prompt=create` request. B's registration completes and the app shows "Heute"; A's session count is 0.
- Without a session: one silent check returns `login_required` (about 110 ms locally, one request), then the registration opens. No logout page.
- The silent check is the same redirect that already runs once per tab on page load; it is the only extra step of the no-session path, and no sign-in service page is shown during it.

**e2e (`tests/sign-in.spec.ts`, projects mobil and desktop):** 16 passed. First run: 14 passed, 2 failed. The failures were the existing assertion "wrong credentials stay with the sign-in service" on both projects, which hard-coded the port 18081 of the shared sign-in service. The assertion now checks the realm path; the second run passed. The new tests: "US-ACC-01 Konto anlegen with a live sign-in of another person ends it first, then the registration opens" and "US-ACC-01 Konto anlegen without a sign-in opens the registration directly, with no sign-out page".

**one-screen (`welcome`, `account-news`, the screens of the changed copy):** 2 passed. `make one-screen` itself was not run, because its `auth-up` step starts the shared sign-in service.

**Not run:** screen reader, zoom 400 %, forced colors, reduced motion; the full `make e2e` (starts the shared sign-in service); `ds-snapshots` (no page story shows the changed texts: the welcome page is not a page story, and the news page has no snapshot).
