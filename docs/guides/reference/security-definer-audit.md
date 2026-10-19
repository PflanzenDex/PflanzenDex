# SECURITY DEFINER audit: the superuser-owner assumption

Issue #907, follow-up of #891 / PR #906 (migration 0089). Status: audit of migrations `0001`-`0089`.

## The assumption

A `security definer` function runs with the rights of its owner (the role that ran the migration). All tenant tables have
`force row level security` with a policy on `current_account()`, which also binds a plain table owner. A **superuser**
(or a role with `BYPASSRLS`) is never bound by row security. A function that reads a tenant table and trusts the row
rule to pick the account therefore reads **every** account's rows when its owner is a superuser. The compose deployment
runs migrations as `POSTGRES_USER` of the postgres image, which is a superuser, so this was real in production.

Rule for every `security definer` function: name the account in each read and write (`where account_id = ...`), never
rely on the row rule. Row security stays as the second line of defence for the application role.

## Method

1. Every function in `pg_proc` with `prosecdef` after migration `0089` (52 functions; the German pre-0012 names are
   dropped), current definition taken from the latest migration that defines it.
2. Each statement classified: explicit account predicate, explicit role gate (operator/reviewer), global by design, or
   dependent on the row rule.
3. The register in `app/packages/db/src/security-definer-inventory.test.ts` pins the result: a new function fails
   the test until it is audited. `createSuperuserOwnerDatabase()` in `app/packages/db/src/fixtures.ts` creates a
   scratch database owned by a superuser; the tests of the risky functions run there as well.

## Result

- 52 functions. 8 relied on the row rule and are fixed in migrations 0090 to 0093 (`friend_shares`, `friend_shares_since`,
  `friend_equipment`, `active_species_of`: read other accounts' rows; `confirm_handover`: the handover could not be
  confirmed; `finish_handover`: wrote the other side's specimen id into a row; `set_swap_state`, `reopen_offer`:
  update by id only, benign, hardened). `friend_offers` and `request_swap` were fixed before in #906 (migration 0089).
- The rest names the account, is gated by an operator or reviewer check, or is global on purpose (catalog, aggregates).
- Each fixed function has a test in the superuser-owner database next to its module (`*-superuser-owner.test.ts`) that
  failed before the migration.

## Inventory

(r) read, (w) write. Risk = leaks or corrupts other accounts' rows when the table owner is a superuser.

