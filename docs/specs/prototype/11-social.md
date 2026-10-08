# 11 – Epic SOZ: Social (Friends, Feed, Swapping) (planned)

**Status of the whole epic: ⬜ not implemented.** There is no code, no fields and no exchange layer. Today the system is a single-person vault without accounts and without a server.

**Technology deliberately open:** this epic describes only the domain behavior. *How* friends exchange data (e.g. Telegram bot as hub, own server, file sync) is not decided (see decision E-SOZ-01 in `10-Gaps-and-Backlog.md`). All requirements are worded so that they apply independently of that. The exchange layer is called **hub** here.

Goal: collecting and caring become shared. The plant keeper sees what friends have newly collected and can swap plants and cuttings with them without their vault becoming public.

Sources: none in the as-is state. Derived from the assignment of 2026-10-02 and the existing epics BES (specimen, cutting, archive), POK (catch, "newly caught"), BEH (treatments), MON (notification).

## Problem

1. **Isolated:** the Pokédex rewards collecting, but only against oneself. What friends own is invisible.
2. **Cuttings without a path:** cuttings arise (US-BES-04) and are given away or swapped, but handing over is only manual archiving (US-BES-07). There is no offer, no request and no provenance.
3. **Privacy:** the vault contains locations, photos and measurement data. Without explicit sharing nothing of it may go outside.

## Terms

| Term | Meaning |
|---|---|
| Friend | Another plant keeper with whom a **confirmed** friendship exists (mutual). |
| Hub | Exchange layer between the vaults. Technology open (E-SOZ-01). |
| Sharing setting (Freigabe) | Visibility set per specimen: `privat` (default) or `freunde`. |
| Offer | Specimen or cutting that the keeper offers to friends for swapping or giving away. |
| Swap | Process request → acceptance → handover. One-sided giving away ("gifting") is also a swap without a counterpart. |
| Provenance (Herkunft) | Note in the recipient's specimen: from whom, when it came. |

## User stories

### US-SOZ-01 · Request a friendship · ⬜
As a **plant keeper** I want to add another keeper as a friend, so that we can see collections and swap.

Acceptance criteria:
- Given my hub identity, when I choose "Freund einladen", then I receive an invitation code or link that I pass on outside the system.
- Given an invitation code, when I redeem it, then a request with my display name arrives at the inviter. No friendship yet.
- An invitation code is single-use and expires after 7 days; expired or already used codes are rejected with a clear message.
- I cannot invite myself; a duplicate request to the same person creates no second one.

### US-SOZ-02 · Answer a friendship request · ⬜
As a **plant keeper** I want to accept or decline requests.

Acceptance criteria:
- Open requests appear in the dashboard and as a notification (see US-SOZ-12).
- Accepting makes the friendship effective on both sides. Declining discards the request silently, the other side learns only "not accepted", not whether declined or ignored.
- Before acceptance the recipient sees only the display name, no collection.

### US-SOZ-03 · Manage friends and end a friendship · ⬜
As a **plant keeper** I want to see my friends and be able to end friendships.

Acceptance criteria:
- Block "👥 Freunde" lists friends with display name, start of the friendship and number of their caught species (shared ones only).
- Ending immediately withdraws from both sides the view of collection, feed and offers. Own data and already completed swaps (incl. `Herkunft`) remain untouched.
- Open swap requests with this person are canceled when ending (status `abgebrochen`).
- Ending does not actively notify the other side; it sees only that the person is no longer in the list.

### US-SOZ-04 · Decide what friends see · ⬜
As a **plant keeper** I want to set per specimen whether friends see it, so that nothing is shared without my knowledge.

