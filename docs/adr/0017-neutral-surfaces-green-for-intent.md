# 0017 · Neutral surfaces, green only for intent

- **Status:** accepted by the project owner (2026-10-29, after the UI/UX review of the running app).
- **Story:** `US-QS-14` (`docs/specs/product/14-cross-cutting.md`), decision record E-24 (`docs/specs/product/16-releases-and-decisions.md`)
- **Supersedes:** the surface and text values of ADR [0011](0011-redesign-direction-greenhouse.md) decision 2. Direction, brand green, accent, type, radius, motion and navigation of ADR 0011 stay.
- **Tracking:** epic #525, issue #945

## Context

ADR 0011 tinted every surface green: the page (`#F2F6F3`), the quiet fills (`secondary`, `muted`), the borders, the field boundary, the text greys and the shadows. The review of 2026-10-29 found that the selected state (`accent`) and the primary button barely separate from the page, because everything around them already carries the same hue. The owner asked for a background that is not greenish, with green kept for accents, buttons and outlines.

## Decision

1. **Surfaces and text are neutral.** A cool grey family (close to Tailwind's zinc) replaces the green-tinted greys: `background`, `foreground`, `secondary`, `muted`, their foregrounds, `border`, `input`, the dark `card`, and the shadow colour of `elevation-1` and `elevation-2`.
2. **Green marks intent only.** `primary`, `primary-foreground`, `ring`, `accent` and `accent-foreground` keep their ADR 0011 values. Green is used for the primary button, the outline button (text and border), links, the focus ring, the selected navigation item, tab and chip, and progress. It is never used for the page, card fills, quiet buttons, dividers, body text or shadows.
3. **Status and domain colours are unchanged:** `destructive`, `warning*`, `zone-1` to `zone-4`, `phase-*`.
4. **The browser bar follows the page:** `<meta name="theme-color">` with the light and dark `background`.

| Token                    | Light               | Dark                            |
| ------------------------ | ------------------- | ------------------------------- |
| `background`             | `#FAFAFA`           | `#0B0B0C`                       |
| `foreground`             | `#18181B`           | `#F4F4F5`                       |
| `card`                   | `#FFFFFF`           | `#161618`                       |
| `secondary`              | `#F4F4F5`           | `#232326`                       |
| `secondary-foreground`   | `#18181B`           | `#F4F4F5`                       |
| `muted`                  | `#F4F4F5`           | `#1F1F22`                       |
| `muted-foreground`       | `#52525B`           | `#A1A1AA`                       |
| `border` (decorative)    | `#E4E4E7`           | `#27272A`                       |
| `input` (field boundary) | `#71717A`           | `#7C7C86`                       |
| `elevation-1`, `-2`      | `rgb(0 0 0 / 0.06)` | `rgb(0 0 0 / 0.35)` (unchanged) |

Computed contrast ratios (WCAG 2.1, as in `style-contrast.test.ts`; minimum 4.5 for text, 3 for UI boundaries):

| Pair                                  | Light | Dark  |
| ------------------------------------- | ----- | ----- |
| `foreground` on `background`          | 16.97 | 17.90 |
| `foreground` on `card`                | 17.72 | 16.44 |
| `muted-foreground` on `background`    | 7.41  | 7.68  |
| `muted-foreground` on `card`          | 7.73  | 7.05  |
| `muted-foreground` on `muted`         | 7.03  | 6.41  |
| `secondary-foreground` on `secondary` | 16.12 | 14.26 |
| `accent-foreground` on `accent`       | 8.39  | 8.85  |
| `primary` on `background` (UI)        | 6.19  | 10.93 |
| `input` on `background` (UI)          | 4.63  | 4.76  |
| `input` on `card` (UI)                | 4.83  | 4.38  |
| `zone-1` on `background`              | 5.68  | 9.26  |
| `destructive` on `background`         | 6.26  | 8.62  |

The lowest text ratio rises from 5.43 to 5.68, the lowest UI ratio from 3.80 to 4.38.

## Alternatives

- **Keep the tint and darken `accent`:** fixes the selected state, but the page stays green, which the owner rejected.
- **Warm neutrals (stone):** rejected, because a warm grey next to the cool brand green reads muddy, and ADR 0011 already asked for "warm-free cool neutrals".
- **APCA instead of WCAG 2:** Vercel's guidelines prefer APCA, but the conformance target is WCAG 2.1 AA (E-23), so the gate stays WCAG 2.

## Consequences

- Token values change without new token names, so `style-contrast.test.ts` keeps covering every pair. `style-tokens.test.ts` pins the new values.
- The `outline` button variant draws its text and border in `primary` (border 6.19:1 light, 10.93:1 dark), which also answers the low outline boundary of issue #660. The `ghost` variant stays neutral, because tabs, segments, the navigation bar and accordion headers build on it and only their selected state is green.
- The visual regression baselines of the component stories (ADR 0010) are regenerated in the same PR and reviewed by eye.
- The layer model from the same review (one screen per layer, sheets, paged lists) is a separate story; this ADR covers colour only.
