import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool } from "./kernel/index.ts";

// #907, QG-D1, P-04: every `security definer` function is audited for the superuser-owner assumption (a function that
// trusts row security to scope its reads does not run under row security when the table owner is a superuser or has
// BYPASSRLS). The register below is the audit; `docs/guides/reference/security-definer-audit.md` explains it.
//   scoped    every read and write names its account (or is bound to the caller by `current_account()`)
//   gated     global on purpose, behind an explicit operator or reviewer check, or an aggregate that exposes no rows
//   id-bound  an update by the unique id of a row the caller already proved to be theirs; same rows with any owner
//   fixed     relied on row security once, now names the account (migration in the note)
//   open      still relies on row security: leaks or corrupts other accounts' rows under a superuser owner
// A new `security definer` function fails the first test until it is audited and entered here.
type Status = "scoped" | "gated" | "id-bound" | "fixed" | "open";
const REGISTER: Record<string, readonly [Status, string]> = {
  roles_of_account: ["scoped", "own roles"],
  is_reviewer: ["scoped", "own role row"],
  is_operator: ["scoped", "own role row"],
  species_status: ["scoped", "catalog status or own case"],
  species_own: ["scoped", "own review case"],
  species_is_merged: ["scoped", "own review case"],
  is_open_proposal: ["gated", "reviewers read all open proposals"],
  lock_species_for_merge: ["gated", "reviewer lock"],
  invitation_required: ["gated", "one global setting row"],
  set_invitation_only: ["gated", "operator"],
  create_invitation: ["scoped", "operator, created_by is the caller"],
  redeem_invitation: ["gated", "lookup by code hash"],
  operator_overview: ["gated", "operator, counts only"],
  list_invitations: ["gated", "operator"],
  set_operator_cost: ["gated", "operator"],
  operator_cost: ["gated", "operator"],
  operator_introduction: ["gated", "operator, aggregate above a threshold"],
  create_friend_code: ["scoped", "created_by is the caller"],
  request_friendship: ["scoped", "friend_code by hash, friendship rows by explicit account"],
  answer_friendship: ["scoped", "friendship rows by explicit account"],
  end_friendship: ["scoped", "friendship rows by explicit account"],
  friendship_holds: ["scoped", "friendship rows by explicit account"],
  friend_shares: ["open", "sharing rows of every account after a mutual friendship"],
  friend_shares_since: ["open", "sharing rows of every account after a mutual friendship"],
  friend_equipment: ["open", "shared equipment of every account after a mutual friendship"],
  friend_offers: ["fixed", "0089"],
  request_swap: ["fixed", "0089"],
  friend_wants: ["scoped", "wish of the friend by explicit account"],
  set_swap_state: ["open", "both rows of the swap by swap_id only (benign: same values)"],
  reopen_offer: ["open", "offer by id only (benign while callers pass the giver)"],
  answer_swap: ["id-bound", "own swap row; offer id taken from it"],
  cancel_orphaned_swaps: ["scoped", "own swap rows"],
  cancel_swaps_for_offer: ["scoped", "own swap rows"],
  cancel_swaps_of_deleted_account: ["scoped", "own swap rows"],
  confirm_handover: ["id-bound", "own swap row; both rows get the same values"],
  finish_handover: ["open", "both swap rows get both specimen ids"],
  reminder_accounts: ["gated", "worker only, id and time zone of accounts with a zone"],
  features_of_account: ["scoped", "own switches"],
  rarity_participants: ["gated", "ids of accounts that consented, nothing else"],
  active_species_of: ["open", "specimens of every account, not only the asked ones"],
  erase_catalog_contributions: ["scoped", "own cases, specimens and profiles"],
  erase_account: ["scoped", "own account"],
  accept_catalog_correction: ["gated", "reviewer"],
  reject_catalog_correction: ["gated", "reviewer"],
  revert_catalog_field: ["gated", "reviewer"],
  open_correction_id: ["gated", "open corrections of a published species, id only"],
  open_catalog_corrections: ["gated", "reviewer"],
  catalog_correction_vote_guard: ["scoped", "votes of new.account_id"],
  vote_catalog_correction: ["scoped", "own vote"],
  catalog_correction_vote_counts: ["gated", "aggregate counts of open corrections"],
  open_species_corrections: [
    "gated",
    "open corrections of a published species, counts and own vote",
  ],
  withdraw_catalog_correction: ["scoped", "own correction"],
};
// The functions that still rely on row security. Fixed in the next change; this list only shrinks.
const OPEN = [
  "active_species_of",
  "finish_handover",
  "friend_equipment",
  "friend_shares",
  "friend_shares_since",
  "reopen_offer",
  "set_swap_state",
];

let pool: Pool;
beforeAll(async () => {
  pool = openOwnerPool();
  await migrate(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("QG-D1 #907 the register of security definer functions", () => {
  it("QG-D1 every security definer function in the schema is in the register, and nothing else is", async () => {
    const r = await pool.query<{ name: string }>(
      "select proname as name from pg_proc where prosecdef and pronamespace = 'public'::regnamespace order by 1",
    );
    expect(r.rows.map((x) => x.name)).toEqual(Object.keys(REGISTER).sort());
  });

  it("QG-D1 the functions that still rely on row security are exactly the known open ones", () => {
    const open = Object.entries(REGISTER)
      .filter(([, [status]]) => status === "open")
      .map(([name]) => name)
      .sort();
    expect(open).toEqual(OPEN);
  });
});
