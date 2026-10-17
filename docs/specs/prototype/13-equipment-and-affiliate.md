# 13 – Epic EQU: Equipment and Recommendations (planned)

**Status of the whole epic: ⬜ not implemented.** In the vault there are no equipment notes and no fields for them. Lamps exist today only as four **level strings** (DM-05), not as concrete devices. The only artifact nearby: the savings goal `02-Areas/Finanzen/Sparziele/Pflanzen-Sensorik-Set.md` (see `08-Monitoring-and-Sensors.md`).

Goal: the keeper records their plant equipment (lamps, timers, sensors, substrate, fertilizer, pots, …) as structured data. This has two effects:

1. **Benefit for the keeper:** the light levels are bound to real devices, gaps and maintenance become visible, purchases land in the stock without manual work.
2. **Basis for recommendations:** because the system knows what is there and what is missing, it can later show **matching, labeled affiliate recommendations** (stage 2 in `12-Business-Case.md`). The recommendation is a by-product of a real need, not the purpose of the tracking.

Sources: none in the as-is state. Derived from the assignment of 2026-10-02 and the existing epics LIC (levels), BEH (`Mittel`), WUN (purchase candidates), MON (sensors), SOZ (sharing) as well as `12-Business-Case.md` (revenue sources).

## Problem

1. **Lamps are abstract:** DM-05 knows four strings, but not *which* lamp that is, how old it is or whether it really delivers the promised lux (FR-LIC-06 is open).
2. **No stock of accessories:** substrate, fertilizer, agents from `Behandlungen.Mittel`, timer, sensors are recorded nowhere. "What is missing, what has to be rebought?" is answered only by memory.
3. **Need and acquisition are not connected:** the wishlist knows plant candidates with `Ziel_Lampe`, but not whether there is capacity (lamp, area) for this level at all (cf. B-09).
4. **No honest recommendation basis:** without stock data, product links would be arbitrary advertising. With it, recommendations can rest on real need.

## Terms

| Term | Meaning |
|---|---|
| Equipment | Everything material for plant care **except** the plants themselves. One record per device or per consumable type. |
| Device | Equipment with lifetime and operation (lamp, timer, sensor, fan, pump). |
| Consumable | Equipment that is used up (substrate, fertilizer, plant agents). Has supply instead of operating data. |
| Lamp device | Device of type `Lampe` that is assigned to exactly one lamp level (DM-05). |
| Product id | Manufacturer-neutral identification of a product (manufacturer, model, optional GTIN/EAN). Belongs in the record, the **affiliate URL does not**. |
| Recommendation | Product suggestion shown by the system with reasoning from own data. |
| Affiliate link | Labeled product link that creates a commission on purchase. Created only at display time, never stored in the vault. |

## User stories

### US-EQU-01 · Record equipment · ⬜
As a **plant keeper** I want to create a device or consumable without writing YAML.

Acceptance criteria:
- A dashboard form or Claude input ("Ich habe eine neue Lampe …") creates an equipment note (DM-E1) and writes via `processFrontMatter` (NFR-02).
- Required: `Typ`, `Bezeichnung`. Everything else (manufacturer, model, price, purchase date, product id) is optional; missing details appear as "unknown", never guessed (NFR-05).
- The same name is rejected if it is already taken (naming rule analogous to DM-03: for multiples ` – <distinction>`).
- From a photo or product link Claude may **suggest** fields; the keeper confirms before writing.

### US-EQU-02 · Bind lamps to levels · ⬜
As a **plant keeper** I want to assign my concrete lamps to the four levels (DM-05), so that the levels mean something real.

Acceptance criteria:
- A lamp device carries `Lampe_Stufe` with **exactly one** of the four strings from DM-05 (character-identical, B-07).
- `Lampen-Zuordnung.md` shows per level the assigned devices and their state (`aktiv`, `defekt`, `ausgemustert`).
- ⚠️ Warning if a level 2–4 has specimens but **no active lamp device** (NFR-06, no silent disappearing).
- ⚠️ Warning if an active lamp device is assigned to a level to which no specimen is assigned (hint of unused capacity, no error).
- The distribution of the specimens (US-LIC-02) stays unchanged; equipment only extends it by the device list.

### US-EQU-03 · Record the measured light intensity per lamp · ⬜
As a **plant keeper** I want to note the really measured light intensity per lamp, so that the levels rest on measured values instead of manufacturer values.

