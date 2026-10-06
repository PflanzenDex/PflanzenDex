# 11 – Epic EQU: Equipment and Recommendations

Goal: the keeper records their plant equipment (lamps, timers, sensors, substrate, fertilizer, pots, …). This ties the light zones to real devices, makes gaps and maintenance visible and is the **honest basis for labeled affiliate recommendations** (stage 2 in `13-Business-Case.md`). The recommendation is a by-product of a real need, not the purpose of the tracking.

Replacement: replaces `../PLANT-SYSTEM-SPECS/13-Equipment-and-Affiliate.md`. Dropped: equipment notes in the vault, `processFrontMatter`, "equipment in the vault is the truth" (FR-EQU-02). In terms of content the stories and the rules for recommendations apply unchanged.

## Terms

| Term           | Meaning                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Equipment      | Everything material for care except the plants. One record per device or per consumable type.                     |
| Device         | Equipment with lifetime and operation (lamp, timer, sensor, fan, pump).                                           |
| Consumable     | Is used up (substrate, fertilizer, plant agents); has supply instead of operating data.                           |
| Lamp device    | Device of type lamp, assigned to a light zone (US-LIC-05).                                                        |
| Product id     | Manufacturer-neutral (manufacturer, model, optional GTIN/EAN). Belongs in the record, the affiliate URL does not. |
| Recommendation | Product suggestion shown by the system with reasoning from own data.                                              |
| Affiliate link | Labeled product link with commission; arises only at display time.                                                |

## User stories

### US-EQU-01 · Record equipment · ⬜ new

Acceptance criteria:

- A form or AI input ("I have a new lamp …") creates a record (DM-EQU-01).
- Required: `Type`, `Name`. Everything else (manufacturer, model, price, purchase date, product id) optional; what is missing appears as "unknown", never guessed (P-08).
- The name is unique; for multiples ` – <distinction>`.
- From a photo or product link the AI may **suggest** fields; the keeper confirms before saving.

### US-EQU-02 · Bind lamps to light zones · ⬜ new

Acceptance criteria:

- A lamp device belongs to exactly one light zone (selection, no text).
- The zone view shows per zone the assigned devices and their state (`active`, `defective`, `retired`).
- Warning if a zone 2–4 has specimens but **no active lamp device** (P-10).
- Hint (no error) if an active lamp device serves no occupied zone (unused capacity).
- The distribution of the specimens (US-LIC-02) stays unchanged; equipment extends it with the device list.

### US-EQU-03 · Record the measured light intensity per lamp · ⬜ new

Acceptance criteria:

- Measurement log per lamp device: `{Date, Lux, Distance_cm, Method}`; one entry makes it "measured".
- The display separates **manufacturer value** and **measured** (last measurement with date); without a measurement "not measured".
- If the last measurement deviates from the zone ceiling by more than a configurable share (default open, **to be set by the keeper**), "Check zone" appears.
- Fulfills FR-LIC-06.

### US-EQU-04 · Keep operation and maintenance in view · ⬜ new

Acceptance criteria:

- Optional `In_Operation_Since` and `Check_Interval_Days` (set by the keeper).
- If an interval is set and the last check (for lamps: last measurement) is older, "Check due: <device>" appears in "Today" and as a reminder (US-MON-01).
- No lifetime or wear values without an entry; manufacturer values only as `Lifetime_Statement` with `Source`. Without an interval no due date.

### US-EQU-05 · Consumables and supply · ⬜ new

Acceptance criteria:

- A consumable has `Type` (`Substrate | Fertilizer | Plant agent | Other`) and `Supply` (`available | low | empty`); change by tap.
- `low`/`empty` creates an entry in "Rebuy" (US-EQU-07).
- A plant agent can be linked to `Treatment.Agent`; without a link the free text stays unchanged.
- The species' `Substrate` stays free text; optional link to a consumable.

### US-EQU-06 · Assign sensors and accessories · ⬜ new

Acceptance criteria:

- Sensors are devices (`Type: Sensor`) with optional assignment to a specimen or location.
- A savings goal "sensor set" can turn into equipment on purchase (US-EQU-08).
- Raw values are not part of equipment (FR-MON-07).

### US-EQU-07 · What is missing? Derive need from own data · ⬜ new

Acceptance criteria:

- Block "Missing / Rebuy": derived items, each with reason and source:
  1. Consumable `low`/`empty`.
  2. Zone without an active lamp device.
  3. Wish with a target zone without an active lamp device.
  4. Device `defective`/`retired` without replacement.
- Every item says what to do (P-09), without invented urgency. Purely computed (NFR-04).

### US-EQU-08 · Take over a purchase · ⬜ new

Acceptance criteria:

- The wishlist knows wishes of type equipment; "Bought" opens US-EQU-01 with prefilled fields (name, product id, type).
- Price and purchase date go, if set, into the cost view (US-EQU-09); if they are missing, nothing is invented.
- Plant and equipment wishes are counted separately; the buffer check (US-WUN-02) counts only plants.

### US-EQU-09 · See costs · ⬜ new

Acceptance criteria:

- Sum of the acquisition costs per type and in total, **only** across devices with a set price.
- The display states for how many devices the price is missing ("sum over 7 of 11 devices").
- No estimate of electricity or replacement costs without input.

