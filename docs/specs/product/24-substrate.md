# 24 – Epic SUB: Substrate

Goal: the soil lives in the app like the plants do. The keeper keeps their substrate components and stock, mixes soil recipes in volume parts, records which recipe a plant sits in and why, compares the recipes by the plants' own history, and builds and records supports such as moss poles with their care reminders. Recipes are private until the keeper shares them.

Prototype reference: none. Owner interview 2026-11-05, issues #1350 to #1355. Builds on BES (catalog, review US-BES-10, repotting US-BES-04 and the repot operation `specimen.repot`, care profile US-BES-09), EQU (consumables US-EQU-05, equipment US-EQU-01, the need and the rebuy list US-EQU-07), WUN (equipment wishes, DM-WUN-01), WAC (measurements and growth rate US-WAC-03), MON (reminders US-MON-01 and US-MON-05), SOZ (sharing setting US-SOZ-04, friends), ACC (export US-ACC-04), and the switches of P-12 (US-ONB-09). Suggestions per species depend on the open question on sources (see open questions).

Delimitation from EQU-05: the consumable type `Substrate` is replaced by the substrate model of this epic (US-SUB-01). The species' free-text field for substrate stays as it is; this epic adds components and recipes next to it and changes no value.

Delimitation from BES: the catalog holds the substrate components as shared data, like species. A recipe is the keeper's own mix and is private by default.

Delimitation from SOZ: recipes are shared only on purpose, through the recipe's own sharing setting (US-SUB-06). No friend sees a recipe, a stock level or a price through the exchange or the feed.

Delimitation from ENT: suggested recipes per species (US-SUB-05) come only from citable sources. They are never presented as the keeper's data and are never a Discover card.

## Problem

1. **The soil is not in the app.** The keeper knows that a plant sits in "3 parts pine bark, 2 perlite, 1 soil", but the mix exists only in their head or in a notebook. A repot cannot be reproduced.
2. **Stock is invisible.** Whether perlite is still there is known only when the bag is empty. Then the repot waits.
3. **The reason is lost.** Why a plant was moved into a drier mix, after which root rot, is not recorded next to the repot.
4. **The choice is a guess.** A keeper cannot see how their own plants did in each soil. Sources for soil choices are scattered.
5. **Supports are forgotten.** A moss pole needs moistening, and it needs extending when the plant has outgrown it. Both are remembered by chance.

## Terms

| Term                | Meaning                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Substrate component | A material of the shared catalog (perlite, bims, lava rock, pine bark, sphagnum, akadama, soil, …) with properties from sources (US-SUB-01). |
| Component stock     | The keeper's own supply of a component: `available` ("vorhanden"), `low` ("knapp"), `empty` ("leer"). Same levels as US-EQU-05 (US-SUB-01).  |
| Soil recipe         | A mix of components in volume parts plus a general note ("for whom and why"). Private by default (US-SUB-02).                                |
| Parts and share     | Parts are whole numbers per component. The share is the part divided by all parts, shown in percent (US-SUB-02).                             |
| Soil assignment     | The soil recipe of a specimen from a local date, usually a repotting, with an optional reason (US-SUB-03).                                   |
| Recipe period       | The time a specimen sits in one recipe: from its assignment to the next assignment.                                                          |
| Support             | Equipment that holds a plant upright or climbing: moss pole, coconut stick, trellis, walkway (US-SUB-08).                                    |
| Build recipe        | Materials and amounts for building a support, for example sphagnum, net, cable ties, tube (US-SUB-09).                                       |
| Public library      | Opt-in collection of published soil and build recipes for everyone, approved by a reviewer (US-SUB-07).                                      |

## User stories

### US-SUB-01 · Keep substrate components and my stock · ⬜ new

Issue #1350. As a **plant keeper** I want to pick substrate components from a shared catalog and keep my own stock of them with a supply level, so that my soil lives in the app like my plants do.

Acceptance criteria:

