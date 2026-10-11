# 20 – Epic ACH: Achievements (Rewards for Care and Growth)

Goal: the app rewards **looking after plants**, not only collecting them. Today the Pokédex (POK) rewards buying something new; nothing says "well done" when a cutting roots, a treatment is finished or a plant has grown for a year. ACH closes this gap with achievements, a care rhythm, personal records, anniversaries and a year in review. All of it is derived from the keeper's own data and measured against the keeper's own history.

Prototype reference: none, idea from 2026-10-10. Builds on POK (rank US-POK-10, milestones US-POK-11, "newly caught" US-POK-12), WAC (measurement, trend, etiolation), BEH (treatments), BES (cutting, archive), PHA (care phases), MON (reminders), SOZ (handover US-SOZ-11) and QS (accessibility, today list).

Delimitation from POK: rank and milestones stay in POK (they reward **collecting**). ACH rewards **acting and growing** and shows the POK rank and milestones as one group in its overview (US-ACH-02) without duplicating their logic.

Delimitation from the non-goals in `16`: no leaderboards, no rank comparison between friends, no rating (FR-POK-11, FR-SOZ-11). ACH adds no social pressure and no penalty.

## Problem

1. **Only collecting is rewarded:** the loop "catch → new card" works, but the daily work (measuring, treating, watering, rooting cuttings) gets no feedback when it succeeds.
2. **Success is invisible:** growth trends and photo history exist (US-WAC-03/05), but no moment says "this plant grew 12 cm since March".
3. **Typical game mechanics hurt here:** streaks that reset, daily login bonuses and rankings would pressure keepers into care that harms plants (over-watering, measuring for points) and contradict P-08 and P-10.

## Terms

| Term            | Meaning                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Achievement     | A named, verifiable event in the keeper's own data (e.g. "first cutting rooted"). Defined in the domain logic, never by the model (P-01). Earned once per account. |
| Earned on       | The local calendar date of the event that fulfilled the criterion (NFR-08), not the date the app noticed it.                                                       |
| Next step       | For every open achievement the one action that would fulfil it (P-09).                                                                                             |
| Care rhythm     | Run of consecutive calendar weeks in which every due care task (treatment, measurement, interval watering) was done on time. A gentler replacement for a streak.   |
| Personal record | Best value of a metric in the keeper's own history, with quality `Healthy` (US-WAC-02/04).                                                                         |
| Anniversary     | The yearly (or half-yearly) date of a specimen's catch date (US-POK-07).                                                                                           |
| Year in review  | Private summary of one calendar year, derived from the keeper's data.                                                                                              |
| Calm mode       | Account setting that hides all ACH elements and celebrations (US-ACH-08).                                                                                          |

## User stories

### US-ACH-01 · Earn achievements for care and growth · ⬜ new

As a **plant keeper** I want to earn achievements for real successes in my collection, so that care feels rewarded and not only collecting.

Acceptance criteria:

- Given the first event of a kind happens in my data, when the domain logic evaluates my data, then the matching achievement counts as earned with the local date of that event (`earned on`).
- Starting set (assumption, revisable; each criterion must be checkable from existing data):
  - **First measurement with photo** (US-WAC-01, US-WAC-05)
  - **Cutting rooted:** a cutting became its own specimen (US-BES cutting flow)
  - **Treatment completed:** all dates of a course ticked off (US-BEH-03)
  - **Through a dormancy phase:** a specimen lived through a full dormancy phase with me (US-PHA-01)
  - **Healthy for a year:** a specimen with `Healthy` quality in its last 4 measurements over at least 12 months
  - **First handover:** a swap confirmed by both sides (US-SOZ-11)
  - **From the wishlist to the pot:** a wish became a caught species (US-WUN, US-POK-06)
- Given the basis of an achievement is an archived specimen, when I look at my achievements, then it stays earned (archive keeps the event, P-10).
- Given a criterion cannot be evaluated because data is missing (no measurements, no phase), when I look at the achievement, then it is open and says what is missing, never "failed" (P-08).
- Achievements are **derived**, not stored; only the "seen" state is stored (US-ACH-03, FR-ACH-02).

### US-ACH-02 · See my achievements and what comes next · ⬜ new

As a **plant keeper** I want one overview of earned and open achievements, so that I know what I could do next.

Acceptance criteria:

- Given I open the overview, then earned achievements show name, `earned on` and the specimen or species that led to it (link); open ones show the **next step** as an action (P-09), e.g. "Tick off the last date of the course on <Specimen>".
- Groups: Care · Growth · Swapping · Collecting. The group "Collecting" shows the POK rank, progress and milestones from US-POK-10/11 as they are, with a link to the Pokédex.
- Order: earned newest first; open ones with the smallest remaining effort first.
- No percentage of other users, no "rarer than x %", no total score (P-08, FR-ACH-04).
- Given I have no data yet, then the overview names the first step ("Record a measurement with a photo") instead of an empty list.

