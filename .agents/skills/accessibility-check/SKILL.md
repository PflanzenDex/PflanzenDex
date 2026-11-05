---
name: accessibility-check
description: Use when a story adds or changes a view, flow or control in app/packages/web (FR-QG-10 item 11). Walks the keyboard path, a screen reader smoke test, 400 % zoom, 200 % text, reduced motion and forced colors by hand, and names which automated gate already covers what.
---

# Accessibility check

Automated gates come first (section 1). This playbook covers what they cannot: the real focus order, what a screen reader announces, zoom and text size in the real layout, and the motion and colour settings of the people who use the app. The target is WCAG 2.1 AA per EN 301 549 V3.2.1 (NFR-13, decision E-23); the axe run also applies the WCAG 2.2 rules as a stricter bar (FR-QG-24). The standing criteria are US-QS-08 to US-QS-12 in `docs/specs/product/14-cross-cutting.md`; the bracketed numbers in the steps name the WCAG success criteria they cover.

Run the steps on each changed view and on every layer it opens: a phone at 390 × 844 px and a desktop at 1440 × 900 px (the screenshot sizes of `story-test-protocol`). Start the app with `make dev`, and `make auth-up` for sign-in.

## 1. What the automated gates already cover

| Gate                                                | Command                                                                                                                                                                       | What it covers                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Axe and keyboard walk per registered view and layer | `make a11y-routes` (QG-U7, FR-QG-24)                                                                                                                                          | every view and layer has an entry in `app/packages/e2e/support/display/screens.json`; no serious or critical axe violation; Tab reaches every control with a visible focus; no keyboard trap. Known findings sit in `app/config/gates/baselines/a11y-routes-baseline.json`, which only shrinks. |
| Register                                            | web unit tests `app/packages/web/src/app/tests/routes-register.test.ts` and `app/packages/web/src/shared/patterns/responsive/layer-sheet/layer-host-guard.test.ts` (FR-QG-24) | a route or layer without an entry fails                                                                                                                                                                                                                                                         |
| Axe in the end-to-end flows                         | `make e2e` (QG-T3, QG-U1)                                                                                                                                                     | serious and critical axe findings block                                                                                                                                                                                                                                                         |
| Component conformance                               | `make conformance` (QG-U5, FR-QG-09)                                                                                                                                          | axe, 44 px targets, focus and overlays per story, light and dark, 360 px; report only until it is switched to blocking                                                                                                                                                                          |
| Fit at the supported sizes                          | `make one-screen` (QG-U8, US-QS-15, DS-58)                                                                                                                                    | no page or inner scroll from 360 × 640 to 1920 × 1080                                                                                                                                                                                                                                           |
| Design system rules                                 | `make gates` (runs `design-system`, DS-37 focus outline among them)                                                                                                           | the rules marked 🔒 in `docs/guides/reference/design-system.md`                                                                                                                                                                                                                                 |
| Shortcut register                                   | not built yet (US-QS-11)                                                                                                                                                      | open gap: the reserved-key test of FR-QG-24 waits for it                                                                                                                                                                                                                                        |

Axe finds only part of the failures. The steps below find the rest, so a green gate does not close the checklist.

## 2. Keyboard walk

Do this with the mouse out of reach and Chromium at 1440 × 900 px.

1. From the top of the page press Tab. The first stop is the skip link "Zum Inhalt springen"; Enter moves the focus past the navigation to the main content (US-QS-08, 2.4.1).
2. Press Tab and Shift+Tab through the whole view and every layer it opens. The order follows the visual reading order, every stop shows a visible focus ring (DS-37, 2.4.7), and no sticky part (bottom bar, sticky footer, open sheet) covers the focused element (2.4.11).
3. Activate every control with Enter, and buttons and checkboxes also with Space. Open each layer, dialog and menu and close it with Esc; the focus returns to the control that opened it (DS-40, DS-59, 2.1.2).
4. Inside a widget (tabs, menu, segmented control) use the arrow keys, Home and End. Leave every widget again with the keys the view names; there is no trap (2.1.2).
5. Wherever a swipe or drag does something, find the same result on a button (US-QS-08, 2.5.1, 2.5.7).
6. Submit a form with empty required fields. The focus moves to the first invalid field or to an error summary, and each message names its field (US-QS-10, 3.3.1).
7. Write the stops into the protocol as a table: number, element, visible focus (yes or no), result.