- Given the component list, when I add perlite to my stock, then it shows with the supply "available" ("vorhanden").
- Given I set a component to "empty" ("leer"), when I confirm the offer "Auf die Wunschliste" (put on the wishlist), then an equipment wish for it exists (DM-WUN-01, type `Equipment`). The supply stays "empty" until I change it.
- Given a component property (drainage, water holding, pH, breaks down over time) without a source, then it shows "unbekannt" (P-08, FR-BES-16).
- Given a component I need that is not in the catalog, when I propose it, then it goes to the review queue (US-BES-10). It is visible only to me until a reviewer approves it (FR-BES-11).
- Given I change a supply, then the change is saved with the local date and can be undone with the same toast as US-EQU-05 (P-10).
- Given the consumable type "Substrate" of US-EQU-05, then it is replaced by this model. There is no migration job, because no production data exists yet (owner decision).

### US-SUB-02 · Soil recipes in volume parts with shares and a note · ⬜ new

Issue #1351. As a **plant keeper** I want to save a soil recipe as volume parts of components, so that I can mix the same soil again.

Acceptance criteria:

- Given a recipe 3 parts pine bark, 2 parts perlite and 1 part soil, when I open it, then I see 50 %, 33 % and 17 % next to the parts. The shares are rounded to whole percent and add up to 100 %.
- Given a component of a recipe is not in my stock, then the recipe says so and offers to put it on the wishlist (US-SUB-01, P-09).
- Given the recipe has a general note ("for whom and why"), then the note is shown with the recipe and is free text without logic (NFR-01).
- Given parts, then each component has a whole number of parts from 1 to 100 (starting value, assumption). A recipe has at least one component.
- Given a recipe is in use by a specimen, when I try to delete it, then it is refused and the view lists the plants that use it (P-10).
- Recipes are private by default (P-05).

### US-SUB-03 · Record which recipe a plant sits in, since which repotting, and why · ⬜ new

Issue #1352. As a **plant keeper** I want to record which soil recipe a plant sits in since which repotting, with a short reason, so that I know later what I did and why.

Acceptance criteria:

- Given I repot a plant (`specimen.repot`, US-BES-04), when I choose a recipe and optionally a reason ("more drainage, root rot last year"), then the plant shows the recipe since that local date, and the recipe lists the plant.
- Given a later repotting into another recipe, then the history keeps both periods with their reasons. The earlier period ends on the day of the later assignment (P-10).
- Given I assign a recipe without a repotting, then I can give the date of the assignment. This is possible but not the normal path (assumption: the owner expects a repotting).
- Given a plant has no recipe, then the plant shows "keine Erde erfasst" and the next step "Erde beim nächsten Umtopfen erfassen" (P-09).
- Given a plant is shared with friends, then its recipe reason reaches a friend only through a shared recipe (US-SUB-06), never through the plant.

### US-SUB-04 · Compare recipes by my plants' history · ⬜ new

Issue #1353. As a **plant keeper** I want to compare how my plants did in each recipe, so that I can choose a soil with evidence from my own data.

Acceptance criteria:

- Given two recipe periods of my plants, when I open the comparison, then I see growth (rate of US-WAC-03) and treatments per period, from my own measurements and treatments.
- Given a period has fewer than two measurements, then it shows "zu wenig Daten" instead of a value. Two measurements are the minimum for a growth rate (US-WAC-03).
- Given the comparison, then it names the recipe and the plants of each period and shows no rank, no "best recipe" and no score (P-08).
- Given the comparison, then no species average and no other keeper's data is used (P-08, P-05).

### US-SUB-05 · See sourced recipe suggestions per species · ⬜ new

Issue #1353. As a **plant keeper** I want suggested recipes for a species from citable sources, so that I can choose a soil with a source behind it.

Acceptance criteria:

- Given a species with a sourced suggestion, when I open it, then the suggestion shows its source link and its retrieval date, and it is labelled "Vorschlag, nicht deine Daten".
- Given a species without a source, then no suggestion is shown, and the page says that no sourced suggestion exists (P-08, P-09).
- Given a suggestion, when I adopt it, then a copy becomes my own private recipe. The copy keeps the source as text, and later changes of the suggestion do not change my copy.
- Given a suggestion is shown, then it never appears as a comparison result of US-SUB-04 and never as a Discover card (epic ENT).