### US-ACH-03 · A quiet moment of success · ⬜ new

As a **plant keeper** I want to notice an earned achievement at the moment it happens, so that the reward lands without distracting me from the task.

Acceptance criteria:

- Given an action fulfils an achievement (e.g. I tick off the last treatment date), when the action succeeds, then a short banner "Achievement: <name>" appears with a link to the overview. It never blocks the action and needs no confirmation to continue.
- The "seen" state is stored per account on the server (not in the browser), like US-POK-12: `new` = earned − `seen`. On the first evaluation of an existing account, existing achievements are created silently as seen (no flood of banners).
- Given I miss the moment, then the overview marks the achievement as new until "Okay" writes `seen`.
- Given reduced motion is set, then no animation runs; assistive technology hears the text (NFR-13). The celebration is never the only signal.
- Read errors do not break the page; no banner appears then.
- No push notification, no e-mail for achievements (FR-ACH-06).

### US-ACH-04 · Care rhythm instead of a streak · ⬜ new

As a **plant keeper** I want to see how steadily I have cared, without being punished for a missed week.

Acceptance criteria:

- Given I have due care tasks (treatment dates US-BEH-02, overdue measurements US-MON-04, interval watering US-MON-05), when every task due in a calendar week was done by its due date plus a grace period (assumption: 1 day), then the week counts as "on time".
- Weeks without any due task are neutral: they neither extend nor break the rhythm.
- Display: the last 12 weeks as a bar, the current run and the **longest run so far** (personal record). Nothing is shown as "lost".
- Given I miss a week, when I look at the view, then the current run starts again, the longest run stays, and the text names the open tasks (P-09), not a loss ("2 dates are open", not "streak broken").
- Given I pause (holiday, `Dormancy` of all specimens, or an explicit pause of up to 4 weeks, assumption), then the weeks of the pause are neutral.
- The rhythm counts only tasks that exist because of the plants' needs. A task created only to be ticked off earns nothing: the rhythm never rewards doing more than due (watering earlier than the interval does not count more, FR-ACH-05).

### US-ACH-05 · Personal records and growth moments · ⬜ new

As a **plant keeper** I want to see when a plant beats its own best, so that growth becomes a visible success.

Acceptance criteria:

- Given a specimen has at least 2 measurements and the last quality is `Healthy`, when a measurement is saved, then the app can show "<N> cm since <first measurement date>" and, if the yearly rate beats the specimen's own earlier best, "new personal record: <rate> cm/year".
- Given the last quality is `Etiolated/thin` or the trend is "slower", then no record, no growth moment and no achievement is shown: etiolated growth never counts as success (US-WAC-04).
- Given fewer than 2 measurements exist, then the specimen shows "unknown", not a record (P-08).
- The comparison is always against the specimen's own history, never against other specimens' averages or other users (P-08).
- A growth moment appears on the measurement result and in the specimen's history (US-WAC-05); it is not repeated every visit.

### US-ACH-06 · Anniversaries with the plant · ⬜ new

As a **plant keeper** I want to be reminded how long a plant has been with me, so that I see the story behind the pot.

Acceptance criteria:

