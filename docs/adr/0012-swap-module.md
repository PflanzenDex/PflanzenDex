# 0012 · Swapping gets its own module `swap`

- **Status:** accepted by the PO (2026-10-08), revisable. Assumption decided by the product owner under the autonomy rules.
- **Refines:** ADR 0003 (the module cut: `social` owned `offer` and `swap`), US-SOZ-08 to US-SOZ-11 and US-SOZ-13
- **Affects:** `app/config/lint/modules.config.mjs` (new module `swap`, the tables `offer` and `swap` move out of `social`), `docs/specs/product/10-social.md`

## Context

ADR 0003 put friends, sharing, the feed and the exchange into one module `social`. Friends, sharing and the feed are built and read other accounts' data only through the release layer (`friendView`, `friend_shares()`). The exchange is a different thing: it changes **two** accounts' data in one transaction (the giver's specimen is archived, the recipient gets a new one, FR-SOZ-05), it needs the treatments of the giver for the health details and the care phase for the dormancy hint, and it carries its own state machine and history. Keeping it inside `social` would make `social` depend on `care` and write into `collection` next to code that must stay a pure reader.

## Decision

A new module **`swap`** (public interface per package: `core/src/swap`, `db/src/swap`, `api/src/swap`, `web/src/swap`). It owns the tables `offer` and `swap` (the entry `event` stays with `social`; the feed derives from shared specimens, it is not a table).

**Dependencies (no back edge, no cycle):** `swap -> kernel, social, collection, catalog, care`. `social` and `collection` never import `swap`. What `social` needs from `swap` is a port that `social` defines and the app root fills: the feed type "Swapped" (US-SOZ-05) and the cancelation of open swaps when a friendship ends (US-SOZ-03). The cancelation is also checked lazily: every transition of a swap first checks that the friendship is still confirmed and otherwise ends in `canceled`, so a failed call of the hook can never leave a living swap behind a dead friendship.

**Data model (DM-SOZ-02, DM-SOZ-03):**

- `offer` (tenant table, `account_id` = giver): specimen (composite foreign key `(account_id, specimen_id)`), `type` (`cutting | plant | offshoot`), `mode` (`swap | give_away`), wish text, note, `status` (`open | reserved | handed_over | withdrawn`), `created_at`. At most one open or reserved offer per specimen (partial unique index). Health details and the dormancy hint are derived on every read, never stored (P-01).
- `swap`: one row **per side**, like `friendship` (each account sees exactly its own side under the normal row rule): `account_id` (owner of the row), `swap_id` (shared by both rows), `role` (`giver | recipient`), the other account and its stored display name (history survives the end of the friendship, US-SOZ-13), the offer data that must outlive the offer (species names, type, mode), counter-offer (own specimen of the requester or free text), `status` (`requested | accepted | handed_over | declined | canceled | withdrawn`), `confirmed_giver`, `confirmed_recipient`, and a timestamp per transition. Both rows change together in one transaction through `security definer` functions that switch the account inside the function (as `answer_friendship()` does).
- States only move forward: `requested -> accepted -> handed_over`; terminal: `declined`, `canceled`, `withdrawn`. An acceptance withdrawn before the handover sets the offer back to `open`.
- The recipient's specimen records its provenance through the existing table `specimen_provenance` of `collection` (written through the collection port, not by SQL in `swap`).

**The handover (US-SOZ-11):** counts only when **both** sides confirmed. The last confirmation runs one database transaction that archives the giver's specimen (US-BES-07, reason "Swapped with <name>" or "Gifted to <name>") and creates the recipient's specimen (US-BES-02/03/04, caught date = local handover date, provenance, `Share = private`) and moves the swap to `handed_over`. `collection` offers both steps as functions that take the open connection of the caller (it does not open its own transaction for them); `swap` runs them as the giver and, with `asAccount`, as the recipient. If one step fails (for example a name conflict), nothing is written, the swap stays `accepted` and says why (never a half state).

**Principles:** private by default (an offer needs `Share = friends` of the specimen; offers and swaps are visible only to the two sides and, for open offers, to the giver's confirmed friends); no ranking and no counts of who swapped most (FR-SOZ-11); nothing disappears silently (P-10: every refusal, cancelation and the reason of a decline are visible to the affected side); the handover only after both confirmations; the wishlist of a requester is never transmitted (FR-WUN-07), only a local hint; no selling for money, no shipping (FR-SOZ-11). Plant law and health are notices, not blocks (FR-SOZ-09).

**Tests:** every new table gets the generic tenant test through its fixture; each operation gets a two-account test (the other side and a stranger cannot read or change the row, a foreign id answers like an unknown one); the state machine is tested for every allowed and every refused transition; the handover has a test for atomicity (a failing second step leaves both accounts unchanged) and one that proves the recipient inherits nothing but the species (no measurements, treatments or location).

## Consequences

- `app/config/lint/modules.config.mjs` gets the module `swap` with the edges above; the tables `offer` and `swap` move from `social` to `swap`. The matrix in ADR 0003 is amended by this record, the register wins (as stated there).
- The build is cut into the five stories: the offer (SOZ-08), the exchange list and the request (SOZ-09), the answer (SOZ-10), the handover (SOZ-11), the history (SOZ-13). Each is its own pull request.
- `collection` gains two connection-taking functions for the handover; their contract test sits with them.
- Revisit when swapping is extended to equipment (US-EQU-12) or to groups (out of scope, FR-SOZ-11).
