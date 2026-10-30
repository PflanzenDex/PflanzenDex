# Test log: one screen per layer, measured (US-QS-15 to US-QS-23, epic #525)

**Branch:** `dev` at `fa489e92` (after #1008), with all stories of the redesign merged: #946, #951, #952, #953, #958, #959, #960, #962, #964, #967, #968, #975, #988, #990, #1008.
**Environment:** Linux (CachyOS), Node 24.21, Docker; PostgreSQL 18 with the demo seed of US-DEV-01 and all migrations up to `0096`, API port 3000, web (Vite) port 5173, Keycloak (`make auth-up`); browser Chromium 1248 via Playwright; date 2026-10-30. Nothing was changed at runtime outside the repo.
**Method:** Playwright scripts sign in as the demo user `test2` (Ben, 50 plants, 41 caught species) and open each view and layer at 360×640 (the size the criteria name, starting value) and 390×844 (the size of the UI review of 2026-10-29). Per view they record the page height divided by the window height ("page") and the largest ratio of scroll height to visible height of any inner scroll region ("inner"); 1.00 means it fits. Desktop: five layers at 1440×900, checked for a pane beside the content instead of a modal dialog. Text size: `html { font-size: 200% }` at 390×844 (and 360×640 for Entdecken), set before the page loads as a browser text-size setting does; checked for vertical clipping, scroll, content past the right edge, overlapping text, squeezed boxes and text that does not grow. Screenshots in `qs-one-screen/`, named `<width>x<height>-<view>.png` and `<width>x<height>-text200-<view>.png`. This log deviates from the story-test-protocol skill in two points: the viewports are the ones the criteria name instead of 375×812, and section 0 cites the GitHub runs instead of a local `make ci` on `dev`. The app UI is German; quoted UI texts are verbatim.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates

**Expected:** `make ci` green.

**Observed:**

- ✅ Every PR in this log merged into `dev` with a green `ci-status` on GitHub.
- ⏭️ A local `make ci` on `dev` was not run for this log. Local runs during the PRs hit `Hook timed out in 10000ms` in API database suites while several worktrees shared one machine; the suites passed alone (recorded in each PR).

## 1. Fit at 360×640 and 390×844

Height in screens, "page / inner". "Before" is the UI review of 2026-10-29 (390×844, page only); "Morning" is the first measurement of 2026-10-30 on `9f1f3dd0`, before #964, #975, #988 and #990; "Final" is `fa489e92`.

| View or layer                                   | Story    | Before | Morning 360×640 | Final 360×640 | Final 390×844 | Result |
| ----------------------------------------------- | -------- | -----: | --------------: | ------------: | ------------: | ------ |
| Heute                                           | US-QS-18 |    6.8 |     1.00 / 1.78 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Heute, layer "Behandeln"                        | US-QS-18 |      – |     1.00 / 1.78 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Heute, layer "Gießen"                           | US-QS-18 |      – |               – |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Heute, layer "Fehlt noch"                       | US-QS-18 |      – |               – |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Sammlung "Pflanzen"                             | US-QS-19 |   27.0 |     1.02 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Sammlung, layer "Lichtzonen"                    | US-QS-19 |      – |     1.02 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Sammlung, layer "Ansicht"                       | US-QS-19 |      – |     1.02 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Plant layer, tab "Überblick"                    | US-QS-23 |      – |     1.02 / 1.12 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Sammlung "Arten"                                | US-QS-22 |   10.7 |     1.20 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Sammlung "Wunschliste"                          | US-QS-22 |    2.6 |     1.00 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Sammlung "Equipment"                            | US-QS-22 |      – |     1.00 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Entdecken "Vorschläge"                          | US-QS-21 |    1.0 |     1.75 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Entdecken "Katalog"                             | US-QS-21 |    3.5 |     1.02 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Freunde                                         | US-QS-20 |   13.6 |     1.00 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Freunde, layer "Freund hinzufügen"              | US-QS-20 |      – |     1.00 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Konto                                           | US-QS-17 |   14.0 |     1.13 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Konto › Einstellungen                           | US-QS-17 |      – |     3.56 / 1.00 |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |
| Einstellungen, layers "Profil" to "Licht" (six) | US-QS-17 |      – |               – |   1.00 / 1.00 |   1.00 / 1.00 | ✅     |

The "Before" value of Entdecken "Vorschläge" fitted only because the catalog was empty in the review. Konto › Einstellungen was a form of 3.56 screens; it is now a list of six groups, each a layer (owner decision 2026-10-30, option B, #990).

**Observed:** ✅ 50 of 50 measurements (25 views and layers at two sizes) fit without page or inner scroll. The fixes between morning and final: the one-screen frame rule had a nested `:has`, which browsers drop (#988); "Jetzt dran" became one compact row, the Arten progress one line, the Konto rows denser, the plant overview one line per fact (#988); the settings became a list (#990).

## 2. Desktop 1440×900

**Expected:** from 1024 px a layer stands beside the content, not as a modal dialog over it (US-QS-15).

**Observed:** ✅ 5 of 5 layers ("Behandeln", "Lichtzonen", "Freund hinzufügen", Katalog "Filter", Einstellungen "Profil") open as a pane of 384 px beside the content, without a modal dialog (`1440x900-*.png`). The plant layer was not part of this check.

## 3. 200 % text size

**Expected:** content that no longer fits scrolls inside its region instead of being cut off, nothing overlaps, and all text grows (US-QS-15, WCAG 1.4.4, 1.4.10).

**Observed:**

- ✅ Every destination (Heute, Sammlung, Arten, Entdecken, Freunde, Konto, Einstellungen) scrolls inside its region; nothing is clipped vertically.
- ✅ **Entdecken "Vorschläge" (US-QS-21):** the card no longer overlaps "Nein / Später / Ja", the region scrolls (252 px at 390×844, 456 px at 360×640), the buttons wrap and "Ja" is fully visible and reachable above the bar (`390x844-text200-entdecken.png`, `360x640-text200-entdecken-scrolled.png`; bug #1007, fixed by #1008). The fix reads the text size when the deck mounts; a size changed while the page is open applies after a reload.
- ✅ **Freunde (US-QS-20):** no finding (`390x844-text200-freunde.png`).
- ❌ **Heute (US-QS-18):** in "Jetzt dran" the button keeps its width, so the chip "10 Tage überfällig" is squeezed to one character per line and overlaps the button (`390x844-text200-heute.png`).
- ❌ **Sammlung "Pflanzen" and "Arten" (US-QS-19, US-QS-22):** the labels of the mode switch overlap; the header action ("Ansicht", "Pokédex"), the tiles and "Weiter" run past the right edge (`390x844-text200-sammlung.png`, `390x844-text200-arten.png`).
- ❌ **Entdecken "Katalog" (US-QS-21):** "Art vorschlagen" is cut off at the right edge and the search field shrinks to one letter (`390x844-text200-katalog.png`).
- ❌ **Konto and Einstellungen (US-QS-17):** the row labels stay at 15 px while the rest grows (`390x844-text200-konto.png`, `390x844-text200-einstellungen.png`).

The four ❌ are tracked in #1019. An earlier check that injected the text size after the page had loaded and looked only at vertical clipping missed them.

## 4. Not checked

- ⏭️ 400 % zoom (US-QS-15 names it next to 200 % text).
- ⏭️ Keyboard and screen reader by hand (covered by unit tests and the conformance run; #636).
- ⏭️ A real phone (Safari iOS, Chrome Android; #638).

## Result per story

| Story    | Fit | Desktop | 200 % text                   | Status | Gap                                                   |
| -------- | --- | ------- | ---------------------------- | ------ | ----------------------------------------------------- |
| US-QS-15 | ✅  | ✅      | ❌ (#1019)                   | 🟨     | #1019                                                 |
| US-QS-16 | ✅  | –       | see US-QS-18                 | 🟨     | first-plant guide not its own chunk (bundle budget)   |
| US-QS-17 | ✅  | ✅      | ❌ labels stay 15 px         | 🟨     | #1019, real phone (#638), screen reader (#636)        |
| US-QS-18 | ✅  | ✅      | ❌ "Jetzt dran" chip         | 🟨     | #1019, #638, #636                                     |
| US-QS-19 | ✅  | ✅      | ❌ switch, tiles             | 🟨     | #1019, #638, #636                                     |
| US-QS-20 | ✅  | ✅      | ✅                           | 🟨     | #638, #636                                            |
| US-QS-21 | ✅  | ✅      | ⚠️ Vorschläge ✅, Katalog ❌ | 🟨     | #1019, #638, #636                                     |
| US-QS-22 | ✅  | –       | ❌ switch, "Weiter"          | 🟨     | #1019, #638, #636                                     |
| US-QS-23 | ✅  | ⏭️      | ⏭️                           | 🟨     | desktop and 200 % text of the plant layer, #638, #636 |

No story is set to ✅ by this log.

## Open points

- Fix #1019, then repeat section 3 (horizontal reflow at 200 % text, set before load) and section 1 (fit).
- Check the plant layer at 1440×900 and at 200 % text.
- 400 % zoom, a real phone (#638) and a screen reader pass (#636).