### US-EQU-10 · See matching recommendations · ⬜ new

Acceptance criteria:

- Recommendations appear **only in the context of a derived need** (US-EQU-07), not as an advertising block of their own, not on plant, Pokédex or swap cards.
- Every recommendation names the product (product id), **reasoning from own data** ("Lamp 3 has no active device, 4 specimens need it"), source of the product data and date.
- Every affiliate link is labeled as advertising **directly at the link** ("Advertisement · affiliate link").
- Prices only with source and retrieval date ("As of DD.MM.YYYY"); otherwise no price.
- There is always a non-commissioned path: product name and manufacturer are displayed, the keeper can buy elsewhere.
- The **order** follows the fit to the need (zone, lux, area), **not** the commission (FR-EQU-06).

### US-EQU-11 · Control and understand recommendations · ⬜ new

Acceptance criteria:

- The global option "No recommendations" hides all affiliate links; equipment tracking and derived lists stay unchanged (FR-EQU-01).
- Per recommendation "Why do I see this?" and "Do not show again" (per need or product).
- The page "What is measured?" names data for recommendations and click counting (FR-EQU-08).
- The keeper can delete their recommendation data (hidden items, consents) without losing equipment.

### US-EQU-12 · Share equipment with friends (optional) · ⬜ new

Acceptance criteria:

- Sharing setting `private` (default) or `friends` per device.
- At most type, name/model, light zone level and a free-text experience note are shared. **Never** price, place of purchase, serial number, location, purchase date.
- A shared device does not appear in the feed (US-SOZ-05), only in the friend's device list (US-SOZ-07).
- Sharing triggers **no** recommendation for others; a friend never becomes the keeper's sales channel (FR-EQU-07).

## Data model

### DM-EQU-01 Equipment

| Field                                                                 | Required | Meaning                                                                                                    |
| --------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `Type`                                                                | yes      | `Lamp \| Timer \| Sensor \| Ventilation \| Pump \| Pot \| Substrate \| Fertilizer \| Plant agent \| Other` |
| `Name`                                                                | yes      | Display name, unique                                                                                       |
| `Status`                                                              | yes      | `active \| defective \| retired` (not used for consumables)                                                |
| `Manufacturer`, `Model`                                               | no       | Free text                                                                                                  |
| `Product_Id`                                                          | no       | GTIN/EAN or manufacturer + model; **no URL**                                                               |
| `Price_EUR`, `Bought_At`, `In_Operation_Since`, `Check_Interval_Days` | no       |                                                                                                            |
| `Location`                                                            | no       | Reference to a location (US-LIC-05)                                                                        |
| `Share`                                                               | no       | `private` (default) or `friends`                                                                           |
| `Note`                                                                | no       | Free text                                                                                                  |

### DM-EQU-02 Lamp device (extension)

`Light_Zone` (required), `Power_W`, `Lux_Statement`, `Lifetime_Statement` (`{Value, Source}`), `Measurements` (`{Date, Lux, Distance_cm, Method}`).

### DM-EQU-03 Consumable (extension)

`Supply` (required), `Agent_Link` (text that occurs in `Treatment.Agent`).

### DM-EQU-04 Recommendation configuration

Per account: `Recommendations_Active` (default `true`), `Hidden`, `Click_Measurement_Consent` (date or empty). The **partner configuration** (programs, partner IDs) belongs to the operator and never to user data (FR-EQU-04).

## Requirements

| ID        | Requirement                                                                                                                                                                                                                          | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| FR-EQU-01 | Equipment tracking is independent of recommendations: all stories except US-EQU-10/11 work without partner integration.                                                                                                              | ⬜     |
| FR-EQU-02 | Equipment data belongs to the account. Friends see it only after sharing (US-EQU-12).                                                                                                                                                | ⬜     |
| FR-EQU-03 | **Product id instead of URL:** what is stored is _what_ the product is. Affiliate URLs arise only at display time from product id + partner configuration. A program change changes no record.                                       | ⬜     |
| FR-EQU-04 | Partner IDs live with the operator, never in user data, never in the export. Link generation is a pure function with tests.                                                                                                          | ⬜     |
| FR-EQU-05 | **Labeling duty:** every affiliate link is labeled as advertising. Obligations from the partner program and law (DE/EU: advertising labeling, privacy) are to be checked **before** stage 2; this document replaces no legal review. | ⬜     |
| FR-EQU-06 | **Need before commission:** selection and order follow the fit, never the commission level. Test: a changed commission table does not change the order.                                                                              | ⬜     |
| FR-EQU-07 | **No recommendations in sensitive contexts:** no links on plant agents against pests/diseases (approval, health), none in friend views, in the Pokédex or in swap offers.                                                            | ⬜     |
| FR-EQU-08 | **Data minimization:** collection data (plants, locations, measurements, photos) never goes to partners. Click measurement only aggregated and only with consent.                                                                    | ⬜     |
| FR-EQU-09 | **No invented product data:** names, prices, availability come from a citable source with retrieval date. The AI may **research and suggest** products, but writes them only after confirmation and with a source (US-KI-05).        | ⬜     |
| FR-EQU-10 | **Lock no function behind recommendations:** no purchase obligation, no dark pattern, no restriction of tracking under "No recommendations".                                                                                         | ⬜     |
