# 23 – Epic VAR: Variegated Cultivars

Goal: a variegated cultivar is a thing of its own. The keeper finds it under any trade name, collects and wishes for it like a species, sees how stable its variegation is and what it costs, and is warned early when the variegation is being lost. Every fact and every price shows its source and date, or "unbekannt".

Prototype reference: none. Owner interview 2026-11-05, issues #1344 to #1347 and #1349. Builds on BES (catalog, review US-BES-10, corrections US-BES-14 and US-BES-16, provenance DM-BES-06), POK (cultivar chip US-POK-06, changed for variegated cultivars by this epic), WAC (history and photos US-WAC-05, photo assessment US-WAC-06), WUN (wishes, US-WUN-01), EQU (no invented product data FR-EQU-09), KI (research US-KI-05, photo assessment US-KI-04), the switches of P-12 (US-ONB-09) and the operator's feature switch `ai` (US-DEV-06). The research stories depend on the open decision E-19.

Delimitation from POK-06: an ordinary cultivar stays a chip on the species card. Only a variegated cultivar becomes its own catalog entry (scope, see assumptions). The cultivar entry is linked to its species; the species keeps its own entry and its own review.

Delimitation from BES: a cultivar entry is a proposal and a review like a species (US-BES-10). It never changes the species, and a merge never deletes a species.

Delimitation from DEAL: the prices here are researched on demand for one cultivar and show dated examples. Offers that shops and keepers report (epic DEAL) are a different thing and never fill this price list.

Delimitation from WAC: variegation events sit beside the growth course. They never change a growth measurement, and no growth value is derived from them (P-08).

## Problem

1. **Trade names do not find the plant.** One line is sold as 'Thai Constellation', 'White Monster' or 'Albo Borsigiana' ('White Tiger'). A search for one of these names finds nothing or the wrong entry.
2. **The risk is invisible before buying.** A variegated line can revert to green or go all white. The keeper cannot see whether a line is stable, a natural mutation or a bred line, or whether nobody has said so.
3. **Prices per size class are unknown.** Before buying, nothing shows what a rooted baby, a juvenile or an adult plant of the line costs.
4. **Variegation loss goes unnoticed.** Leaves that turn green or white are not recorded next to the growth course, so the loss cannot be read or acted on in time.
5. **The same line exists twice.** Two catalog entries under two names split the collection, the wishes and the Pokédex.

## Terms

| Term                   | Meaning                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Variegated cultivar    | Named cultivar with variegated leaves that is its own shared catalog entry, linked to its species (US-VAR-01).                                                                       |
| Trade name (alias)     | A name under which a shop sells the line. Searchable on its entry and shown as "auch verkauft als …" (US-VAR-01).                                                                    |
| Variegation fact       | One sourced statement about a cultivar: stability, origin, type or pattern (US-VAR-04). Without a source it shows "unbekannt".                                                       |
| Stability              | The risks named in the sources: `stable`, `reverts to green`, `goes all white`. A line can carry both risks; a fact then lists both.                                                 |
| Origin                 | `natural mutation`, `bred` or `tissue-culture line`.                                                                                                                                 |
| Type and pattern       | Type is `chimera` or `genetic`. The pattern (for example sectoral, marginal, marbled) is a separate fact (US-VAR-04).                                                                |
| Variegation event      | A logged change of a variegated specimen: reverted green leaf, all-white leaf, half-moon leaf, cut back to a node (US-VAR-07).                                                       |
| Reversion              | Green leaves where the line should be variegated. The warning counts green leaves in a row in the event history (US-VAR-08).                                                         |
| Size class             | Fixed class of a shop listing: `tissue culture` (jar or plug), `baby` (rooted cutting, 1 to 3 leaves), `juvenile`, `adult`. A listing without a class shows "unbekannt" (US-VAR-06). |
| Shop price             | Price of one listing: shop, size class, price in EUR incl. VAT, retrieval date and link. A dated example, never "the price".                                                         |
| Marketplace            | A private sellers' platform (eBay, Kleinanzeigen). Its prices are always labelled as marketplace offers.                                                                             |
| Research (variegation) | AI research of facts or prices, started by a keeper with an own AI key and only on request. It stores only what has a source and a date (FR-VAR-04).                                 |