### US-SUB-06 · Share a recipe with friends and let them copy it · ⬜ new

Issue #1354. As a **plant keeper** I want to share a soil recipe with friends, including which of my plants use it and why, so that they can learn from it and copy it.

Acceptance criteria:

- Given I share a recipe with friends (sharing setting per recipe, default private), when a friend opens it, then they see the components, the parts, the general note, the plants of the recipe that are shared with friends (US-SOZ-04) with their reasons. Other plants appear as a count only (assumption, P-05).
- Given a friend copies the recipe, then the copy is their own recipe, and later changes of mine do not change it.
- Given a shared recipe, then prices, places of purchase and stock levels are never part of it (owner decision).
- Given I stop sharing, then the friend's copy stays with them, and the shared view disappears for them (assumption, P-10).
- Given a friend has no friendship with me (any more), then the recipe is not visible to them (FR-SOZ-02).

### US-SUB-07 · Publish a recipe to the public library · ⬜ new

Issue #1354. As a **plant keeper** I want to publish a recipe to a public library, so that others can learn from it. The library is opt-in and reviewed.

Acceptance criteria:

- Given I publish a recipe (opt-in per recipe), when a reviewer approves it (US-BES-10), then it appears in the public library. Until then only friends see it, if I shared it with them.
- Given a recipe in the public library, then it shows components, parts and the general note only. My plants, reasons, prices, places of purchase and stock levels are not shown (assumption, P-05).
- Given a reviewer rejects the recipe, then I see the reason, and the recipe stays private (US-BES-10).
- Given I unpublish a recipe, then it leaves the library at once. Copies that others made stay theirs.

### US-SUB-08 · Record the support of each plant · ⬜ new

Issue #1355. Release R5 (owner decision 2026-11-05: supports need EQU). As a **plant keeper** I want to record the support of each plant with its height and since when, so that I know what the plant grows on.

Acceptance criteria:

- Given a plant, when I add a support (for example moss pole, coconut stick, trellis, walkway) with its height in centimetres and the date since when it stands there, then it is attached to the specimen as an equipment item with a price (US-EQU-01).
- Given the support uses moss, then the moss is a consumable and is linked to my stock (US-SUB-01, US-EQU-05).
- Given an extension of the support, when I save the new height with its date, then the support shows its current height and its history. Both heights are kept (P-10).
- Given the support list, then it is open for more kinds, the named kinds are examples.

### US-SUB-09 · Keep build recipes for supports and share them · ⬜ new

Issue #1355. Release R5 (owner decision 2026-11-05: supports need EQU). As a **plant keeper** I want build recipes for my supports, so that I can build a moss pole the same way again.

Acceptance criteria:

- Given a build recipe (for example sphagnum, net, cable ties, tube), when I save it with its materials and their amounts as text, then it is private like a soil recipe (P-05). Amounts are text, not volume parts.
- Given I attach a build recipe to a support, then the support lists its materials. Materials that are consumables follow US-SUB-01 (empty stock offers the wishlist).
- Given a build recipe, then it can be shared, copied and published exactly like a soil recipe (US-SUB-06, US-SUB-07).

### US-SUB-10 · Care reminders for moistening and extending supports · ⬜ new

Issue #1355. Release R5 (owner decision 2026-11-05: supports need EQU). As a **plant keeper** I want reminders to moisten a moss pole and to extend it when the plant has outgrown it, so that the plant can climb.

Acceptance criteria:

- Given a moistening interval (starting value 7 days, assumption), when it is due, then it shows on "Heute" like the other care tasks (US-MON-05), with the action "gegossen" ("moistened") that executes directly.
- Given a plant with a 60 cm moss pole, when its latest measured height reaches the pole height, then I get a reminder to extend the pole, on "Heute" and by the reminder channel of MON (US-MON-01).
- Given the plant has no measured height, then no extension reminder is made and the support shows "keine Höhe gemessen" (P-08).
- Given an extension, then the pole height updates, and the reminder is not repeated for the old height.
- Given the keeper switch for supports is off (US-ONB-09), then no moistening or extension reminder is made and no entry shows on "Heute". The supports and their history stay (P-12, P-10).

