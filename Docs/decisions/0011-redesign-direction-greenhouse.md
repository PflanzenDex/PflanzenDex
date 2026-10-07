# 0011 · Redesign: direction "Greenhouse" and its design tokens

- **Status:** the **direction** (A "Greenhouse") is **accepted** (2026-10-07, chosen by the project owner from three mockups). The **token values and numbers below are proposed** until the owner confirms them in the review of this ADR's PR. Numbers that are not measured are marked as assumptions.
- **Story:** `US-QS-14` (`Docs/PRODUCT-SPECS/14-Cross-Cutting.md`), decision record E-24 (`Docs/PRODUCT-SPECS/16-Releases-and-Decisions.md`)
- **Refines:** ADR [0007](0007-component-library-storybook-bundle-budget.md) (tokens as CSS variables, dark mode follows the system, bundle budget) and the rules `DS-20`, `DS-25`, `DS-27`, `DS-28` of `DESIGN-SYSTEM.md`
- **Tracking:** epic #525, issue #526

## Context

The app works but looks old and feels slow. The design-system migration (epic #352) is finished: tokens live in `app/packages/web/src/styles/tokens.css`, components in `components/ui` and `components/shared`, and the gates (QG-U5 conformance, QG-U6 bundle budget, DS-48, layout limits) are green. That makes a redesign cheap: most of it is token values, the app shell and the component variants.

The owner asked for a modern look with real animation and a proper layout, mobile first, then desktop. Process: references first, then three mockup directions (light and dark, 360 px and 1280 px), then one pick. References came from open sources (Android adaptive navigation, Carbon empty states, GOV.UK question pages, Radix colour scale, MDN View Transitions, Motion bundle sizes) and one close domain app (Greg, plant care, 4 screens readable on Mobbin's free tier). Mobbin screens beyond that were not readable. Patterns were taken, no design was copied.

Three directions were drawn: **A Greenhouse** (soft, photo-led, large radius, calm green), **B Field Notes** (dense, hairlines, one blue accent) and **C Collector** (game-like Pokédex). The owner chose A. Mockups were drawn for Today and Collection (A and B) and Today and Pokédex (C); Discover, Measure, Friends, Settings and onboarding are not drawn yet and are designed in their screen PRs from the same tokens.

## Decision 1 · Direction A "Greenhouse"

- **Status:** accepted.
- **Decision:** soft surfaces, photo-led cards, large radius, one calm green as the brand colour, warm-free cool neutrals, pill-shaped buttons and navigation indicators, short and gentle motion.
- **Reason:** it fits plant photos best and keeps the app calm when many tasks are due; B was denser but cooler, C needs invented rarity data (P-08).
- **Consequence:** no leaderboards, rankings or rarity tiers appear in the visual language (P-01 to P-11 unchanged).

## Decision 2 · Colour tokens (light and dark)

- **Status:** proposed.
- **Decision:** keep the existing role names of `tokens.css` (no new names, so `style-contrast.test.ts` keeps covering every pair) and change the values. The tokens below were checked with a WCAG 2.2 contrast calculation (relative luminance, as in `style-contrast.test.ts`); all pairs pass. The PR that applies the tokens extends the test where a new pair appears.

| Token                     | Light     | Dark                  |
| ------------------------- | --------- | --------------------- |
| `background`              | `#F2F6F3` | `#0F1612`             |
| `foreground`              | `#14201A` | `#E6EFE9`             |
| `card`                    | `#FFFFFF` | `#18221C`             |
| `primary`                 | `#1B6B4A` | `#7BD3A0`             |
| `primary-foreground`      | `#FFFFFF` | `#0B2316`             |
| `secondary` / `muted`     | `#E6EEE8` | `#223028` / `#18221C` |
| `secondary-foreground`    | `#14201A` | `#E6EFE9`             |
| `muted-foreground`        | `#4B5C52` | `#A5B6AB`             |
| `accent` (selected, soft) | `#D8EEDF` | `#1F3A2B`             |
| `accent-foreground`       | `#124A32` | `#A9E8C4`             |
| `destructive`             | `#B3261E` | `#FF8A80`             |
| `destructive-foreground`  | `#FFFFFF` | `#2A0A08`             |
| `border` (decorative)     | `#D3DED6` | `#2B3B31`             |
| `input` (field boundary)  | `#6B8274` | `#6F8C79`             |
| `ring`                    | `#1B6B4A` | `#7BD3A0`             |
| `warning`                 | `#FFF1CF` | `#3A2F10`             |
| `warning-foreground`      | `#6B4700` | `#F2C766`             |
| `warning-border`          | `#8A5A00` | `#E0A92E`             |

The domain colours (`zone-1` to `zone-4`, `phase-growth`, `phase-dormancy`) keep their current values; they were re-checked against the new `background` and `card` and still pass.

Computed contrast ratios (minimum: 4.5 for text, 3 for UI boundaries and focus):

| Pair                                      | Light | Dark  |
| ----------------------------------------- | ----- | ----- |
| `foreground` on `background`              | 15.39 | 15.64 |
| `foreground` on `card`                    | 16.78 | 13.93 |
| `muted-foreground` on `background`        | 6.52  | 8.64  |
| `muted-foreground` on `card`              | 7.11  | 7.69  |
| `primary-foreground` on `primary`         | 6.46  | 9.21  |
| `primary` on `background` (UI)            | 5.93  | 10.20 |
| `accent-foreground` on `accent`           | 8.39  | 8.85  |
| `secondary-foreground` on `secondary`     | 14.19 | 11.76 |
| `destructive` on `background`             | 5.99  | 8.04  |
| `destructive-foreground` on `destructive` | 6.54  | 8.03  |
| `input` on `background` (UI)              | 3.80  | 4.99  |
| `input` on `card` (UI)                    | 4.14  | 4.44  |
| `ring` on `background` (UI)               | 5.93  | 10.20 |
| `warning-foreground` on `warning`         | 7.42  | 8.24  |
| `warning-border` on `warning` (UI)        | 5.29  | 6.20  |

The lowest text ratio is 5.43 (`zone-1` on `background`, light), the lowest UI ratio 3.80 (`input` on `background`, light).

- **Alternatives:** blue-violet (C) or neutral grey with a blue accent (B); rejected with the direction.
- **Consequence:** dark mode keeps following the system (ADR 0007 decision 6). Photos get no colour filter.

## Decision 3 · Typography

- **Status:** proposed.
- **Decision:** one family, **Figtree**, weights 400, 500, 600, 700, self-hosted as a subset variable font in WOFF2 (no request to a third-party font host: P-05 and the data protection rules). Fallback stack `system-ui, sans-serif`. `font-display: swap`, the used weights preloaded only for the shell.
- **Scale (rem, base 16 px):** 0.75, 0.8125, 0.875, 1, 1.125, 1.375, 1.75, 2, 2.5 (12, 13, 14, 16, 18, 22, 28, 32, 40 px). Page title 32 px on mobile and 40 px from 1280 px; body 16 px; secondary text 14 px; chips and captions 12 to 13 px. Line height 1.25 for headings, 1.45 for running text. Numbers in tables and counters use tabular figures.
- **Rule:** body text never goes below 14 px; 12 px only for chips and labels that also meet 4.5:1.
- **Open check (assumption):** the font licence must be confirmed (Figtree is published under the SIL Open Font License; verify in the tokens PR) and the font payload measured; it must not count against the 136 kB JavaScript budget (fonts are not JavaScript) but it must not worsen Lighthouse (QG-U1).

## Decision 4 · Spacing, radius, elevation

- **Status:** proposed.
- **Spacing:** the Tailwind 4 px scale. Page gutter 16 px on mobile, 24 px from 768 px, 40 px from 1280 px. Gap between list cards 10 to 12 px, between sections 24 px. Every touch target is at least 44 px (existing rule DS-15).
- **Radius tokens:** `radius-control` 14 px (inputs, small buttons, chips with text), `radius-tile` 16 px (photo tiles), `radius-card` 22 px (cards on mobile, 24 px from 1280 px), `radius-pill` 9999 px (primary buttons, navigation indicators, filter chips). The existing `--radius` (10 px) is replaced by these.
- **Elevation:** two levels. Level 1 (cards): `0 1px 2px` plus `0 6px 16px` in `rgb(20 40 28 / 0.08)` (light) and `rgb(0 0 0 / 0.35)` (dark). Level 2 (sheets, dialogs, floating action): `0 8px 24px` in the same colours, plus a 1 px `border` in dark mode, where shadows are weak. In dark mode depth comes mainly from the step `background` to `card` to `secondary`, not from the shadow.

## Decision 5 · Motion

- **Status:** proposed. All durations are **starting values (assumption)** and are tuned in the motion PR with the manual test protocol.
- **Tokens:** `motion-fast` 120 ms (press, toggle), `motion-base` 200 ms (list entry, chip, sheet content), `motion-slow` 320 ms (route transition, card to detail); easing `cubic-bezier(0.2, 0, 0, 1)` for entering, `cubic-bezier(0.4, 0, 1, 1)` for leaving.
- **Order of tools:** (1) CSS transitions and keyframes; (2) the View Transitions API (same-document, `document.startViewTransition()`) for route changes and the shared-element move of a photo from a card to its detail view, with a plain fallback where it is missing; (3) at most **one** small animation library, loaded lazily and only on a screen that needs it. The only expected user is the swipe stack on Discover (drag and spring). Candidate: Motion (`LazyMotion` with the slim `m` component; vendor figures: 4.6 kB for the component, +15 kB `domAnimation`, +25 kB `domMax` with drag). The decision to add it needs a measurement: the chunk loads only on Discover, the initial bundle stays within QG-U6, and a first try with pointer events and CSS transforms must show it is not enough. If it is enough, no library is added.
- **Reduced motion:** with `prefers-reduced-motion: reduce` the motion tokens collapse to 0 ms, the View Transition is skipped, and swipe offers the buttons only. State changes stay visible without movement (US-QS-12). The swipe stack always has button alternatives (keyboard and screen reader users, US-QS-08).
- **Rules:** animate `transform` and `opacity` only (no layout properties); nothing moves on its own for more than 5 seconds; no motion carries information that is not also shown as text or an icon.

## Decision 6 · Layout and navigation

- **Status:** proposed; the middle breakpoint was not drawn in the mockups and is checked in the shell PR.
- **Mobile first.** Design width 360 px; no horizontal scroll down to 320 px and at 400 % zoom (existing gate rules).
- **Below 768 px:** a bottom bar with five items: Heute, Sammlung, Pokédex, Entdecken, Mehr. "Mehr" opens a sheet with Wunschliste, Messen, Freunde and Einstellungen. The selected item has a pill behind the icon (`accent`), plus the label in `foreground`; selection is never shown by colour alone.
- **From 768 px:** a navigation rail (icon with label under it, about 80 px wide, assumption), same destinations, the full list instead of "Mehr".
- **From 1280 px:** a labelled sidebar, 248 px wide, all eight destinations, the product name on top. The Collection and Pokédex screens use a list and detail layout: grid on the left, detail panel of 340 px on the right.
- **Amends `DS-25`:** it says "from `md` a top bar, from `lg` optionally a sidebar". The shell PR changes this to the rule above, from one list of destinations.
- **Empty, loading and error states** keep their rules (DS-26, P-09): each offers a next action. Unknown values show "unbekannt" (P-08), also in the new cards and tables.

## Decision 7 · How it is built and what stays untouched

- **Status:** accepted (process).
- **Small PRs, one issue each:** (a) tokens and theme, (b) app shell and navigation, (c) shared components, (d) one PR per screen group, (e) motion pass, (f) manual test protocol at 360 px and 1280 px, light and dark, reduced motion.
- **Gates stay as they are.** QG-U5 conformance, QG-U6 budget (136 kB gzip initial JavaScript, about 133 kB today: little room, everything new is lazy-loaded), DS-48, layout limits and the duplicate limit are not changed. A PR that needs a gate file stops and asks the owner.
- **Snapshots:** `ds-snapshots` change only through the documented update command, in the PR that changes the design, and the PR says so.

## Consequences

- The look changes in one place first (tokens), then the shell, then the screens. Between the PRs the app is consistent because components use only tokens.
- `DESIGN-SYSTEM.md` sections 3 (tokens) and DS-25 (navigation) change in the PRs (a) and (b).
- Mockups are in a private design canvas; this ADR is the durable record. The canvas link is in issue #526.
- Not decided here: the exact layouts of Discover, Measure, Friends, Settings and onboarding; photo treatment beyond a rounded corner; any rarity or ranking visuals (not allowed without a citable source, P-08).