## User stories

### US-VAR-01 · Find a variegated cultivar by any trade name · ⬜ new

Issue #1344. As a **plant keeper** I want to find a variegated cultivar under any trade name, so that I find the one entry and not several.

Acceptance criteria:

- Given a variegated cultivar entry with its trade names, when I search for any of them, then I find the one entry, and the entry shows the trade name that matched ("auch verkauft als …").
- Given a name is compared, then case and diacritics are folded as in the duplicate check of US-WUN-01 (FR-WUN-06).
- Given the entry is shown, then it names its species (linked) and the cultivar in the form `Monstera deliciosa 'Thai Constellation'`; the species name is the first two words of the Latin name (US-POK-06).
- Given a keeper proposes an alias that another entry already holds, then the proposal is shown to the reviewer as a duplicate hint (US-BES-10) and nothing changes until the review.
- Given a search without a hit, then the view says "Nicht im Katalog" and offers to propose the cultivar (P-09).
- Given a new cultivar, then it enters the catalog as a proposal (like US-BES-01) and becomes visible to everyone only after a reviewer approves it (FR-BES-11). The catalog job does not create cultivars (assumption; see open questions).

### US-VAR-02 · Catch a cultivar and see its species as caught · ⬜ new

Issue #1344. As a **plant keeper** I want a variegated cultivar I own to count as its species and to have its own card, so that the Pokédex shows both.

Acceptance criteria:

- Given I have an active specimen of 'Thai Constellation', when I open the Pokédex, then Monstera deliciosa and the cultivar both show as caught; the cultivar is an extra card under its species (US-POK-01).
- Given the cultivar entry is merged into another entry (US-VAR-03), then the caught status and the card follow the remaining entry; nothing is lost (P-10).
- Given a specimen of the species carries the cultivar only as a chip (no cultivar entry yet), then it counts for the species as today (US-POK-06) and the chip stays.
- Assumption: the cultivar card does not change the species count of the Pokédex; the owner decided the card, not the counting.

### US-VAR-03 · Merge two entries of one line · ⬜ new

Issue #1344. As a **reviewer** I want to merge two entries of the same line, so that specimens, wishes and names point to one entry.

Acceptance criteria:

- Given two entries for the same line, when a reviewer merges them, then specimens, wishes and trade names of both point to the remaining entry (US-BES-10).
- Given a merge, then the name of the merged entry becomes an alias of the remaining entry, so that searches for it still find the line (P-10).
- Given the two entries hold facts or prices, then all of them are kept with their sources and dates. A conflicting fact becomes a correction for the review and is not overwritten (FR-BES-19).
- Given a merge is refused or undone, then nothing has been moved (all or nothing).

### US-VAR-04 · See the variegation facts with source and date · ⬜ new

Issue #1345. As a **plant keeper** I want to see for each variegated cultivar whether its variegation is stable, whether it is a natural mutation, a bred line or a tissue-culture line, and of which type, so that I know the risk before I buy.

Acceptance criteria:

- Given a variegated cultivar, when I open it, then I see per fact: stability, origin, type and pattern, each with its source link and its retrieval date (local date, NFR-08).
- Given a fact without a source, when I open the entry, then the fact shows "unbekannt" and never a guess (P-08).
- Given a fact is shown, then its source link and date are one tap away (FR-BES-16).
- Given a keeper with an own AI key opens a cultivar whose facts were never researched, then the research may run; it stores only facts with a citable source and a retrieval date, and labels them as research (FR-VAR-04, FR-VAR-05).
- Given a fact comes from research, then it is shown at once with the label "from research" and is listed for the reviewer (assumption; see open questions).
- Given the operator switch `ai` or the keeper switch for variegation is off, then no research runs and the facts already stored stay visible (P-10, US-ONB-09).