- Given a specimen has a catch date (US-POK-07), when today is the half-year or yearly anniversary (local date, NFR-08), then the "Today" list (US-QS-01) shows "<Specimen> is 1 year with you" with the first and the latest photo, if present.
- Given the specimen has no catch date or was archived, then no anniversary appears (unknown stays unknown, P-08).
- Given the anniversary day passed without a visit, then the entry stays on the Today list until the end of that week, then it disappears (P-10: the specimen's history still shows the age).
- Anniversaries do not create push notifications unless I enabled them in the reminder settings (US-MON-08).

### US-ACH-07 · Year in review · ⬜ new

As a **plant keeper** I want a summary of my plant year, so that I can look back at what worked.

Acceptance criteria:

- Given a calendar year has ended or I open the view for the running year, then it shows only counted facts from my data: species caught, cuttings rooted, treatments completed, measurements recorded, handovers, achievements earned, the specimen with the largest healthy growth (own rate, quality `Healthy`) and the photo pair first/last of the year.
- Each fact names its basis; unknown values show "unknown" (P-08). Years without data show what would fill the view.
- The view is private by default (P-05). Sharing is a separate, explicit action that publishes **facts only**, no rank and no comparison, to chosen friends (FR-SOZ-11, FR-ACH-04).
- No percentage, no "better than last year" rating; two years may be shown side by side as plain numbers.

### US-ACH-08 · Switch gamification off · ⬜ new

As a **plant keeper** I want to turn all game elements off, so that the app stays a calm care tool if I do not want them.

Acceptance criteria:

- Given calm mode is on, then the achievement banners, the overview entry, the care rhythm, personal records, anniversaries and the year in review are not shown. POK rank and milestones follow the setting of the Pokédex view and stay unchanged.
- Given calm mode is switched off again, then earned achievements are still there (they are derived) and none appear as new (they count as seen).
- Calm mode is a per-account setting, off by default for new accounts (assumption, revisable), and reachable from the profile (US-ACC-03).
- The state "calm mode" is respected by every ACH element and by the AI client interface (no hidden gamified text, KI-R2).

## Data model

### DM-ACH-01 Achievement definition (in the domain logic, not in the database)

`id` (stable key, e.g. `cutting-rooted`), `group` (care, growth, swapping, collecting), `criterion` (pure function over the keeper's data), `next step` (action text key) and `version`. German texts live in the message tables (UI language rule), the criterion in `core`.

### DM-ACH-02 Seen achievements (per account)

`account id`, `achievement id`, `seen at`. Row-level isolation by account (P-04). Earned state and `earned on` are **not** stored.

### DM-ACH-03 Settings (per account)

`calm mode` (bool, default off), `care rhythm pause until` (local date, optional, at most 4 weeks ahead).

## Requirements

| ID        | Requirement                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-ACH-01 | Criteria, rhythm, records and recaps are pure domain logic without I/O with tests named with the story ID (P-02, P-06). Views only render.                                         |
| FR-ACH-02 | Derived, not stored: earned state, `earned on`, rhythm, records. Stored are only the seen state and the settings (DM-ACH-02/03).                                                   |
| FR-ACH-03 | Every achievement is verifiable from the keeper's own data. No achievement depends on a claim by the keeper that cannot be checked or on a model's judgement (P-01).               |
| FR-ACH-04 | **No ranking, no comparison:** no leaderboards, no "x % of keepers", no total score, no comparison with species averages. Friends see at most facts the keeper shared (FR-POK-11). |
| FR-ACH-05 | **No harm incentives:** nothing is rewarded for more watering, more measuring or more purchases than needed. Etiolated growth never counts as success (US-WAC-04).                 |
| FR-ACH-06 | **No pressure:** no loss messages, no countdowns, no daily login bonus, no notification about achievements. Anniversaries notify only if enabled (US-MON-08).                      |
| FR-ACH-07 | Dates are local calendar dates of the keeper (NFR-08). A time zone change does not change `earned on` of an existing achievement.                                                  |
| FR-ACH-08 | Accessibility: all feedback is text first, animation optional and off under reduced motion, no information by colour alone (NFR-13).                                               |
| FR-ACH-09 | Achievement definitions are versioned; a new definition appears for existing accounts as earned silently if its criterion was already met (seen on creation, US-ACH-03).           |
| FR-ACH-10 | Out of scope: points or levels beyond the POK rank, virtual currency, shop for rewards, time-limited events, public profiles, rankings (non-goals in `16`).                        |

## Open questions

1. **Friends feed:** may a keeper opt in to show earned achievements in "New among friends" (US-SOZ-04) as facts? Proposal: not before R3 and only as an explicit per-achievement share, never automatic.
2. **Deleted data:** if a specimen is deleted for good (not archived), its achievements disappear because the basis is gone. Accept this or keep the earned achievement as a stored fact? Today P-10 argues for stating it in the delete confirmation.
3. **Starting set and thresholds:** the starting set, the grace period (1 day) and the pause limit (4 weeks) are assumptions. Review after a few weeks of use with the three start users.
4. **Calm mode default:** off for everyone, or asked once in onboarding (US-ACC-02)?

## Risks

| Risk                                                                             | Countermeasure                                                                                      |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Rewards push keepers to harmful care (over-watering, measuring for points).      | FR-ACH-05: only needs-based events count; no volume-based achievements.                             |
| Gamification annoys keepers who want a plain tool.                               | Calm mode (US-ACH-08), no push (FR-ACH-06), quiet banner (US-ACH-03).                               |
| Few data for new accounts makes the overview look empty.                         | Open achievements show the next step (US-ACH-02); no invented numbers (P-08).                       |
| A changed definition floods existing accounts with banners.                      | FR-ACH-09: silent creation as seen.                                                                 |
| Achievements derived from fields that change later flip between earned and open. | Criteria use event dates and archived data; evaluate in tests with fixtures of changed data (P-06). |
