# Test log: US-ACC-03 Guided onboarding (issue #54)

**Branch:** `feat/acc-03-gefuehrter-einstieg`
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54566, a fresh database created inside it for this run, migrations 0001-0017 applied), API port 55066 (checked in its start command: `DATABASE_URL` points at that database), web (Vite) port 55566, Keycloak 26.8 with the repo realm import (redirect address of client `pflanzendex-web` changed to port 55566 in a copy of the realm file, not in the repo) in a throwaway container on port 55970. The shared test database (54329) and the shared sign-in service (18081) were not touched. Chromium via Playwright, locale de-DE, browser time zone `Asia/Tokyo`, light scheme; date 2026-10-04.
**Method:** automated tests on core and web, `make ci`, then a manual run with a throwaway Playwright script (not checked in): users created through the Keycloak admin API, everything else through the UI at 1440x900 and 375x812, one fresh account per flow and viewport. Screenshots and raw measurements are in `acc-03/` (`observation.json`). Containers, servers and the temporary database were removed afterwards.

Legend: ✅ as expected · ⚠️ works, with a finding · ❌ error · ⏭️ not checked

## 0. Gates and red evidence

- ✅ `make ci` exit 0 (see the PR for the final run on the last commit).
- ✅ Red evidence before implementing, exit code 1 each: `acc-03/red-core.txt` (import of `./onboarding` fails, no tests run, re-created by hiding the implementation file once because the first capture was overwritten), `acc-03/red-web-light.txt` (`./setup-steps` missing), `acc-03/red-web-start.txt` (`./start-page` missing).
- ✅ Review round 1, red first (exit 1 each): `acc-03/red-core-labels.txt`, `acc-03/red-web-light-adjust.txt` (adjusting and adding zones in the step), `acc-03/red-web-start-focus.txt` (focus on the new step heading, polite marker, renamed end button). `acc-03/red-web-start-regression.txt`: the regression test "after skipping the last step the guide does not come back" run against the original bug (finish kept only in component state, temporarily re-introduced, then restored): 1 failed.
- ⏭️ `make e2e` (shared suite) not run; no e2e test added.

## 1. Criterion: the onboarding asks for locations, light zones and the first plant

- ✅ By hand: a new account lands on the tab "Start" and sees "Schritt 1 von 3 / Wo stehen deine Pflanzen?" with the location form (`01-wizard-locations-*.png`). Adding "Fensterbank" lists it (`05-location-added-*.png`); a second "fensterbank" is refused with "Einen Standort mit diesem Namen gibt es schon." and the form stays usable.
- ✅ By hand: step 2 "Wie hell ist es?" (`02-wizard-zones-*.png`, re-taken with the button visible) takes over the four default lamps with one tap, and the location gets its zone through "Lichtzone zuweisen" (the listing then shows "Lampe 2 · innen", `06-zones-taken-*.png`).
- ✅ By hand: step 3 "Deine erste Pflanze" leads to the catalog; after choosing a species and creating the specimen, the start page no longer shows the guide (`07-catalog-from-onboarding-*.png`, `08-start-with-plant-*.png`).
- ⚠️ The catalog was empty in this environment (no catalog build yet), so the run created one private species proposal through the API (status 201) to have something to choose. The step does not create the specimen itself; it hands over to the existing flow (US-BES-02).
- ✅ Tests only (not clicked by hand): the step also adjusts a default zone ("Ändern", PUT) and adds an own zone ("Neue Lichtzone", POST), reusing the zone cards and form of `light`; so the criterion "take over the default levels or adjust them" is covered inside the step.
- ✅ Tests: core `onboarding.test.ts`, web `setup-steps.test.tsx`, `start-page.test.tsx`, `App.test.tsx`.

## 2. Criterion: every step can be skipped, the app stays usable, missing details are a hint, never an error

