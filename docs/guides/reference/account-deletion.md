# Account deletion (US-ACC-04)

How a keeper's account is removed, and what the operator has to do by hand.

## Flow

1. The keeper requests the deletion (`POST /account/deletion`, body `{ "confirm": true }`). The row `account_deletion` holds `requested_at` and `due_at` (7 days later, assumption). The job `privacy.delete_account` is ordered for `due_at`. Nothing else changes; the account works as before and the keeper can withdraw (`DELETE /account/deletion`).
2. When the job runs after `due_at` it looks at the request first (a withdrawn request, a request not yet due or an account that is gone end without doing anything), then removes the object store prefix `<account id>/` and calls the database function `erase_account()` in one transaction.
3. `erase_account()` cancels running swaps (cause `account_deleted`), removes the proposals nobody else can see, anonymizes approved catalog contributions and deletes the `account` row. All rows with `account_id` go with it; partners lose the friendship, keep completed swaps with the stored display name (`other_id` null).
4. It writes one row to `deletion_log` (when it was requested and finished, the sign-in subject, nothing else).

## Operator tasks

- **Remove the user in Keycloak.** This application does not do it yet (port `IdentityRemoval`, stub `identityKept`). Open deletions:

  ```sql
  select id, completed_at, subject from deletion_log where identity_removed_at is null order by completed_at;
  ```

  Delete the user with that `sub` in the realm (admin console, Users, search by ID), then mark it done (this also clears the subject):

  ```sql
  update deletion_log set subject = null, identity_removed_at = now() where subject = '<sub>';
  ```

  Deadline: GDPR asks for one month from the request; `due_at` plus this step must stay inside it. A row older than 21 days in `deletion_log` without `identity_removed_at` is an incident (`docs/specs/product/19-development-process-and-automation.md`).
- **Dead jobs.** The job retries for about a day with growing delays. If it ends `dead` (see the job counts on `/health/details` or `select last_error from job where type = 'privacy.delete_account'`), fix the cause (usually the object store), then set the job row back to `queued` (`update job set status = 'queued', attempts = 0, run_at = now() where id = '<id>'`). Without an object store configured the job fails on purpose: photos are never skipped silently.
- **Backups.** Backups made before the deletion still contain the data until they expire (`docs/guides/operations/staging-deploy-and-backup.md`). A restore must run the open deletions again: `select requested_at from deletion_log` tells which accounts to remove after a restore.

## What stays

- Approved species and names the keeper contributed to the shared catalog (creator removed).
- Completed and canceled swaps in the history of the partners, with the display name the partner stored.
- The row of the job queue keeps the account id (a UUID that points at nothing) for 30 days.
- Technical keys of the repeat guard (`idempotency`) go with the account.