## Data model

### DM-SUB-01 Substrate component (shared catalog)

`Name` (German, required), `Other_Names?`, `Properties` (drainage, water holding, pH, breaks down over time: each a value or `unknown`, with source and date as DM-BES-06), `Status` (`proposed | reviewed`). Shared catalog data, like species.

### DM-SUB-02 Component stock (per account)

`Account`, `Component`, `Supply` (`available | low | empty`), `Changed_At` (local date). Changed by a validating operation (P-03).

### DM-SUB-03 Soil recipe (per account)

`Name`, `Note?` (free text, 500 characters, starting value), `Sharing` (`private | friends`, default `private`), `Library` (`none | proposed | published`), `Created_At`, `Changed_At`.

### DM-SUB-04 Recipe part

`Recipe`, `Component`, `Parts` (whole number, 1 to 100, starting value). A recipe has at least one part row.

### DM-SUB-05 Soil assignment (per specimen, private)

`Specimen`, `Recipe`, `Since` (local date), `Reason?` (free text, 200 characters, starting value), `Repotting?` (reference to the repot day of `specimen.repot`). The end of a period is derived from the next assignment (NFR-04).

### DM-SUB-06 Support (extension of DM-EQU-01)

`Specimen`, `Kind`, `Height_cm` (current, whole centimetres), `Since` (local date), `Moisten_Interval_Days?` (starting value 7, assumption), `Build_Recipe?`. Price and moss consumable as DM-EQU-01 and DM-EQU-03.

### DM-SUB-07 Support height history

`Support`, `Date` (local date), `Height_cm`. Written with each extension; the current height is the latest entry.

### DM-SUB-08 Build recipe (per account)

`Name`, `Materials` (list of material name and amount as text), `Note?`, `Sharing` (`private | friends`), `Library` (`none | proposed | published`).

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-SUB-01 | Shares, rounding, the sum of parts, the stock rule and the reminder due dates are pure domain logic without I/O, with tests (P-02, P-06).                                                                                                                  | ⬜     |
| FR-SUB-02 | Unknown component properties show "unbekannt". No property is estimated or copied from a neighbouring component (P-08).                                                                                                                                    | ⬜     |
| FR-SUB-03 | Recipes, stock, soil assignments, supports and build recipes are private (P-04, P-05). They leave the account only through a sharing setting (US-SUB-06) or the public library (US-SUB-07). Prices, places of purchase and stock levels are never shared.  | ⬜     |
| FR-SUB-04 | The comparison uses only the keeper's own data, and suggestions only with a source. No species average, no ranking of recipes (P-08).                                                                                                                      | ⬜     |
| FR-SUB-05 | Writes go only through validating operations (P-03). An offer to the wishlist is written only after confirmation.                                                                                                                                          | ⬜     |
| FR-SUB-06 | No product prices and no affiliate parameters in this epic. A shop link follows FR-EQU-03 to FR-EQU-05 and any later partner decision (E-07).                                                                                                              | ⬜     |
| FR-SUB-07 | Accessibility (NFR-13, US-QS-14): every choice is a button or a field with a text label, reminders are text, 360 px width, one-hand use (P-11).                                                                                                            | ⬜     |
| FR-SUB-08 | Dates are local dates of the keeper (NFR-08). Heights are whole centimetres.                                                                                                                                                                               | ⬜     |
| FR-SUB-09 | The epic is switchable with the keeper switch (US-ONB-09, P-12): recipes, supports and their reminders leave navigation, "Heute" and reminders when switched off, and the data stays. The care reminders of core care (MON-02 to MON-05) are not affected. | ⬜     |

## Dependencies and build order

Release split (owner decision 2026-11-05): R2 for US-SUB-01 to US-SUB-07; R5 for US-SUB-08 to US-SUB-10, the supports and their reminders, because they need EQU, which is placed in R5 (`16-releases-and-decisions.md`). Priority P2 for R2 and P3 for R5 by the rule of thumb in `CLAUDE.md`; the owner may overrule per ticket.

