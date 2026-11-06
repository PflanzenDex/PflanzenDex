# Test log: US-QS-07 Dialog loading state in real Chromium (issue #1541)

**Branch:** `chore/issue-1541-check-the-dialog-loading` (draft PR #1565; follows PR #1513, issue #1307, which tested focus only in jsdom)
**Environment:** Linux (CachyOS, kernel 7.3.0-4), Node v26.13.0, Playwright 1.64.1 with Chromium 156.0.8078.4 (headless, from `app/node_modules`). Projects: desktop 1440 × 900 px, mobile 375 × 812 px with touch emulation. PostgreSQL 18 in its own container `pflanzendex-test-db-54558` (port 54558, database `pflanzendex_test`, migrations 0001–0107 applied, 54 tables checked). API port 55058, web port 55558. Keycloak and Mailpit are shared and were not changed or restarted (the containers were already up, so `make auth-up` was not run). Date 2026-11-06.
**Runtime change not in the repo:** `node tools/keycloak/web-port.mjs 55558` added the redirect origin `http://localhost:55558` to the shared realm client. It only adds.
**Method:** Playwright scripts outside the repo, against the real stack. Signed in with the e2e helper `signIn` (`app/packages/e2e/support/fixtures.ts`), account `test@example.test` (password in `docs/guides/reference/app.md`; the account is not demo-seeded). Trigger: the button "Tastenkürzel anzeigen" in the header of "Was die App kann" (`/account/functions`). It opens the shortcut overview, a `ResponsiveModal`: a dialog from 768 px, a bottom sheet below. A fresh browser context per test (no cache; the build has no service worker).
**Served app:** the primary run is the production build (`vite build`, served with `vite preview` on port 55558). Its modal chunks are single files: `assets/dialog-modal-DiZ-MLOb.js` (dialog) and `assets/sheet-panel-Cq7mADuV.js` (sheet). A cross-check run used the Vite dev server (`make dev` with the worktree ports); there the chunks are the modules `dialog-part/dialog-modal/dialog-modal.tsx` and `shared/ui/overlays/sheet/sheet-panel/sheet-panel.tsx`.
**Throttling (assumption, P-08):** a Playwright route on the chunk request only. The request waits until the test has clicked the trigger (and the status was seen), then it is answered after 3000 ms. The 3000 ms is a starting value, not measured on a real network. No CDP network emulation and no CPU throttling were applied, so all times are local timings on this machine. A control run lets the chunk through at once.
**Not run:** `make ci` (only `make gates`, see section 0). Screen reader: out of scope, stays with #636.
**Times in this log** are milliseconds from the page start or the duration of a state, taken from the page trace (`loading-shown`, `loading-gone`, `dialog-open`, `focus`).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates

**Expected:** `make gates` green on this tree.

**Observed:**
- ✅ `make gates` exit 0: "gates: 24 steps in 31.0 s, at most 4 at a time, 0 failed" (run on this tree, before the commit).
- ⏭️ `make ci` was not run. Its tests and the production build gate (`ci-ui`) are not part of this result.

## 1. Criterion: a slow first open shows "Fenster wird geladen …" (NFR-12, DS-08)

**Expected:** while the chunk of the window is pending on its first open, the window shows the status "Fenster wird geladen …". It disappears when the window opens. A later open shows no status.

**Observed:**
- ✅ Dialog, 1440 px, production build: the status was shown from the click until the dialog opened, 3117 ms (chunk response 3100 ms). Screenshot `qs-07-dialog-loading/01-loading-desktop.png`.
- ✅ Sheet, 375 px, production build: the status was shown 3070 ms (chunk response 3056 ms). Screenshot `qs-07-dialog-loading/01-loading-mobile.png`.
- ✅ Second open in the same page: no status event.
- ✅ Dev cross-check: dialog status 3121 ms, sheet status 3106 ms; no status on the second open.
- ⚠️ The status also shows on a fast first open (control run, chunk answered at once, chunk response 4 ms): dialog 315 ms and sheet 315 ms in the production build, 331 ms and 328 ms in dev. The module was already loaded before the click, so this is not the network. Finding F4.
- ⚠️ On the phone the status is a bottom bar that covers the lower part of the bottom navigation; the text labels under its icons are cut off (`01-loading-mobile.png`). Finding F5.

## 2. Criterion: the trigger keeps focus while the window loads (DS-08)

**Expected:** `document.activeElement` stays the "Tastenkürzel anzeigen" button while the status shows.

**Observed:**
- ✅ Dialog, mouse click, both builds: the button has focus during the status (`01-loading-desktop.png`, page trace).
- ✅ Dialog, keyboard: one Tab from the section heading reached the button; Enter opened it; the button kept focus during the status (both builds).
- ✅ Sheet, tap, both builds: the button keeps focus during the status.
- ⏭️ Keyboard path on the phone: no hardware keyboard in this run.

## 3. Criterion: the window takes focus when it opens (DS-40, US-QS-15)

**Expected:** focus moves into the window. The overview's `focusModalTitle` puts it on the title "Tastenkürzel" (an h2). The status is gone at the same moment.

**Observed:**
- ✅ Dialog, mouse, keyboard, both builds: `h2 "Tastenkürzel"` has focus at the same trace time as the dialog-open and the status removal.
- ✅ Sheet, tap, both builds: `h2 "Tastenkürzel"` has focus, the status is gone.
- ✅ No focus ring on the title in `02-open-desktop.png`. It is a heading focused by script, which DS-37 allows.

## 4. Criterion: Escape returns focus to the trigger (DS-40, DS-59)

**Expected:** Escape closes the window, and focus goes back to "Tastenkürzel anzeigen".

**Observed:**
- ✅ Sheet, tap path and keyboard path, both builds: Escape closed the sheet and focus went back to the button. In the dev trace the focus event came 2 ms after the close; the build run ends with the button focused. `03-after-close-mobile.png` shows its focus ring.
- ❌ Dialog, mouse path and keyboard path, both builds and dev: Escape closed the dialog, then `document.activeElement` was `body`. No focus event followed, and `03-after-close-desktop.png` shows no focus ring on any control. A diagnostic run kept a reference to the button: it was still connected and was the same node after the close, but focus was not returned to it, also after 600 ms. Finding F1.
- ⚠️ Dialog opened with `?` on "Heute" (`/today`), both builds: focus was on `body` before, during and after; Escape left it on `body`. The overview has no opener for `?`, although the component documents that focus returns to its opener. Finding F6.

## 5. Criterion: closing while the window is pending shows nothing afterwards (P-10)

**Expected:** a close during the loading state leaves no window that opens later.

**Observed:**
- ⏭️ The close used by the jsdom test (`responsive-modal/dialog-part/dialog-modal/loading-state.test.tsx`, cases 3 and 4: the trigger is clicked again while pending) cannot be reached in the product. The help button only opens the overview, and no product consumer passes `trigger` to `ResponsiveModal`. The literal scenario therefore was not reproduced in the browser. The two closest actions are the next two rows.
- ❌ Escape during the loading state, both builds and dev, dialog and sheet: the status stayed after Escape, and 5 s after the chunk was released the overview was open (chunk response 3836 ms dialog, 3829 ms sheet in the production build). Finding F2.
- ❌ Browser Back during the loading state (from `/account/functions` to `/account`), both viewports, both builds and dev: the status stayed on `/account`, and the overview opened there after the chunk arrived. Finding F3.

## 6. Keyboard and screen reader

- ✅ One Tab from the section heading reached the trigger. The walk covered only this path; the full page was not walked.
- ⏭️ Screen reader: out of scope, stays with #636. The `role="status"` element was only checked in the DOM, not spoken.

## 7. Phone layout (375 × 812)

- ⚠️ Loading bar over the bottom navigation: see F5.
- ⏭️ Horizontal scrolling and the 48 px tap targets were not measured in this run.
- ⏭️ Sheet close control: in `02-open-mobile.png` the list reaches the bottom edge. Whether a close button sits below the fold was not checked; Escape works.

## Screenshots

Taken in the production-build run at the states of check 1 to 4 (dialog at 1440 × 900, sheet at 375 × 812):

| File | State |
| --- | --- |
| `qs-07-dialog-loading/01-loading-desktop.png` | status "Fenster wird geladen …" (dialog) |
| `qs-07-dialog-loading/01-loading-mobile.png` | status in the bottom bar (sheet) |
| `qs-07-dialog-loading/02-open-desktop.png` | dialog open, title focused |
| `qs-07-dialog-loading/02-open-mobile.png` | sheet open, title focused |
| `qs-07-dialog-loading/03-after-close-desktop.png` | after Escape, no focus on any control |
| `qs-07-dialog-loading/03-after-close-mobile.png` | after Escape, focus back on the trigger |

## Findings

Tickets: F1 and F6 are #1573, F2 and F3 are #1574, F4 and F5 are #1575, F7 is #1576.

**F1. Desktop: focus is lost when the overview is closed with Escape (US-QS-07, DS-40).** Steps: sign in, open "Konto", open "Was die App kann". Click "Tastenkürzel anzeigen" (the icon in the section header) or reach it with Tab and press Enter. Press Escape. Observed: focus on `body`. Expected: focus on the button. Reproduced with mouse and keyboard, production build and dev. The button is the same node and still in the DOM afterwards, so it was not replaced. Not caused by StrictMode: the production build shows the same result. The overview passes no `trigger`, so `DialogModal` keeps Radix's default focus return (code reading); the cause is not isolated further. The phone sheet returns focus correctly.

**F2. Desktop and phone: Escape does not stop the wait; the window opens afterwards.** Steps: as in F1, steps 1 and 2, with a slow chunk (3 s). Press Escape while "Fenster wird geladen …" shows. Observed: the status stays; the overview opens a few seconds later. Expected: Escape ends the wait and nothing opens afterwards, or the status offers a way out.

**F3. Desktop and phone: a pending overview survives a page change and opens on the new page.** Steps: as in F1, steps 1 and 2, with a slow chunk. Press Browser Back while the status shows. Observed: the status stays on the new page, and the overview opens there after the chunk arrives. Expected: leaving the page ends the wait. Probable cause (code reading): the open state lives in the shortcut provider in the app shell, so it outlives the page.

**F4. Desktop and phone: the status shows on a fast first open too (about 0.3 s, no throttle).** Steps: sign in, wait about 3 s so the chunk is loaded in the background, open the overview. Observed: the status is visible for about 315 ms (production build) and about 330 ms (dev). Expected: a flicker-free open, or the status only when the wait is noticeable. Whether a delayed status is wanted is a design decision (assumption: 300 ms). Measured in headless Chromium without CPU throttling.

**F5. Phone: the loading bar covers the bottom navigation labels.** Steps: 375 × 812, open "Konto", open "Was die App kann", tap "Tastenkürzel anzeigen". Observed: the bar covers the labels under the bottom navigation icons (`01-loading-mobile.png`). Expected: the navigation stays readable, or the bar sits above it. Whether the navigation still takes taps underneath was not tested.

**F6. Desktop: the overview opened with `?` leaves focus on `body` after Escape.** Steps: on "Heute" press `?`, then Escape. Observed: focus on `body` before, during and after. Expected: focus returns to the control focused before, or to the page heading. Same cause as F1, without an opener element.

**F7. Incidental, not part of US-QS-07: the navigation label "Freunde" wraps as "Freund / e" at 1440 px**, next to the badge "Noch gesperrt". Visible in all desktop screenshots of this run. Expected: the label stays on one line.

## Open points

- Screen reader (#636): not checked.
- The 3000 ms delay is an assumption. The run used localhost, no CPU throttling and no real network.
- Only the shortcut overview was driven. The other `ResponsiveModal` users (the layer sheet between 768 and 1023 px, the logout modal, the photo and wish picture dialogs) were not checked, and neither was the 768 px boundary.
- The `trigger` branch of `DialogPart` (preload on pointer, focus and touch, `returnFocusTo`) has no product consumer, so the browser cannot reach it. Only jsdom covers it.
- `make ci` was not run; only `make gates`.
- The test account is not demo-seeded; the overview does not depend on data.
- The shared Keycloak client got the redirect origin of this worktree (additive, not in the repo).
- At the end of the run the API, the preview server and the test database container `pflanzendex-test-db-54558` were stopped. Keycloak and Mailpit were left running.