### US-VAR-05 · Propose a correction of a fact · ⬜ new

Issue #1345. As a **plant keeper** I want to propose a correction with a source, so that a wrong or outdated fact is fixed by a review and not by a guess.

Acceptance criteria:

- Given I propose a corrected value, then it needs a source link and goes to the review queue (US-BES-14, US-BES-16). The fact stays unchanged until then.
- Given a reviewer approves the correction, then the fact shows the new value with its new source and date, and the old value stays in the history (FR-BES-12).
- Given a reviewer rejects the correction, then the fact stays unchanged, and I see the reason (US-BES-10).
- Given I propose a correction without a source, then it is refused with a clear message (P-08).
- Given other keepers vote on a fact, then the votes are a signal only and never change the fact (FR-BES-21, E-26).

### US-VAR-06 · See dated shop prices per size class · ⬜ new

Issue #1346. As a **plant keeper** I want to see current shop prices of a cultivar per size class, so that I know what it costs before I buy.

Acceptance criteria:

- Given a variegated cultivar, when I open its prices, then I see the size classes `tissue culture`, `baby`, `juvenile` and `adult`, and under each the listings: shop, price in EUR incl. VAT, retrieval date and link (FR-EQU-09).
- Given a listing is from a marketplace (eBay, Kleinanzeigen), then it is labelled "Marktplatz von Privatpersonen".
- Given a listing states no clear size class, then it shows the class "unbekannt" and is not assigned to a class (P-08).
- Given a shop does not ship to Germany or the EU, then its listings are not stored.
- Given no price research exists yet, when a keeper without an own AI key opens the entry, then it shows "keine Preise recherchiert" and how to enable research (P-09).
- Given the last research is older than 30 days (starting value, assumption), when a keeper with an own AI key opens the entry, then new prices are researched. The old prices stay visible with their date until they are replaced.
- Given research, then it runs only when a keeper opens the entry. No scheduled job researches prices.
- Given prices of several shops, then they are never averaged and never shown as "the price" (FR-VAR-03).
- Given a shop link, then it carries no affiliate parameter (FR-VAR-07).

### US-VAR-07 · Log a variegation event on my plant · ⬜ new

Issue #1347. As a **plant keeper** I want to log variegation events with a photo, so that I see how the variegation of my plant develops.

Acceptance criteria:

- Given a specimen of a variegated cultivar, when I log an event of type reverted green leaf, all-white leaf, half-moon leaf or cut back to a node, with a date and an optional leaf note and photo, then it appears in its variegation history with date and type, next to the growth course (US-WAC-05).
- Given the event date, then it is a local date and not in the future (NFR-08).
- Given a photo, then the photo rules of WAC apply: location data is removed on the server (R-05).
- Given a specimen that is not a variegated cultivar, when I open it, then no variegation logging is offered.
- Given I logged an event by mistake, then I can correct or remove it myself with an explicit confirmation.
- Given a friend views my specimen, then the events are visible only where the sharing setting of the specimen allows it (US-SOZ-04). They follow the account export (US-ACC-04).

### US-VAR-08 · Warned early about reverting variegation · ⬜ new

Issue #1349. As a **plant keeper** I want a warning when my variegated plant shows a reverting trend or an all-white leaf, with a concrete next step, so that I can act before the variegation is lost.

Acceptance criteria:

- Given N green leaves in a row in the event history (N = 3, starting value, assumption), when I open "Heute", then the warning shows with the next step from the sources (for example "cut back above the last variegated node") and a link to that source (P-09).
- Given the next step has no source, then the warning names the risk and says that no sourced next step is known. It never invents one (P-08).
- Given an all-white leaf event, when I open the plant, then the warning names the risk and the next step.
- Given the warning is computed, then the code decides it from the logged events; the AI never writes the warning text on its own (P-01).
- Given an AI judgement of a new leaf photo (the share of the variegated area), then it is shown as "AI assessment" with the share and the date. No warning comes from the AI text alone (open question 4).
- Given the AI judgement is unavailable (operator switch `ai` off, no own AI key), then the warnings still work from the logged events (P-10).
- Given the keeper switch for variegation warnings is off, then no warning appears on "Heute" and no reminder is sent (US-ONB-09).
- Given calm mode is on (US-ACH-08), then the warning stays: it is information, not a celebration.