| Function                          | Migration | Tables                                           | Scope                                                                                              | Risk with superuser owner                                                  |
| --------------------------------- | --------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `roles_of_account`                | 0012      | account_role (r)                                 | explicit `account = current_account()`                                                             | no                                                                         |
| `is_reviewer`                     | 0012      | account_role (r)                                 | explicit                                                                                           | no                                                                         |
| `is_operator`                     | 0018      | account_role (r)                                 | explicit                                                                                           | no                                                                         |
| `species_status`                  | 0017      | review_case (r)                                  | explicit: published status or `account_id = current_account()`                                     | no                                                                         |
| `species_own`                     | 0012      | review_case (r)                                  | explicit                                                                                           | no                                                                         |
| `species_is_merged`               | 0017      | review_case (r)                                  | explicit                                                                                           | no                                                                         |
| `is_open_proposal`                | 0017      | review_case (r)                                  | reviewer check, then all open proposals (by design)                                                | no                                                                         |
| `lock_species_for_merge`          | 0017      | species (lock)                                   | reviewer check                                                                                     | no                                                                         |
| `invitation_required`             | 0018      | access_setting (r)                               | one global row                                                                                     | no                                                                         |
| `set_invitation_only`             | 0018      | access_setting (w)                               | operator check                                                                                     | no                                                                         |
| `create_invitation`               | 0018      | invitation (w)                                   | operator check, `created_by = current_account()`                                                   | no                                                                         |
| `redeem_invitation`               | 0018      | invitation (w)                                   | by code hash, needs verified subject                                                               | no                                                                         |
| `operator_overview`               | 0018      | account, account_data, access_setting (r)        | operator check, counts only                                                                        | no                                                                         |
| `list_invitations`                | 0018      | invitation (r)                                   | operator check                                                                                     | no                                                                         |
| `set_operator_cost`               | 0021      | operator_cost (w)                                | operator check                                                                                     | no                                                                         |
| `operator_cost`                   | 0021      | operator_cost (r)                                | operator check                                                                                     | no                                                                         |
| `operator_introduction`           | 0084      | account, specimen (r)                            | operator check; loop sets the account, `s.account_id = r.id` explicit; aggregate above a threshold | no                                                                         |
| `create_friend_code`              | 0026      | friend_code (w)                                  | `created_by = current_account()`                                                                   | no                                                                         |
| `request_friendship`              | 0027      | friend_code, friendship, account_data (rw)       | explicit `account_id` on every read; inserts name both accounts                                    | no                                                                         |
| `answer_friendship`               | 0027      | friendship (rw)                                  | explicit `account_id = me` / `f.other_id`                                                          | no                                                                         |
| `end_friendship`                  | 0028      | friendship (rw)                                  | explicit                                                                                           | no                                                                         |
| `friendship_holds`                | 0045      | friendship (r)                                   | explicit                                                                                           | no                                                                         |
| `friend_shares`                   | 0030      | friendship, sharing (r)                          | friendship explicit; `sharing` read under the switched account with NO account predicate           | YES (all accounts' sharing rows); fixed in 0090                            |
| `friend_shares_since`             | 0032      | friendship, sharing (r)                          | same as friend_shares                                                                              | YES (all accounts' sharing rows); fixed in 0090                            |
| `friend_equipment`                | 0062      | friendship, equipment, light_zone (r)            | friendship explicit; `equipment` read with NO account predicate                                    | YES (all accounts' shared equipment); fixed in 0091                        |
| `friend_offers`                   | 0089      | friendship, offer, sharing, account_data (r)     | explicit since 0089                                                                                | fixed in #906 (listed strangers' offers)                                   |
| `request_swap`                    | 0089      | offer, swap, friendship, sharing, specimen (rw)  | explicit since 0089                                                                                | fixed in #906 (own_offer for a friend's offer)                             |
| `friend_wants`                    | 0088      | friendship, wish, account_data (r)               | explicit `w.account_id = f.other_id`                                                               | no                                                                         |
| `set_swap_state`                  | 0045      | swap (w)                                         | `where swap_id = ...` only; relies on RLS to touch one row per statement                           | benign (identical values); hardened in 0092                                |
| `reopen_offer`                    | 0045      | offer (w)                                        | `where id = ...` only                                                                              | benign while callers pass the giver; hardened in 0092                      |
| `answer_swap`                     | 0045      | swap, offer (rw)                                 | own swap row `account_id = me`; offer by id taken from that row                                    | no                                                                         |
| `cancel_orphaned_swaps`           | 0045      | swap (rw)                                        | explicit `account_id = me`                                                                         | no                                                                         |
| `cancel_swaps_for_offer`          | 0045      | swap (rw)                                        | explicit                                                                                           | no                                                                         |
| `cancel_swaps_of_deleted_account` | 0069      | swap (rw)                                        | explicit                                                                                           | no                                                                         |
| `confirm_handover`                | 0046      | swap, offer (rw)                                 | own row explicit; update by `swap_id` hit both rows and `returning ... into` got two               | YES (confirming failed: "query returned more than one row"); fixed in 0092 |
| `finish_handover`                 | 0046      | swap, offer (w)                                  | `where swap_id = ...` per switched account: with a bypass BOTH rows get BOTH specimen ids          | YES (foreign specimen id written into the other side's row); fixed in 0092 |
| `reminder_accounts`               | 0049      | account, account_data (r)                        | worker only (not granted to the app role); `account_id = one`                                      | no                                                                         |
| `features_of_account`             | 0065      | account_feature (r)                              | explicit                                                                                           | no                                                                         |
| `rarity_participants`             | 0067      | account_data (r)                                 | global on purpose: ids of consenting accounts, nothing else                                        | no                                                                         |
| `active_species_of`               | 0068      | specimen (r)                                     | loop over the asked accounts, `specimen` read with NO account predicate                            | YES (species of ALL accounts returned); fixed in 0093                      |
| `erase_catalog_contributions`     | 0070      | specimen, care_profile, species, review_case (w) | explicit `account_id = me`                                                                         | no                                                                         |
| `erase_account`                   | 0071      | account, account_deletion, deletion_log (rw)     | explicit                                                                                           | no                                                                         |
| `accept_catalog_correction`       | 0086      | catalog_correction, species, provenance (rw)     | reviewer check; global catalog                                                                     | no                                                                         |
| `reject_catalog_correction`       | 0080      | catalog_correction (w)                           | reviewer check                                                                                     | no                                                                         |
| `revert_catalog_field`            | 0080      | species, catalog_field_provenance (rw)           | reviewer check                                                                                     | no                                                                         |
| `open_correction_id`              | 0080      | catalog_correction (r)                           | published species only; returns an id                                                              | no                                                                         |
| `open_catalog_corrections`        | 0080      | catalog_correction, species (r)                  | reviewer check                                                                                     | no                                                                         |
| `catalog_correction_vote_guard`   | 0086      | catalog_correction, catalog_correction_vote (r)  | trigger; votes of `new.account_id`                                                                 | no                                                                         |
| `vote_catalog_correction`         | 0086      | catalog_correction, vote (rw)                    | `me`; rate limit by own account                                                                    | no                                                                         |
| `catalog_correction_vote_counts`  | 0085      | catalog_correction(_vote) (r)                    | aggregate counts of open corrections                                                               | no                                                                         |
| `open_species_corrections`        | 0085      | catalog_correction(_vote) (r)                    | counts plus `my_vote` by `current_account()`                                                       | no                                                                         |
| `withdraw_catalog_correction`     | 0086      | catalog_correction (w)                           | explicit `account_id = current_account()`                                                          | no                                                                         |

## See also

Skill `tenant-isolation-test`; migration `0089`.
