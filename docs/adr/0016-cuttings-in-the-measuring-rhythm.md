# 0016 · Cuttings use the same measuring interval as plants

- **Status:** accepted by the PO (decision E-11 in `16`, assumption, revisable); recorded here on 2026-10-21.
- **Refines:** E-11, FR-WAC-08, US-MON-04, US-ACH-04
- **Affects:** `app/packages/core/src/monitoring/daily/bundle.ts` (`measurementOverdue`), `app/packages/api/src/achievements/rhythm.ts` (`achievementsRhythm`)

## Context

FR-WAC-08 asks for a reminder when the last measurement of a specimen is too old (setting `measurementDays`, default 30 days) and left open whether cuttings are excluded or get a shorter rhythm. Two places derive "a measurement is due" from that setting: the daily reminder (US-MON-04) and the care rhythm of the achievements (US-ACH-04). The rhythm was built while cuttings were still left out of the reminder; when the reminder took them in (E-11), the rhythm kept excluding them. A keeper was then reminded to measure a cutting whose measurement the rhythm did not count.

## Decision

1. **Cuttings get the same interval as plants:** `measurementDays` after the last measurement, or after the catch date while there is none. No exclusion and no second, shorter setting.
2. **Both derivations follow the same rule.** The reminder and the care rhythm treat plants and cuttings alike; only archived specimens are left out (the rhythm keeps tasks that were already done or due before the archive date, P-10).
3. **Watering is not part of E-11.** The interval watering (US-MON-05) still covers plants only.

Why: a cutting grows fastest in its first weeks, so an exclusion would hide exactly the growth that matters; a separate shorter rhythm would be a second setting with a number nobody has measured (P-08). One interval the keeper can adjust keeps the reminder and the rhythm explainable.

## Consequences

- `achievementsRhythm` now creates measurement tasks for cuttings; the test `US-ACH-04 a cutting has the same measurement interval as a plant` pins it.
- `20-achievements.md` (US-ACH-04) states the same interval for cuttings.
- Revisit if keepers report the interval as too long for cuttings; a per-specimen interval would then be a new story, not a second global setting.