- ✅ By hand: "Überspringen" on all three steps ends on the start page with zero alerts (`alerts: 0`), the next action "Art im Katalog wählen" and two hints ("Du hast noch keinen Standort angelegt." / "Du hast noch keine Lichtzonen.") each with its own button ("Standorte anlegen", "Lichtzonen einrichten") (`04-start-after-skip-*.png`). The tabs stay usable; the hint button opens "Standorte und Licht" (`aria-current="page"`).
- ✅ By hand: after a reload the start page appears, not the guide again; opening another tab and returning does not bring the guide back (this was a bug in the first run, fixed, see section 4).
- ✅ The button is called "Einstieg beenden" (it was "Einstieg später fortsetzen", which promised a way back that does not exist). It ends the guide on this device for good.
- ⚠️ "Skipped" is remembered per account in the browser's `localStorage` (a per-device convenience, assumption). On another device, or after clearing site data, the guide is offered again as long as the account has no specimen. The hints themselves are derived live from the data and never stored.
- ✅ Test: `start-page.test.tsx` (skip all, skip later, remember, retry on load error).

## 3. Criterion: without a plant the start page shows a clear next action

- ✅ By hand: see `04-start-after-skip-*.png`: heading "Erste Pflanze", the sentence "Wähle im Katalog eine Art und lege dein erstes Exemplar an." and the primary button "Art im Katalog wählen"; the button opens the tab "Arten" ("Art wählen").
- ✅ With a plant and complete setup the start page says "Deine Pflanzen warten im Bestand ..." with "Zum Bestand" (`08-start-with-plant-*.png`).

## 4. Findings during the run

- ❌ → ✅ First run: after "Überspringen" on the last step, switching to another tab and back showed the guide again (the skip was only kept in component state). Fix: leaving the guide in any way is stored; test `after skipping the last step the guide does not come back ...`.
- ❌ → ✅ First run: both hints had the same button name "Zu Standorte und Licht" (ambiguous for assistive technology). Now "Standorte anlegen" and "Lichtzonen einrichten".

## 5. Tenant isolation (P-04)

- ✅ No new table, no new API route, no migration: the page only reads the existing own-account endpoints (`/light-zones`, `/locations`, `/specimens/cards`) and writes through the existing validated operations. Their two-account tests are unchanged. The progress counts come from those endpoints, so an account never sees another account's data.

## 6. Layout and accessibility

- ✅ Desktop 1440x900 and mobile 375x812: no horizontal scroll, no interactive element (button, input, select, link) below 48 px height (measured, `observation.json`, `small: []` for every state).
- ✅ Spacing between the cards on the start page and the zone list was fixed (`04-start-after-skip-mobil.png`).
- ✅ axe (wcag2a, wcag2aa, wcag21a, wcag21aa): no violations on wizard steps 1-3, the start page after skipping, the zones step and the start page with a plant, both viewports.
- ✅ The step marker "Schritt n von 3" is visible text with its own border, not only an aria attribute.
- ✅ Keyboard only (no mouse, both viewports, fresh account, real Chrome run, `observation.json` keys `*.keyboard`): from the signed-in start page, Tab reached "Überspringen" after 5 presses (by the count, the first Tab press right after sign-in went to the "Name" field of the location form (not read back separately): the page had just been loaded by the sign-in redirect, so the browser's sequential focus start point was not the tab bar; Name, Lichtzone, Art, "Standort anlegen", "Überspringen" are the five presses), Enter moved to step 2 and the focus landed on the heading "Wie hell ist es?" (an `h2` with `tabindex=-1`), the marker "Schritt 2 von 3" is `role=status`. Tab reached "Standard-Lampen übernehmen" after 1 press, Space took over the four zones. "Weiter" took 10 Tab presses (four zone cards with two buttons each, the closed "Neue Lichtzone", then "Weiter"); Enter moved to step 3 with the focus on "Deine erste Pflanze". "Überspringen" after 2 Tab, Enter ended the guide (start page, no alert); "Art im Katalog wählen" after 1 Tab, Enter opened the catalog.
- ⏭️ Screen reader (the polite announcement was only checked as `role=status` in the DOM, not heard) and dark scheme not checked.

## Open points

- The skip state is device-local (`localStorage`); a server-side flag would need a migration and a profile field. Not part of the criteria.
- The first plant is chosen in the catalog; there is no inline specimen form in the guide. A catalog filled by the catalog build (US-POK-03) makes this step meaningful for everyone.
- `make e2e` has no ACC-03 spec; the manual run above is not repeatable in CI.
