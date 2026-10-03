---
name: date-and-timezone
description: Use when code stores, compares, derives or shows a calendar date (Gefangen_Am, due dates, care phases, reminders, "today"). Keeps dates as local calendar dates in the user's timezone and never derives them from UTC (NFR-08, QG-D4, prototype bug B-01).
---

# Dates and timezones

Rule (NFR-08): every calendar date is the local date of the user. Phases, due dates and reminders use the timezone of the user's profile (FR-ACC, set from the device at onboarding). The prototype bug B-01 came from `new Date().toISOString().slice(0, 10)`: it yields the UTC date, which is yesterday or tomorrow around midnight.

Current state: there is no date helper in `app/packages/core` yet, no timezone field in the profile and no lint rule (QG-D4 is planned). Whoever needs the first date logic adds it, as follows.

1. Never use `toISOString().slice(0, 10)`, `new Date().toJSON()` or `getUTC*` to get a calendar date. Search before committing: `grep -rn "toISOString" app/packages --include=*.ts`.
2. Add (once) a small module in `app/packages/core` (own folder with `index.ts`, rule ST-c, no I/O, AB-1) with pure functions that take the timezone and the clock as arguments: `heuteLokal(jetzt: Date, zeitzone: string): string` returning `YYYY-MM-DD`, using `Intl.DateTimeFormat("en-CA", { timeZone, year, month, day })`. Time comes from an injected clock, never from `Date.now()` inside the domain, so tests are deterministic.
3. Represent a calendar date as a `YYYY-MM-DD` string (database column type `date`, not `timestamptz`); represent a moment as `timestamptz`. Do not convert between the two without the user's timezone. Validate the timezone name as an IANA zone in the operation schema.
4. Date arithmetic (days since, due in n days) works on calendar dates, not on 24-hour blocks, so daylight-saving changes do not shift results.
5. Tests, named with the story ID: the same instant near midnight gives different local dates for `Europe/Berlin` and `Pacific/Auckland`; a day with a daylight-saving switch (2026-03-29 in Berlin) counts one calendar day; the stored date does not change when read in another timezone.
6. Show dates in the UI in the user's locale with the same timezone; mention "unbekannt" for a missing date, never a default (P-08).
7. Once a second place needs a date, replace this step list's "add once" with a pointer to the helper and propose the lint rule from QG-D4 (D-03 promotion).

## Check

```bash
make test
```

Expected: the timezone tests (near midnight, daylight saving) pass; the `grep` from step 1 finds no calendar-date use of `toISOString`.
