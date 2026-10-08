# 13 – Business Case and Product Stages

As of: 2026-10-02 · Draft. No market figures: everything that appears here as a number is an **assumption to be checked**, not research.

Replacement: replaces `../prototype/12-business-case.md`. Change: the product is the web app, no longer a vault with additional services. That removes the Obsidian hurdle and makes stage 2 with strangers possible, but brings **real operating costs** (hosting, photo storage, AI) and **legal duties** (privacy, imprint) from the start.

## Starting point

- The prototype shows that the care, growth and collecting logic works. **Three people** use it or want to use it and find it "brilliant". Social is a win for all three.
- Goal in three steps: (1) at least for us, (2) pays for itself, (3) profit at some point.

This is a **product with engagement first, money later**. Whoever monetizes first, before there is a community, has neither the one nor the other.

## Value proposition

For plant collectors with more than about 10 plants (see `00-Product-Overview.md`):

1. Says what to do today (phases, treatments, light, measurements).
2. Measures success against own data (measurements, photos, trend).
3. Rewards collecting (Pokédex, milestones).
4. Makes new acquisitions and cutting swaps among friends visible and clean.
5. Takes input by voice and photo, via the keeper's own AI client (open interface, no provider lock-in).

Delimitation: beginner apps (watering reminder, plant identification) serve a different target group. Competition is everyday tools: spreadsheets, note apps, messenger groups, classified ads.

## Stages

### Stage 1 · For us (goal: used permanently, costs low)

Success criteria (assumptions, confirm before starting):

- All three **switch from the vault to the app** (parity of the core functions, see `16-Releases-and-Decisions.md` R1) and use it **at least weekly**, also without a reminder.
- At least **one real swap** runs completely through the app.
- The feed "New among friends" is opened without anyone reminding of it.

What has to be built for that: releases R0 to R2 (foundation, parity, social); reminders (R3) increase engagement, but are not a condition for the start.

Costs: development time; hosting, photo storage and load from AI connections for three accounts (very low, but **to be measured**, NFR-16); domain. No revenue.

Exit signals: after 8 weeks at most one person uses the social feature → reconsider swapping. If someone does not switch to the app after parity → clarify the cause before further expansion.

### Stage 2 · Pays for itself (goal: running costs covered)

Precondition: stage 1 passed **and** further users outside the three who stay without an invitation from us. Privacy policy, imprint, deletion concept are in place (NFR-11).

Running costs (to be determined, not estimated): hosting, database, photo storage, load of the AI connections per user, push, domain, email, backups, external sources (Wikipedia/GBIF/OpenTree, free so far with throttling), possibly payment processing.

Revenue sources in order of suitability:

| Source                                                    | Fit                                                          | Note                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Voluntary contribution / small subscription** ("supporter") | fits a small community                                   | Return: more photo storage, higher rate limits of the AI connection, sensor integration (MON), export. Core functions stay free, otherwise swapping falls away.        |
| **Affiliate links** (lamps, substrate, sensors)           | fits: the app knows light zones, wishlist and device stock   | only labeled and only for derived need; rules in `11-Equipment-and-Recommendations.md` (FR-EQU-03 to -10)                                                              |
| **Shop/nursery partners** via "you lack it" species       | fits, needs user numbers                                     | only from measurable traffic                                                                                                                                           |

AI costs arise at the keeper (own AI client), not at the operator; for us only the load of the interface arises, limited by rate limits per connection (US-KI-06). A built-in chat with an operator quota would change that (E-19).

Break-even calculation (placeholder): `paying_users × price × (1 − fees) ≥ running_costs`. The numbers are measured in stage 1, not assumed.

### Stage 3 · Profit

Only possible if user numbers and engagement are far above stage 2. Options, each with its own decision:

1. **More affiliate/partners** with a growing community.
2. **Marketplace share** on sales. A different business (payment, shipping, fraud, plant and species protection law) with its own decision, because FR-SOZ-11 has so far excluded selling (E-07).
3. **Catalog and data:** curated species catalog (care knowledge, taxonomy) as premium content. Note legally: Wikipedia texts are under CC BY-SA (FR-POK-07).
4. **Aggregated insights** ("this is how it went for others under lamp 3") only with a minimum count and displayed sample size (non-goal until the amount of data suffices).

## Risks

| Risk                                                                                                          | Effect                                              | Countermeasure                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rebuild without parity:** the three keep using the vault because the app can do less                        | Stage 1 fails                                       | Release R1 has parity as its goal; prototype and app run in parallel, switch only after the keeper confirms; re-entry instead of import (risk R-10 in `16`)          |
| Effort: the vault prototype becomes a product (accounts, operation, privacy)                                  | Project fizzles out                                 | Smallest releases, each usable; keep operation simple (E-01)                                                                                                         |
| Network effect missing (feed empty with 1–2 friends)                                                          | Social seems dead                                   | Start with the circle of friends; value also without friends (Pokédex, care)                                                                                         |
| Target group pays little                                                                                      | Stage 2 fails                                       | Keep costs low, no subscription compulsion for core functions                                                                                                        |
| Load of the AI connections grows faster than revenue; users without a paid AI client see less value           | Loss per user or weaker value proposition 5         | Rate limits per connection, measurement (NFR-16), manual paths always available (FR-KI-05); E-19 checks a built-in chat later                                        |
| Privacy and location/photos                                                                                   | Loss of trust, fine                                 | Private by default (FR-SOZ-01), remove EXIF/GPS, GDPR concept before the first external user                                                                         |
| Swapping legally (species protection, plant health)                                                           | Liability                                           | Notices (FR-SOZ-09), no shipping/selling in stages 1–2                                                                                                               |
| Catalog quality (AI-created profiles with errors)                                                             | wrong care hints                                    | Review status (FR-BES-06), sources, operator review list                                                                                                             |

## Decisions that determine this case

Collected in `16-Releases-and-Decisions.md`. Relevant for the case:

1. **E-01 Technology and hosting** (costs and operating effort of stages 1 and 2).
2. **E-04 AI access (interface instead of a built-in provider) and E-19 built-in chat.**
3. **E-07 Allow selling** (stage 3).
4. **E-08 Voluntary contribution or subscription** (stage 2).

## Metrics

| Metric                                           | Stage | How measured                                         |
| ------------------------------------------------ | ----- | ---------------------------------------------------- |
| Weekly active accounts                           | 1     | Sign-ins and actions, without evaluating content     |
| Switch from the vault to the app                 | 1     | all three use the app for daily care                 |
| Completed swaps                                  | 1, 2  | Swap with status `handed over`                       |
| Cost per active account (hosting, storage, AI)   | 1, 2  | Operator measurement (NFR-16)                        |
| New accounts without an invitation from us       | 2     | Registrations (US-ACC-05 after opening)              |
| Paying users, running costs                      | 2     | Payment provider, invoices                           |
| Return rate after 4 weeks                        | 2, 3  | Account activity                                     |