Acceptance criteria:
- The lamp device keeps a measurement log `Messungen` with `{Datum, Lux, Abstand_cm, Methode}`; one entry is required for "measured".
- The display separates **manufacturer value** (`Lux_Angabe`) and **measured** (last measurement with date). If the measurement is missing, it says "nicht gemessen".
- If the last measurement deviates from the level ceiling by more than a configurable share (default open, **to be set by the keeper**), ⚠️ "Stufe prüfen" appears.
- Fulfills and replaces FR-LIC-06 (one-time check with a phone app), where recorded there.

### US-EQU-04 · Keep operation and maintenance in view · ⬜
As a **plant keeper** I want to know when a device needs attention without having to think of it.

Acceptance criteria:
- A device optionally has `In_Betrieb_Seit` and `Pruefintervall_Tage` (set by the keeper).
- If `Pruefintervall_Tage` is set and the last check (for lamps: last measurement, US-EQU-03) is older, ⚠️ "Prüfung fällig: <device>" appears in the dashboard and, if available, as a bot message (US-MON-01).
- The system names **no** lifetime or wear values that are not in the record. Manufacturer values may only be stored as `Lebensdauer_Angabe` with `Quelle`.
- Without a set interval there is no due date (invent nothing).

### US-EQU-05 · Consumables and supply · ⬜
As a **plant keeper** I want to keep substrate, fertilizer and plant agents, so that I know what is there and what has to be rebought.

Acceptance criteria:
- A consumable has `Typ` (`Substrat` | `Duenger` | `Pflanzenmittel` | `Sonstiges`) and `Vorrat` (`vorhanden` | `knapp` | `leer`).
- Button "Vorrat ändern" sets the state via `processFrontMatter`. `knapp`/`leer` creates an entry in "🛒 Nachkaufen" (US-EQU-07).
- A plant agent can be linked to `Behandlungen.Mittel` (DM-02); without a link the free text in `Mittel` stays unchanged (no silent reinterpretation).
- `Substrat_Kurz` of the species (DM-01) stays free text; an optional link to a consumable is allowed but not mandatory.

### US-EQU-06 · Assign sensors and accessories · ⬜
As a **plant keeper** I want to record and assign sensors and controls (timer, soil moisture, temperature).

Acceptance criteria:
- Sensors are devices (`Typ: Sensor`) with an optional reference to a specimen or an area (`Standort`, free text as in `Standort_Aktuell`).
- The savings goal "Pflanzen-Sensorik-Set" can turn into equipment on purchase (US-EQU-08).
- Raw sensor values do **not** go into the vault (NFR-MON-01); equipment holds only master data of the sensor.

### US-EQU-07 · What is missing? Derive need from own data · ⬜
As a **plant keeper** I want a list of what is missing or will soon be missing, derived from my stock.

Acceptance criteria:
- Block "🛒 Fehlt / Nachkaufen" shows derived items, each with reason and source:
  1. Consumable `knapp`/`leer` (US-EQU-05).
  2. Level without an active lamp device (US-EQU-02).
  3. Wishlist candidate with `Ziel_Lampe` for which no active lamp device exists.
  4. Device `defekt` or `ausgemustert` without replacement.
- Every item names what to do (NFR-07) and contains **no** invented urgency.
- The list is purely computed (NFR-04); there is no second copy.

### US-EQU-08 · Take over a purchase · ⬜
As a **plant keeper** I want a purchased product to land in the stock without retyping.

Acceptance criteria:
- The wishlist (WUN) additionally knows candidates of type equipment; "Gekauft ✔" opens the creation form (US-EQU-01) with prefilled fields (name, product id, type).
- Price and purchase date go, if set, to the finances (`finanz-core.js`); if they are missing, nothing is invented.
- Plant candidates and equipment candidates stay counted separately; the buffer check (FR-WUN) counts only plants.
- Closes for equipment the gap that B-09 describes for plants (chain purchase → stock).

### US-EQU-09 · See costs · ⬜
As a **plant keeper** I want to know what my equipment cost.

Acceptance criteria:
- Sum of the acquisition costs per type and in total, **only** across devices with a set `Preis_EUR`.
- The display states for how many devices the price is missing ("Summe über 7 von 11 Geräten") instead of estimating.
- No estimate of electricity costs or replacement values without input by the keeper.

### US-EQU-10 · See matching recommendations · ⬜
As a **plant keeper** I want to see a product suggestion on real need, so that I do not have to search myself.