Acceptance criteria:
- New field in the specimen `Teilen` (DM-S1): `privat` (default, also if the field is missing) or `freunde`.
- A specimen with `privat` appears neither in the collection nor in the feed nor in friends' counts.
- At most the following are shared: species (Latin and German name), specimen name, `Gefangen_Am`, status (cutting yes/no), the latest photo, **provided** the keeper releases photos (`Teilen_Fotos: true`). **Never** shared: `Standort_Aktuell`, growth log notes, treatments, markers, financial data.
- After `foto_import.py` photos have no EXIF/GPS data (FR-WAC-06); the hub transmits only these cleaned files.
- A global option "Alles privat" suspends all sharing settings without changing the fields.
- Withdrawing a sharing setting takes effect immediately for future retrievals; data already delivered to friends cannot be retrieved by the system (note in the dialog).

### US-SOZ-05 · See which new plants friends have collected · ⬜
As a **plant keeper** I want a feed with my friends' new acquisitions, so that I learn what they have new without asking.

Acceptance criteria:
- Block "🌱 Neu bei Freunden" shows events, newest first, per event: friend, species (Latin + German), date, photo if applicable, type chip.
- Event types: **New species caught** (the species was not yet in the friend's Pokédex), **New specimen** (known species, further specimen), **New cutting**, **Potted** (cutting → plant, see US-BES-04), **Swapped** (only if both parties are friends of the viewer or the viewer is involved).
- Only specimens with `Teilen: freunde` create events (US-SOZ-04). The date is `Gefangen_Am` of the specimen, otherwise "unbekannt" (never guessed, FR-POK-08).
- An event appears as soon as the sharing setting applies; sharing an old specimen creates **no** event "new today", but carries its actual date.
- Events are deduplicated by species and friend; several specimens of the same species on the same day are summarized into one event "N Exemplare".
- Default period last 30 days; filters: by friend, only "New species".

### US-SOZ-06 · "New among friends" since my last visit · ⬜
As a **plant keeper** I want to see on opening what has been added since my last visit.

Acceptance criteria:
- State analogous to US-POK-12 in a gitignored file (`gesehen` list of event IDs, `stand`). Missing or broken: silent creation, **no** banner.
- The banner "🎉 Freunde haben N neue Pflanzen: …" stays until "Okay ✔".
- Read/write errors are caught; the dashboard then renders without a banner instead of breaking.
- If the hub is missing (offline), the block shows the last known state with the note "Stand DD.MM.YYYY" instead of an error.

### US-SOZ-07 · View a friend's collection and compare it with mine · ⬜
As a **plant keeper** I want to view a friend's shared collection, so that I know what they have and what I lack.

Acceptance criteria:
- The friend's collection appears as collector cards in the style of US-POK-01. Cards show the state **of the friend** (caught = they own a shared specimen).
- Per card a chip "du hast sie" or "fehlt dir", derived from my ownership (US-POK-06).
- Filters: "Fehlt mir" (species they have and I do not), "Haben wir beide".
- No rank comparison and no leaderboard (deliberate, see non-goals). Facts are shown, no rating.

### US-SOZ-08 · Offer a plant or cutting for swapping · ⬜
As a **plant keeper** I want to put a specimen up as an offer, so that friends can request it.

Acceptance criteria:
- From the specimen card "Zum Tausch anbieten" creates an offer (DM-S2) with `Art`, specimen reference, `Typ` (`Steckling` | `Pflanze` | `Ableger`), `Modus` (`tauschen` | `abgeben`), optional `Wunsch` (free text, e.g. "gern etwas für Lampe 3") and `Notiz`.
- The offer is visible only to friends. A specimen can have at most one open offer.
- Only a specimen with `Teilen: freunde` can be offered; otherwise the dialog offers to set the sharing setting.
- **Health details:** the offer automatically shows "Behandlung offen" or "zuletzt behandelt: reason, date" from `Behandlungen` (BEH), without agent and notes. A specimen with an open pest treatment (`Erledigt: false`) can be offered only after explicit confirmation.
- The offer contains the phase hint "aktuell Ruhephase" (PHA), if applicable, so that recipients can judge cutting time and shipping.
- The keeper can withdraw the offer at any time (status `zurückgezogen`). Open requests on it are canceled.

### US-SOZ-09 · See offers from friends and request them · ⬜
As a **plant keeper** I want to see what friends offer and request something.

Acceptance criteria:
- Block "🔁 Tauschbörse" lists open offers of all friends with species, type, mode, health details, photo (if shared), chip "fehlt dir" (new species for me).
- Filters: lamp level of the species (fits my lamp distribution, LIC), "fehlt dir", type.
- "Anfragen" creates a swap request (DM-S3). With `Modus: tauschen` I can attach an **own** specimen with `Teilen: freunde` as a counter-offer or leave the return open (then free text).
- I can make only one open request per offer; I cannot request own offers.
- A hint appears if the offered species is on my **wishlist** (WUN); the wishlist itself is not transmitted to friends.

### US-SOZ-10 · Answer a swap request · ⬜
As a **plant keeper** I want to accept, decline or counter-propose requests on my offers.

Acceptance criteria:
- Incoming requests appear at the offer and as a notification (US-SOZ-12). Actions: **Zusagen**, **Ablehnen** (optionally with a short reason), **Anderes vorschlagen** (change counter-offer).
- Accepting sets the offer to `reserviert`; further requests for the same offer are declined automatically ("schon vergeben").
- If an acceptance is withdrawn before the handover, the offer goes back to `offen` and the other side is notified.
- A swap process has exactly the states `angefragt → zugesagt → übergeben` or terminal `abgelehnt`, `abgebrochen`, `zurückgezogen` (DM-S3). Transitions are allowed only in this direction.

### US-SOZ-11 · Confirm the handover, update collection and Pokédex · ⬜
As a **plant keeper** I want my data to adapt without manual work after the handover.

Acceptance criteria:
- The handover counts only when **both** sides have confirmed "übergeben ✔" (no state change by only one side).
- **At the giver:** the specimen is archived as in US-BES-07 (`04-Archive/Pflanzen/`) with `Archiviert_Am` and `Archiviert_Grund: "Getauscht mit <display name>"` or `"Verschenkt an <display name>"`. It thus disappears from distribution, phases, growth, treatments and Pokédex ownership.
- **At the recipient:** a new specimen arises under the rules of US-BES-02/03 (naming rule, marker query), `Gefangen_Am` = handover date (local, not UTC), `Herkunft` (DM-S4) set, `Teilen: privat`. For type `Steckling`/`Ableger` additionally `Status: "Steckling"` and lamp 1 (US-BES-04); for `Pflanze` the lamp of the species applies.
- If the species note does not exist at the recipient, they are pointed to the species template before creating (FR-BES-06). The specimen arises only afterwards.
- The recipient catches the species in the Pokédex automatically (US-POK-06); "Neu gefangen" (US-POK-12) applies.
- The growth log, the treatments and the location field of the giver are **not** passed on; the recipient starts with an empty log.
- Both sides see the completed swap in the swap history (US-SOZ-13) and as an event "Getauscht" in the feed (US-SOZ-05).
- If one of the steps (archiving, creating) cannot be executed (e.g. name conflict), the process stays at `zugesagt` and reports the reason; no half state with only one side arises.

### US-SOZ-12 · Be notified about news · ⬜
As a **plant keeper** I want to be notified about requests and acceptances without constantly checking.

Acceptance criteria:
- Triggers: new friendship request, request for my offer, acceptance/decline of my request, the other side confirmed the handover.
- New feed events (US-SOZ-05) trigger **no** individual notification, only the banner (US-SOZ-06); otherwise the feed would become noise.
- The channel is the bot from epic MON (US-MON-01): same rules (only when action is needed, idempotency per occasion and day). Without MON the dashboard shows open points as a warning block "📬 Offen".
- Per occasion the keeper can switch off notifications without losing the function.

### US-SOZ-13 · Swap history · ⬜
As a **plant keeper** I want to look up what I swapped with whom.

Acceptance criteria:
- Block "📜 Tauschhistorie" lists completed and canceled processes: date, friend, what given, what received, status.
- The history remains after ending the friendship (US-SOZ-03), the friend then appears with the stored display name.
- A received specimen refers via `Herkunft` to the process; the specimen card shows "von <display name>".

## Data model

### DM-S1 Sharing setting (extension of DM-02)

| Field | Required | Meaning |
|---|---|---|
| `Teilen` | no | `privat` (default) or `freunde` |
| `Teilen_Fotos` | no | `true`/`false`; effective only with `Teilen: freunde` |

### DM-S2 Offer (hub record, mirror in the giver's vault)

`Angebot_Id`, `Geber`, `Art` (Latin + German), `Exemplar` (reference), `Typ` (`Steckling` | `Pflanze` | `Ableger`), `Modus` (`tauschen` | `abgeben`), `Wunsch`, `Notiz`, `Gesundheit` (derived), `Status` (`offen` | `reserviert` | `übergeben` | `zurückgezogen`), `Erstellt_Am`.

### DM-S3 Swap process (hub record)

`Tausch_Id`, `Angebot_Id`, `Anfragender`, `Gegenangebot` (specimen reference or free text), `Status` (`angefragt` | `zugesagt` | `übergeben` | `abgelehnt` | `abgebrochen` | `zurückgezogen`), `Bestätigt_Geber`, `Bestätigt_Empfänger` (date or empty), timestamp per transition.

### DM-S4 Provenance (extension of DM-02)

| Field | Required | Meaning |
|---|---|---|
| `Herkunft` | no | `{Von, Tausch_Id, Datum}`; missing for plants acquired by oneself |

Display name instead of hub id for `Von`, so that the note stays readable without the hub.

### DM-S5 Friendship (hub record)

`Freund_Id`, `Anzeigename`, `Status` (`angefragt` | `bestätigt` | `beendet`), `Seit`.

## Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-SOZ-01 | **Private by default:** without a sharing setting no specimen, photo or location leaves the vault (US-SOZ-04). | ⬜ |
| FR-SOZ-02 | The vault stays the source of truth for the own collection; the hub holds only sharing settings, offers, processes and friendships. It is not a precondition for using the other epics. | ⬜ |
| FR-SOZ-03 | If the hub fails, all previous dashboard blocks stay fully usable; social blocks show the last state with a note (NFR-06). | ⬜ |
| FR-SOZ-04 | State transitions of the swap (DM-S3) and the derivation of the feed events are pure logic without the Obsidian API in `soziales-core.js` and are tested with `node --test`, like `pokedex-core.js` (FR-POK-01, QS-02). | ⬜ |
| FR-SOZ-05 | The handover is atomic from the participants' point of view: either archiving at the giver **and** creating at the recipient, or `zugesagt` remains (US-SOZ-11). | ⬜ |
| FR-SOZ-06 | Changes to the frontmatter continue to run via `processFrontMatter`, never via raw YAML (principle from `00-System-Overview.md`). | ⬜ |
| FR-SOZ-07 | No invented data: date and catch status come from the shared specimens, "unknown" instead of guessing (FR-POK-08). | ⬜ |
| FR-SOZ-08 | Display names are freely chosen and no proof of identity; friendship and swap require the mutual confirmation by the person. | ⬜ |
| FR-SOZ-09 | **Plant law and health:** when offering, the system points out species protection (e.g. CITES-listed cacti and orchids) and pest infestation. It does not prevent offering, but replaces no legal review. Shipping across national borders is not part of the system. | ⬜ |
| FR-SOZ-10 | Deletion: a keeper can delete their hub data (friendships, offers, processes) completely. The vault frontmatter remains untouched. | ⬜ |
| FR-SOZ-11 | Out of scope: chat/messages between friends, public profiles, leaderboards, selling for money, shipping handling, groups. | ⬜ (deliberate) |

## Open questions

1. **Exchange layer (E-SOZ-01):** bot as hub, own server with accounts or file-based sync? Determines identity, offline behavior and effort.
2. **Identity:** how does a keeper identify themselves in the hub (Telegram ID, account, key pair)?
3. **Swap with return in money:** deliberately excluded (FR-SOZ-11); confirm?
4. **Sharing granularity:** is `privat`/`freunde` per specimen enough, or is a friend group ("only close friends") needed?
5. **Several vault users on one device** are not intended.
