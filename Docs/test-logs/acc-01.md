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