## 3. Screen reader smoke test

Use one screen reader of the platform (NVDA or Narrator on Windows, VoiceOver on macOS or iOS, Orca on Linux) and write its name and version into the protocol header. If none is available on the machine, mark this section ⏭️. The browser's accessibility tree in DevTools is a proxy only; say so in the protocol and do not write it up as a spoken result.

1. Open the view: its title is announced ("… – PflanzenDex") and the focus is on its main heading (US-QS-09, 2.4.2, 2.4.3).
2. Header, navigation and main content are reachable as regions, and the view has exactly one h1 (1.3.1, 2.4.6).
3. Save, delete or tick off something: the result is announced once ("Gespeichert", "Behandlung abgehakt") and the focus stays on the control (US-QS-10, 4.1.3).
4. A write that is buffered offline: both states are announced and shown as text (US-QS-10, P-10).
5. A photo: its alternative text names the species or specimen and the date; a decorative image is silent (1.1.1).
6. A status shown by colour, icon or emoji (care phase, etiolation, overdue) is also read as text (1.4.1).
7. An unknown value is read as "unbekannt", never as a number (P-08).
8. A chart: the same values are available as text or a table (1.1.1, 1.3.1).

## 4. Zoom, text size and viewport

1. Browser zoom 400 % on a 1280 px window (the same as 320 CSS px): no horizontal scrolling, no content cut off (1.4.10, 1.4.4, US-QS-12).
2. Text size 200 % (set the root font size, or the operating system text size): no overlapping text, no button or row label that breaks inside a word; content that no longer fits scrolls inside its own region, not the page (DS-61, DS-63).
3. User text spacing (line height 1.5, paragraph spacing 2, letter spacing 0.12 and word spacing 0.16 times the font size; a bookmarklet or an injected stylesheet): no text overlaps or is cut off (1.4.12).
4. Portrait and landscape, at 360 × 640 and 390 × 844 px for phones and 1024 × 768 px for a tablet: every view works in both (1.3.4).

## 5. Reduced motion, forced colors and dark scheme

1. DevTools, Rendering, emulate `prefers-reduced-motion: reduce`: layers and pages change without sliding, toggles switch without animation, and nothing is lost (2.3.3, US-QS-12).
2. DevTools, Rendering, emulate `forced-colors: active`: the focus indicator, the borders of controls and the status texts stay visible (1.4.11, 2.4.7). A box-shadow ring can vanish in forced colors; if it does, report it as ❌. Do not fix it with `outline: none` (DS-37 allows that only for a heading that is focused by script).
3. DevTools, Rendering, emulate `prefers-color-scheme: dark`: the same elements stay visible and the text keeps its contrast (1.4.3, 1.4.11).

## 6. Record the result

Write the result into the story's test protocol, following `story-test-protocol` (file and screenshot folder under `docs/records/test-logs/`, legend, header, one section per criterion with "Erwartet" and "Beobachtet").

- One section per standing criterion (US-QS-08 to US-QS-12) that the change touches, plus "Keyboard walk" and "Screen reader" when a view or control changed.
- Quote the result of `make a11y-routes` with its findings; `make a11y-routes-report` prints the table per screen.
- Put the keyboard table from section 2 in the protocol.
- Note the browser and version, the screen reader and version, and the zoom and text settings used.
- Mark everything not done as ⏭️ (for example no screen reader on the machine). Never write ✅ for what only the automated run shows, without saying so (story-test-protocol, step 7).
- Link the protocol from the pull request under "Test evidence", and tick "View, flow or control changed?" in the Definition of Done only with this text in the PR.

## 7. When something fails

- A keyboard trap, a missing focus ring or an unlabelled control: write a failing automated test first where possible (an e2e keyboard test or a component test), then the fix, then update the protocol (story-test-protocol, step 9).
- Do not add a finding to `app/config/gates/baselines/a11y-routes-baseline.json` or any other baseline to make a run pass. Baselines only shrink (FR-QG-17) and they are gate files (AGENTS.md).
- A gap the story cannot fix goes into the protocol under "Offene Punkte" and into a GitHub issue with the label `accessibility`; the known gaps are what the accessibility statement lists (US-QS-13).

## Check

```bash
make skills-check
```

Expected: `make skills-check` passes. The automated run this playbook pairs with, `make a11y-routes`, needs Docker and is not part of this check; its findings are printed by `make a11y-routes-report`.
