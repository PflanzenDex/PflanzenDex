# 12 – Business Case and Product Stages

As of: 2026-10-02 · Draft from the conversation of the same day. No market figures: everything that appears here as a number is an **assumption to be checked**, not research.

## Starting point

- The system (epics BES to POK) runs in the plant keeper's Obsidian vault and is used there.
- **Three people** are already users or want to be and find the current state "brilliant". Social (epic SOZ) would be a win for all three.
- Goal in three steps: (1) at least for us, (2) pays for itself, (3) profit at some point.

This is a **product with engagement first, money later**. The order is deliberate: whoever monetizes first, before there is a community, has neither the one nor the other.

## Value proposition

For plant collectors with more than about 10 plants who care, collect and swap seriously:

1. Says what to do today (phases, treatments, light) instead of only reminding of watering.
2. Measures success against own data (growth log, photos, trend).
3. Rewards collecting (Pokédex, milestones).
4. Makes cutting swaps and new acquisitions among friends visible and clean (epic SOZ).

Delimitation: beginner apps (watering reminder, plant identification) serve a different target group. Competition is everyday tools: spreadsheets, note apps, messenger groups, classified ads.

## Stages

### Stage 1 · For us (goal: used permanently, costs ≈ 0)

Success criteria (assumptions, confirm before starting):

- All three use the system **at least weekly**, also without a reminder.
- At least **one real swap** runs completely through the system (offer → acceptance → handover).
- The feed "Neu bei Freunden" is opened without anyone reminding of it.

What has to be built for that: epic SOZ in its smallest form (US-SOZ-01 to -05, -08 to -11) on the simplest exchange layer (E-SOZ-01), notification via the bot if available.

Costs: development time, hosting in the cent to low euro range, no revenue.

Exit signal: after 8 weeks at most one person uses the social feature. Then drop swapping and stay with single use.

### Stage 2 · Pays for itself (goal: running costs covered)

Precondition: stage 1 passed **and** further users outside the three who stay without an invitation from us.

Running costs (to be determined, not estimated): hosting of the hub, domain, storage for photos, Telegram or push integration, Wikipedia/GBIF/OpenTree calls (free so far, with throttling), possibly payment processing.

Revenue sources in order of suitability:

| Source                                                        | Fit                                                                               | Note                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Voluntary contribution / small subscription** ("supporter") | fits a small community                                                            | Return: more photo storage, sensor integration (MON), export. Core functions stay free, otherwise swapping falls away. |
| **Affiliate links** (lamps, substrate, sensors)               | fits: the app knows lamp demand and wishlist, from epic EQU also the device stock | only label and only for things the app recommends anyway; rules in `13-Equipment-and-Affiliate.md` (FR-EQU-03…10)      |
| **Shop/nursery partners** via "Fehlt dir" species             | fits, needs user numbers                                                          | only from measurable traffic                                                                                           |

Break-even calculation (placeholder): `paying_users × price × (1 − fees) ≥ running_costs`. The numbers are measured in stage 1, not assumed.

### Stage 3 · Profit

Only possible if user numbers and engagement are far above stage 2. Options, each with its own decision:

1. **More affiliate/partners** with a growing community.
2. **Marketplace share** on sales between friends and their friends. That is a different business (payment, shipping, fraud, plant and species protection law) and would need an explicit decision, because FR-SOZ-11 has so far excluded selling.
3. **Catalog and data:** curated Pokédex (species, care knowledge) as premium content. Note legally: Wikipedia texts are under CC BY-SA (FR-POK-07).

## Risks

| Risk                                                 | Effect                                 | Countermeasure                                                                    |
| ---------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| Network effect missing (feed empty with 1–2 friends) | Social seems dead                      | Start only with the circle of friends; value also without friends (Pokédex, care) |
| Target group pays little                             | Stage 2 fails                          | Keep costs low, no subscription compulsion for core functions                     |
| Entry hurdle Obsidian/Dataview                       | Growth stays limited to the tech-savvy | Decide on an own interface only after stage 1                                     |
| Privacy and location/photos                          | Loss of trust                          | Private by default (FR-SOZ-01)                                                    |
| Swapping legally (species protection, plant health)  | Liability                              | Notices (FR-SOZ-09), no shipping/selling in stages 1–2                            |
| Operation too costly for few users                   | Project fizzles out                    | Choose the simplest exchange layer, build nothing that stage 1 does not need      |

## Decisions that determine this case

1. **E-SOZ-01 Exchange layer:** the choice determines costs and effort of stages 1 and 2 (bot hub is cheapest, own server most scalable).
2. **Own app or Obsidian plugin:** stage 1 works in Obsidian, stage 2 with strangers probably not. Decision only after stage 1.
3. **Allow selling (stage 3):** deliberately open, see FR-SOZ-11.
4. **Voluntary contribution or subscription** in stage 2.

## Metrics

| Metric                                  | Stage | How measured                        |
| --------------------------------------- | ----- | ----------------------------------- |
| Weekly active users                     | 1     | Hub accesses or dashboard openings  |
| Completed swaps                         | 1, 2  | `Tausch_Id` with status `übergeben` |
| New users without an invitation from us | 2     | Hub sign-ups                        |
| Paying users, running costs             | 2     | Payment provider, invoices          |
| Return rate after 4 weeks               | 2, 3  | Hub data                            |