US-SUB-01 keeps the equipment wish in R2: it uses the wish type `Equipment` of DM-WUN-01, not the equipment items of EQU. The order of the R5 stories follows EQU.

| Order | Story     | Release                         | Depends on                                 | Why here                                           |
| ----- | --------- | ------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| 1     | US-SUB-01 | R2                              | US-BES-01, US-BES-10, US-EQU-05, DM-WUN-01 | Components and stock are the base of every recipe  |
| 2     | US-SUB-02 | R2                              | US-SUB-01                                  | Recipes need components                            |
| 3     | US-SUB-03 | R2                              | US-SUB-02, US-BES-04                       | Assignments need recipes and the repot operation   |
| 4     | US-SUB-04 | R2                              | US-SUB-03, US-WAC-03                       | The comparison needs assignments and measurements  |
| 5     | US-SUB-06 | R2                              | US-SUB-02, US-SOZ-04                       | Sharing needs recipes and the sharing setting      |
| 6     | US-SUB-07 | R2                              | US-SUB-06, US-BES-10                       | The library needs shared recipes and the review    |
| 7     | US-SUB-05 | R2 (blocked by open question 1) | Open question 1 (sources)                  | Suggestions wait for the source decision           |
| 8     | US-SUB-08 | R5                              | US-EQU-01, US-EQU-05, US-SUB-01            | Supports are equipment items                       |
| 9     | US-SUB-09 | R5                              | US-SUB-08, US-SUB-06                       | Build recipes follow the support                   |
| 10    | US-SUB-10 | R5                              | US-SUB-08, US-MON-05, US-WAC-03            | Reminders need the support and the measured height |

## Assumptions (to be confirmed by the owner)

- **Shares** are whole percent, rounded; the sum is 100 %.
- **Starting values:** 1 to 100 parts per component; 500 characters for a recipe note; 200 characters for an assignment reason; 7 days between moistenings of a support.
- **Shared recipes** show other plants only as a count; plants show by name only where their sharing setting allows friends.
- **Public library** shows components, parts and the note only.
- **Assignments** without a repotting are possible.
- **Build recipes** list materials with amounts as text, not as volume parts.
- **Core or switchable (P-12):** the species' free-text substrate field and the care reminders stay core. Recipes, stock, supports and their reminders are switchable.
- **Placement in the app:** the stock and the recipes live in the destination "Sammlung" next to equipment, not in a new main destination (US-QS-14: at most five main destinations). Assumption, to be confirmed.

## Open questions

1. **Sources for suggestions and component properties:** which sources count (GBIF and Wikipedia cover species, not soil mixes)? Does a suggestion come from the reviewed catalog only, or from research by the keeper's AI client (US-KI-05)? Issue #1353 asks for citable sources without naming them.
2. **Resolved (owner decision 2026-11-05):** the supports and their reminders (US-SUB-08 to US-SUB-10) are in R5 with EQU; US-SUB-01 stays in R2 (see Dependencies).
3. **Public names:** does a public recipe show the keeper's display name? Assumed here: no name (P-05), to be confirmed.
4. **Plant names in shares:** should a friend see the names of plants that are not shared with friends, or only the count (assumed)?

## Risks

| Risk                                                              | Countermeasure                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A soil suggestion without a real source is presented as advice.   | Shown only with source and date, labelled as suggestion, never a Discover card (US-SUB-05).                               |
| A shared recipe leaks the plants and places of a keeper.          | Sharing per recipe, plants by name only where shared, prices and stock never shared, contract test of the output (QG-D2). |
| The comparison is read as proof that one soil is better.          | Own data only, "zu wenig Daten" below two measurements, no rank, no score (FR-SUB-04).                                    |
| Reminders for supports nag or repeat.                             | One due date per interval, no reminder without a measured height, switchable (US-SUB-10, P-12).                           |
| Stock and recipes drift apart (a recipe uses an empty component). | The recipe names the missing component and offers the wish (US-SUB-02, P-09).                                             |
