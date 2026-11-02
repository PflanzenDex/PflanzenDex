# Test log: US-QS-14 sign-in pages, Gewächshaus split (issue #666)

**Branch:** `chore/qs-14-redesign-the-sign-in` (PR #1055), branched from `dev` (merge base `1167ca11`), date 2026-10-30.
**Owner decision:** direction A "Gewächshaus split" (issue #666, comment of 2026-10-30).
**Environment:** Linux (CachyOS, kernel 7.3), Node 24.21.0, Chromium 1248 with Playwright 1.64.1 (headless), locale `de-DE`, colour scheme emulated (`light` and `dark`), Keycloak 26.8.1 (the image version of `app/config/dev/compose.yaml`), axe-core 4.14.0 through `@axe-core/playwright`.

## Setup and what was not touched

The shared auth server of this machine (port 18081) and its mail catcher (port 18025) were **not** used, restarted or changed. No `make auth-up`, no realm or user change there. The theme was tested in a separate, throwaway setup:

- Keycloak container `pdx-kc-theme-test` from the same image, port 18091, `start-dev --import-realm`, the realm file and the theme of this worktree mounted read-only. Its own H2 data, so the shared instance and its database are not involved. The test users of the realm import exist only there.
- Mail catcher `pdx-kc-theme-mailpit` (port 18092) in its own docker network `pdx-kc-theme-net`. The verification and reset links were read from it.
- The web app (Vite dev server of this worktree) on `http://localhost:5173`, the only redirect origin the realm allows, with `VITE_OIDC_AUTHORITY` pointing to the throwaway instance. No API was running; the welcome page needs none.
- Accounts created in the throwaway realm: one per combination of width and colour scheme (`pdx360l`, `pdx360d`, `pdx1280l`, `pdx1280d`), removed at the start of each run.
- For the consent page, "consent required" was switched on for the throwaway client `pflanzendex-web` for one step and switched off again at the end of the run.
- Whether the theme changes need a restart: no. The throwaway instance picked up each change of the theme files on the next page load.

The driver was a Playwright script in the scratch directory, not in the repository. Screenshots are full-page, 360 × 640 px (the issue's phone size) and 1280 × 800 px, light and dark, reduced to 128 colours (as in the earlier logs). Each page state was checked with axe-core, rules `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.

Legend: ✅ as expected · ⚠️ works, with a remark · ❌ error · ⏭️ not checked.

Summary: every expectation is met; the remarks are marked ⚠️ in their sections and listed under "Open points"; two items are ⏭️ (section 6). No ❌.

## 0. Gates and tests

**Expected:** the guards and the unit tests of the changed code pass; `make ci` is green.

**Observed:**

- ✅ `node --test app/tools/keycloak/theme.test.mjs`: 11 tests pass. They cover: the realm and the theme offer German only; no external request in any theme file; the Figtree file is WOFF2 and its licence ships with it; the theme colours equal the ADR 0017 tokens of `tokens.css` in light and dark; text, boundary and warning pairs meet the contrast minimum in both schemes; fields and the primary button are 48 px high; reduced motion and forced colours are in the stylesheet; the texts use the "du" form; the registration link is an outline button under the sign-in text; the drawing is `aria-hidden`; the drawing paths and the three value lines equal those of the web welcome page.
- ✅ `npx vitest run src/account src/shell/app` in `app/packages/web`: 10 files, 173 tests pass, among them the welcome tests named `US-QS-14 …`.
- ✅ `make secrets` (gitleaks, no secrets in the history) and `make workflows` (actionlint, no findings).
- ✅ `npm run gates` parts, each run on its own: lint, typecheck, boundaries, db-indexes, migration numbers, baseline, design system, stories, knip, specs, principles, skills, reference (RF-3: the frame sits in `account/views`, not in the component inventory), duplicates, dup, prettier, CI drift, docs (markdownlint of the protocol and the reference doc).
- ✅ `npm run layout` (LY-3) after the owner-decided gate change of issue #1077 (PR #1079, merged into this branch without rebase, merge `65bd8086`): the one exemption `app/config/dev/keycloak-theme/**/messages/messages_*.properties` waives the name rule of LY-3 for Keycloak message bundles and nothing else. Before that change the layout gate failed on `messages_de.properties`, which Keycloak needs under this exact name.
- ✅ `make test` (coverage run through `make coverage`): api 90 files, 852 tests (3 skipped); core 156 files, 1841 tests; db 69 files, 581 tests; web 211 files, 2283 tests. The first web run under low free memory had 10 failing tests in three files, all timeouts of 5 s or lazily loaded views; isolated reruns passed, and the full web suite passed on a second run.
- ✅ `npm run build` (web), ✅ `npm run bundle-budget` (initial JS 122.7 kB gzip, allowed 140 kB), ✅ `npm run crap`.
- ❌ `npm run conformance:blocking`: one finding, `ui-checkbox--focus` (light): the checkbox input shows no focus indicator on Tab (DS-37). The checkbox component and the tokens are not changed by this PR (checked with `git diff`); the finding is not from this change, and I did not run it on `dev`. The owner tracks the DS-37 focus-ring rule in PR #1068 (merged) and reports that the checkbox check passed on a rerun elsewhere; it was not re-run on this branch.
- `make ci` runs its steps in order and stops at the first failure. After the gate change, `make gates` passes on this branch (the pre-push hook ran it on the merged tree and it passed). The coverage, build, bundle budget, CRAP and conformance steps were run one by one as listed above.

## 1. Welcome page of the web app (frame shared with the sign-in service)

**Expected:** one frame for the welcome page and the sign-in pages: on a phone a band with the drawing above the content; on a wide screen a calm panel with the drawing and the three value lines beside the content; the wordmark, the filled button "Anmelden" and the outline button "Konto anlegen"; no language choice.

**Observed:**

- ✅ `00-welcome-360-light.png` and `00-welcome-360-dark.png`: band with the drawing (64 px high), wordmark "PflanzenDéx" as the only heading, one line of text, "Anmelden" filled, "Konto anlegen" outline. Dark mode follows the system.
- ✅ `00-welcome-1280-light.png` and `…-dark.png`: left panel with the drawing and the three value lines, right column with the content, centred vertically.
- ✅ Axe: 0 violations at all four combinations.
- ✅ Page title "Anmelden – PflanzenDéx", language `de`, Figtree loaded (`document.fonts.check`), no horizontal scroll.

## 2. Sign-in page

**Expected:** heading "Willkommen zurück"; fields "E-Mail oder Benutzername" and "Passwort"; "Angemeldet bleiben" and "Passwort vergessen?" on one row; filled "Melde dich an"; "Noch kein Konto?" and the outline "Konto anlegen"; no language dropdown.

**Observed:**

- ✅ `01-sign-in-360-light.png` (504 px content height at 360 px), `01-sign-in-360-dark.png`, `01-sign-in-1280-light.png`, `01-sign-in-1280-dark.png`: all as expected. Fields 48 px high, the boundary is the input token (`#71717a` light, `#7c7c86` dark), the focus ring is visible.
- ✅ No `<select>` on the page; the locale is `de`.
- ✅ `02-sign-in-error-360-light.png` (and the dark and 1280 variants): the wrong password shows "Ungültiger Benutzername oder Passwort." under the username, in destructive colour and with the icon, the page still fits 360 × 640 (533 px content height).

## 3. Other pages of the sign-in service

| Page | Shot names (360 and 1280, light and dark) | Content height at 360 px | Remark |
| ---- | ----------------------------------------- | ------------------------ | ------ |
| Registration | `03-registration-…`, `03b-registration-error-360-light.png` | 539 px; 566 px with a name conflict (`03b`) | ✅ fits; first and last name side by side on a phone |
| Verify email | `04-verify-email-…` | 431 px | ✅ the "Du musst …" message is a warning (yellow tokens) |
| Forgot password | `05-forgot-password-…` | 455 px | ✅ |
| Forgot password, sent | `06-forgot-password-sent-…` | 584 px | ✅ fits 640 px |
| Update password (after the e-mail confirmation) | `07-update-password-…` | 536 px | ✅ heading "Passwort festlegen" in one line |
| Update password (reset link) | `07b-update-password-reset-…` | 515 px | ✅ |
| Error page (invalid redirect URI) | `08-error-…` | 233 px | ⚠️ the browser title reads "Anmelden – PflanzenDéx" (see open points) |
| Logout confirmation | `09-logout-confirm-…` | 258 px | ✅ title "Abmelden – PflanzenDéx" |
| Consent (requires consent) | `10-consent-…` | 375 px | ⚠️ scope names come from the base theme ("E-Mail Adresse", "Benutzerprofil", "Nutzerrollen") |

**Expected (all pages):** the frame of section 1, the du texts, the same controls, no scrolling sideways, no axe violation.

**Observed:**

- ✅ Every page shows the wordmark, the drawing on the phone band and the value lines on the wide screen.
- ✅ The flows ran end to end in each of the four combinations: wrong password (error), registration, verification through the mail link, password set on the update page, forgot password, reset through the mail link, new password accepted, sign-in with it, logout confirmation, consent.
- ✅ Axe: 0 violations in all 48 page states (12 pages × 4 combinations). On the sign-in page axe reports 21 passed rules and colour contrast passed on 11 nodes. The rule `aria-valid-attr-value` first reported the empty `aria-invalid` of the base field template; `field.ftl` of the theme now sets it only on an error, and the rule is passed.
- ✅ Measured heights are the bottom of the content inside `main` and `header`, not the page height (the page itself is at least the viewport).

## 4. Accessibility checks beyond axe

**Expected:** WCAG 2.2 AA checks that axe does not do: reflow at 320 px, 200 % text, forced colours, reduced motion, 48 px targets.

**Observed:**

- ✅ Reflow at 320 px (sign-in with error): `scrollWidth` 320 = `clientWidth` 320, no horizontal scroll.
- ✅ 200 % text size on the sign-in page at 360 px: `scrollWidth` 360 = `clientWidth` 360 (the page becomes longer, as it should).
- ✅ Forced colours (`forced-colors-01-sign-in-360-light.png` and `…-dark.png`): the system colours carry the field boundaries, the primary button gets a 2 px `ButtonText` border, the focus outline is `Highlight`, and the error text and icon stay visible. The drawing keeps its colour; it is decorative.
- ✅ `prefers-reduced-motion: reduce`: transition of the buttons `0s`.
- ✅ Focus: the field in focus shows a 2 px ring in the ring token, offset 2 px; the PatternFly blue focus line of the form control and the button shadow layer are switched off.
- ✅ Targets: fields and buttons are 48 px high (44 px minimum); the password toggle is 48 × 48 px.
- ✅ Colour pairs (computed from the stylesheet, WCAG 2 luminance): text on background 16.97 : 1 (light) and 17.90 : 1 (dark); muted text on background 7.41 : 1 and 7.68 : 1; the primary button text 6.46 : 1 and 9.21 : 1; the input boundary on the card 4.83 : 1 and 4.38 : 1; the focus ring on the background 6.19 : 1 and 10.93 : 1; the warning text on the warning fill 7.42 : 1 and 8.24 : 1.

## 5. Requests and privacy (P-04, P-05)

**Expected:** no request leaves for a third party.

**Observed:**

- ✅ All requests of the full run went to `localhost:5173` (1820 requests, the app and its modules) and `localhost:18091` (568 requests, the throwaway Keycloak). No other host.
- ✅ The font is the self-hosted `figtree-latin-wght-normal.woff2`, the drawing is inline SVG, the styles and scripts come from the Keycloak theme. The only external-looking string is the SVG namespace (`http://www.w3.org/2000/svg`), which is not requested.

## 6. Not checked here

- ⏭️ `make e2e`: needs the shared auth server (`make auth-up`), which this run must not touch. The e2e tests use the welcome heading "PflanzenDéx", the buttons "Anmelden" and "Konto anlegen", and the fields `#username`, `#password` and `#kc-login`; all of them are kept, and the e2e sign-in test was read, not run.
- ⏭️ Language: the English locale was not requested in a browser; the theme offers German only (see open points).

## Open points (for the owner)

1. **Page titles:** Keycloak gives the error and consent pages the title of the realm login page ("Anmelden – PflanzenDéx"). Changing it per page needs a change of Keycloak's page title, not only of the theme. Left as it is.
2. **Language:** the realm still lists `en` in its supported locales (realm file, not changed here). The theme offers German only (`locales=de`), so an English browser also gets German. This is my reading of "no language dropdown on the card" and "the German login texts stay German"; the owner should confirm.
3. **Copy:** headings I chose and the owner should check: "Willkommen zurück" (sign-in), "Passwort festlegen" (update password), "Da ist etwas schiefgelaufen." (error), "Noch kein Konto?" (before the outline button). The three value lines and the buttons are the owner's words.
4. **Registration:** this realm asks for the password only after the e-mail confirmation (the update-password page), so the registration page has no password field. Not changed.
5. **Other Keycloak texts:** messages that this theme does not override keep the base wording, which uses "Sie" (for example the one-time code, passkey and recovery pages, not in scope of US-QS-14).
6. **Maintenance:** `template.ftl` and `field.ftl` are copies of the Keycloak 26.8.1 templates with the frame and the local changes. A Keycloak upgrade needs them compared again (the header comments say what changed).
7. **Shared auth server:** the theme of the shared server comes from the checkout that runs its compose file. After this PR is merged into `dev`, the shared server shows the new theme after a reload, as the throwaway instance did (no restart needed in development mode).
8. **Layout gate:** resolved by the owner-decided exemption in issue #1077 / PR #1079 (`nameExempt` in `app/config/lint/layout.config.mjs`). The gate PR needs its human review and merge; this branch already contains the change.
9. **Conformance finding:** `ui-checkbox--focus` (DS-37) is not from this PR; it belongs to the checkbox story and should get its own issue.