Acceptance criteria:
- Recommendations appear **only in the context of a derived need** (US-EQU-07), not as an advertising block of their own and not on plant or Pokédex cards.
- Every recommendation names: product (product id), **reasoning from own data** ("Lampe 3 hat kein aktives Gerät, 4 Exemplare brauchen sie"), source of the product data and date.
- Every affiliate link is **visibly labeled** (e.g. "Werbung · Affiliate-Link") directly at the link, not only in the imprint.
- Prices are shown only if they come from a source with a retrieval date ("Stand DD.MM.YYYY"); otherwise no price.
- There is always also a non-commissioned path: product name and manufacturer are displayed, the keeper can buy elsewhere.
- The **order** of the suggestions follows the need (fit to level, lux, area), **not** the commission (FR-EQU-06).

### US-EQU-11 · Control and understand recommendations · ⬜
As a **plant keeper** I want to be able to switch off and trace recommendations.

Acceptance criteria:
- The global option "Keine Empfehlungen" hides all affiliate links. Equipment tracking and all derived lists work unchanged (FR-EQU-01).
- Per recommendation "Warum sehe ich das?" (the triggering data) and "Nicht mehr zeigen" (per need or per product).
- The page "Was wird gemessen?" names which data is used for recommendations and click counting (FR-EQU-08).
- The keeper can delete their recommendation data (hidden items, consents) without losing equipment.

### US-EQU-12 · Share equipment with friends (optional) · ⬜
As a **plant keeper** I want to show friends which lamp or accessory I use, and see theirs.

Acceptance criteria:
- New field `Teilen` (like DM-S1): `privat` (default) or `freunde`.
- At most type, name/model, lamp level and a free-text experience note are shared. **Never** shared: price, place of purchase, serial number, location and purchase date.
- A shared device does not appear in the feed "Neu bei Freunden" (US-SOZ-05), only in a device list of the friend (US-SOZ-07).
- Sharing triggers **no** recommendation for others; a friend never becomes the keeper's sales channel (FR-EQU-07).

## Data model

### DM-E1 Equipment note (`02-Areas/Pflanzen/Equipment/<Bezeichnung>.md`)

| Field | Required | Meaning |
|---|---|---|
| `Typ` | yes | `Lampe` \| `Zeitschaltuhr` \| `Sensor` \| `Lueftung` \| `Pumpe` \| `Topf` \| `Substrat` \| `Duenger` \| `Pflanzenmittel` \| `Sonstiges` |
| `Bezeichnung` | yes | Display name, unique |
| `Status` | yes | `aktiv` \| `defekt` \| `ausgemustert` (not used for consumables) |
| `Hersteller`, `Modell` | no | Free text |
| `Produktkennung` | no | GTIN/EAN or manufacturer + model; basis for recommendations, **no URL** |
| `Preis_EUR` | no | Number, purchase price |
| `Gekauft_Am` | no | `YYYY-MM-DD` |
| `In_Betrieb_Seit` | no | `YYYY-MM-DD` (devices) |
| `Pruefintervall_Tage` | no | Number (devices) |
| `Standort` | no | Free text (cabinet, shelf) |
| `Teilen` | no | `privat` (default) or `freunde` (US-EQU-12) |
| `Notiz` | no | Free text |

The note body carries free text (operation, experience); logic stands only in the frontmatter (NFR-01).

### DM-E2 Lamp device (extension of DM-E1, `Typ: Lampe`)

| Field | Required | Meaning |
|---|---|---|
| `Lampe_Stufe` | yes | one of the four strings from DM-05, character-identical |
| `Leistung_W` | no | Number, manufacturer value |
| `Lux_Angabe` | no | Number, manufacturer value |
| `Lebensdauer_Angabe` | no | `{Wert, Quelle}`, only with a source |
| `Messungen` | no | Array `{Datum, Lux, Abstand_cm, Methode}` |

### DM-E3 Consumable (extension of DM-E1)

| Field | Required | Meaning |
|---|---|---|
| `Vorrat` | yes | `vorhanden` \| `knapp` \| `leer` |
| `Mittel_Verknuepfung` | no | Text that occurs in `Behandlungen.Mittel` (DM-02) |

### DM-E4 Recommendation configuration (not in the plants' vault frontmatter)