## Data model

### DM-VAR-01 Cultivar entry (extension of DM-BES-01)

`Species` (required, reference into the catalog), `Cultivar_Name` (without quotes, shown in quotes), `Status` (`proposed | reviewed`, as DM-BES-01), `Aliases` (trade names, each with origin and date: source, reviewer or keeper proposal), `Merged_Into?` (reference of a merged entry; the entry is kept for search). Shared catalog data, not tenant data; no keeper's name is stored on it.

### DM-VAR-02 Variegation fact (versioned, per cultivar)

`Cultivar`, `Kind` (`stability | origin | type | pattern`), `Value` (one or more allowed values, or `unknown`), `Source` (link, reference to the source snapshot of DM-BES-05 where one exists), `Retrieved_At` (local date), `Origin` (`research | correction | reviewer`), `Status` (`current | superseded`). A superseded fact is kept (FR-BES-12).

### DM-VAR-03 Shop price (dated, per cultivar)

`Cultivar`, `Size_Class` (`tissue culture | baby | juvenile | adult | unknown`), `Shop` (name), `Market` (`shop | marketplace`), `Ships_To_EU` (yes, required for storing), `Price_EUR` (incl. VAT), `Link`, `Retrieved_At` (local date). A price replaced by a new research stays with its date until replaced (US-VAR-06).

### DM-VAR-04 Variegation event (per specimen, private)

`Specimen`, `Type` (`reverted green leaf | all-white leaf | half-moon leaf | cut back to a node`), `Date` (local date), `Leaf_Note?` (free text, 500 characters, starting value), `Photo?` (WAC photo rules), `AI_Share?` (percent of the variegated area, labelled as AI assessment, with its date). Tenant table of the account (P-04, P-05).

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                         | Status          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-VAR-01 | Name matching, duplicate merge, alias folding and the species link are pure domain logic without I/O, with tests (P-02, P-06).                                                                                                                      | ⬜              |
| FR-VAR-02 | Every fact and every price carries its source link and retrieval date (local date, NFR-08), or it shows "unbekannt" (P-08, FR-BES-16).                                                                                                              | ⬜              |
| FR-VAR-03 | No averages, no ranking and no "the price" across shops, keepers or cultivars. A price is a dated example (FR-BES-17, P-08).                                                                                                                        | ⬜              |
| FR-VAR-04 | AI output is stored only with a source (facts, prices) or labelled "AI assessment" (photo share). No AI connection approves a fact, a merge or a correction (FR-BES-06, FR-BES-19, FR-KI-09).                                                       | ⬜              |
| FR-VAR-05 | Research runs only on a keeper's request, only for keepers with their own AI key, and never on a schedule. The mechanism is decided with E-19 (open).                                                                                               | ⬜              |
| FR-VAR-06 | Events, photos and notes are the account's data (P-04, P-05). Friends see them only through the sharing setting (US-SOZ-04). Catalog facts and prices carry no keeper's name (FR-BES-21).                                                           | ⬜              |
| FR-VAR-07 | Out of scope: community purchase averages, rating or ranking of cultivars or shops, selling, affiliate parameters in shop links (E-07, FR-EQU-03 to FR-EQU-05), a genus or family fallback for facts (P-08), a forecast of the variegation by code. | ⬜ (deliberate) |
| FR-VAR-08 | Accessibility (NFR-13, US-QS-14): event logging with buttons and photo, warnings as text, 360 px width, operation with one hand (P-11).                                                                                                             | ⬜              |
| FR-VAR-09 | Switches: the operator switch `ai` (US-DEV-06) and the keeper switch (US-ONB-09, P-12) hide research, photo judgement, warnings and logging. They never hide the cultivar entry or its Pokédex card, which are core data.                           | ⬜              |

## Dependencies and build order

Release R2, as placed in `16-releases-and-decisions.md` on 2026-11-05. Priority P2 by the rule of thumb in `CLAUDE.md` for R2 and R3; the owner may overrule per ticket.

| Order | Story     | Release | Depends on                               | Why here                                                    |
| ----- | --------- | ------- | ---------------------------------------- | ----------------------------------------------------------- |
| 1     | US-VAR-01 | R2      | US-BES-10, US-POK-06                     | Entries and names come first; everything else hangs on them |
| 2     | US-VAR-02 | R2      | US-VAR-01, US-POK-01                     | The Pokédex shows the cultivar once the entry exists        |
| 3     | US-VAR-03 | R2      | US-VAR-01, US-BES-10                     | Merges before the catalog grows                             |
| 4     | US-VAR-07 | R2      | US-VAR-01, US-WAC-05                     | Logging needs no research and no decision                   |
| 5     | US-VAR-04 | R2      | US-VAR-01; E-19 for research             | Sourced facts can be shown before research exists           |
| 6     | US-VAR-05 | R2      | US-VAR-04, US-BES-14, US-BES-16          | Corrections use the existing review queue                   |
| 7     | US-VAR-06 | R2      | US-VAR-01; E-19 for research             | Prices on demand; research waits for E-19                   |
| 8     | US-VAR-08 | R2      | US-VAR-07, US-WAC-06; E-19 for the photo | The warning uses the event history and comes last           |

## Assumptions (to be confirmed by the owner)

- **Scope:** variegated cultivars only. Issue #1344 says "each cultivar"; the title and the release note in `16` say variegated cultivars. Other cultivars stay a chip (US-POK-06).
- **Stability** is a set of risks: a line can revert to green and go all white at once.
- **Pattern list** (starting list, the reviewer checks it against sources): sectoral, marginal, marbled, speckled.
- **Size classes** are fixed. Juvenile and adult are taken from the listing's own words; no border in leaves or in centimetres is invented by us.
- **Starting values:** 3 green leaves in a row (US-VAR-08); a price research older than 30 days is repeated on request (US-VAR-06); the leaf note is 500 characters.
- **Research facts** are stored at once, labelled "from research", and listed for the reviewer.
- **Events** can be corrected or removed by the keeper, with confirmation.
- **Core or switchable (P-12):** the cultivar entry and its Pokédex card are core data. The facts, prices, events and warnings are switchable.

## Open questions

1. **Research mechanism:** does research run in the keeper's own AI client (US-KI-05, path A or B) or in a built-in chat with the keeper's own key (E-19)? Issues #1345 and #1346 name E-19 as the condition.
2. **Scope:** "each cultivar" (#1344) or variegated cultivars only (title, #1316)?
3. **Visibility of research facts:** are they visible before a reviewer approves them, as assumed here, or only after approval?
4. **AI share and warnings:** may the AI share of a leaf photo support a warning when the event history is empty or has no green leaves?
5. **Entry path:** how does a new cultivar enter the catalog? Assumed: a keeper proposal (US-BES-01) that a reviewer approves (US-BES-10). Issue #1344 leaves this open.

## Risks

| Risk                                                 | Countermeasure                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Research states a wrong fact as sourced.             | Every fact has a source and date; without one it is "unbekannt"; corrections go through the review (US-VAR-05).              |
| Prices are read as "the price" and compared.         | Dated examples only, no averages, marketplace labelled, unknown class shown as "unbekannt" (FR-VAR-03).                      |
| A reversion warning alarms without reason.           | Count rule from the keeper's own events, sourced next step or "no sourced step known", calm mode keeps it as information.    |
| Duplicates split the collection.                     | Alias search, duplicate hint at proposal, merge that keeps every reference and name (US-VAR-01, US-VAR-03).                  |
| Research costs or privacy problems with keeper keys. | Only with the keeper's own key, on request, never on a schedule; no key is stored by the app until E-19 decides (FR-VAR-05). |