`Empfehlungen_Aktiv` (default `true`), `Ausgeblendet` (list of need/product ids), `Einwilligung_Klickmessung` (date or empty). Lives in a configuration file of its own or in the hub, not in plant notes. The **partner configuration** (partner programs, partner IDs) belongs to the operator of the system and never in user notes (FR-EQU-04).

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-EQU-01 | **Equipment tracking is independent of recommendations.** All stories except US-EQU-10/11 work completely without affiliate integration, network access and hub. | ⬜ |
| FR-EQU-02 | Equipment data lives in the vault (source of truth, FR-SOZ-02). The hub receives it only if the keeper shares it (US-EQU-12). | ⬜ |
| FR-EQU-03 | **Product id instead of URL:** what is stored is *what* the product is (manufacturer, model, GTIN). Affiliate URLs arise only at display time from product id + partner configuration. If the partner program changes, no record changes. | ⬜ |
| FR-EQU-04 | **The partner configuration belongs to the operator:** partner IDs are not stored in user notes and not exported unasked. Link generation lives as a pure function in `core` (`empfehlung-core.js`, with `node --test`, FR-SOZ-04 pattern). How the partner configuration is distributed (shipped with the core or from the hub) is open. | ⬜ |
| FR-EQU-05 | **Labeling duty:** every affiliate link is labeled as advertising at the link. The obligations from the partner program and applicable law (DE/EU, among others advertising labeling and privacy) are to be checked **before** stage 2; this document replaces no legal review. | ⬜ |
| FR-EQU-06 | **Need before commission:** selection and order of the recommendations follow the fit to the need, never the commission level. Only products that fit the derived need are recommended (principle from `12-Business-Case.md`: "only for things the app recommends anyway"). Test: a changed commission table does not change the order. | ⬜ |
| FR-EQU-07 | **No recommendations in sensitive contexts:** no affiliate links on plant agents against pests/diseases (approval and health questions, FR-SOZ-09), none in friend views, in the Pokédex or in swap offers. | ⬜ |
| FR-EQU-08 | **Data minimization:** the vault stock (plants, locations, logs, photos) is never transmitted to partners. Click measurement only aggregated and only with consent (`Einwilligung_Klickmessung`); without consent nothing is counted. | ⬜ |
| FR-EQU-09 | **No invented product data:** product names, prices, availability and properties come from a citable source with retrieval date. Claude may **research and suggest** products, but writes them into the data only after confirmation by the keeper and with a source (NFR-05, pattern of the wishlist research, WUN). | ⬜ |
| FR-EQU-10 | Operation must **lock no function behind recommendations**: no purchase obligation, no dark pattern, no restriction of tracking under "Keine Empfehlungen". Core functions stay free (`12-Business-Case.md`). | ⬜ |
| FR-EQU-11 | Lamp strings (DM-05) are **not** hard-coded once more in `Lampe_Stufe`, but read from the central definition (goal of B-07). Until then `Lampe_Stufe` counts among the places from B-07. | ⬜ |
| FR-EQU-12 | All changes run via `processFrontMatter`; derived lists (US-EQU-07, -09) are computed live and not stored (NFR-02, NFR-04). | ⬜ |

## Delimitation

| Does not belong here | Instead |
|---|---|
| Lamp level rules, position recommendation | LIC (`02-Light-and-Lamps.md`) |
| Sensor values, watering log, bot | MON (`08-Monitoring-and-Sensors.md`) |
| Plant purchase candidates and buffer | WUN (`06-Wishlist.md`) |
| Money flows, budget, savings goals | Finances in the vault (`finanz-core.js`) |
| Selling plants, marketplace | deliberately excluded (FR-SOZ-11), stage 3 decision in the business case |

## Open questions

1. **Partner programs:** which come into question (retailers for lamps and substrate, garden retail), which conditions apply, which labeling and privacy rules follow from them?
2. **Distribution of the partner configuration:** shipped with the core (simple, but static) or obtained from the hub (flexible, needs a hub, E-SOZ-01)?
3. **Product data source:** manufacturer data and shop APIs, manual curation or Claude research with confirmation? Determines effort and reliability of the prices.
4. **Threshold for "Stufe prüfen"** (US-EQU-03): how far may the measurement deviate from the level ceiling before a warning comes? To be set by the keeper.
5. **Timing:** data model and US-EQU-01 to -09 already in stage 1 (they directly benefit the three users), recommendations (US-EQU-10/11) only in stage 2, when there are users outside the circle of friends.
6. **Small-business/tax questions** of the income are not part of this spec, but belong in the preparation of stage 2.
