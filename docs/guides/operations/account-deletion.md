# Account deletion (US-ACC-04, US-DEV-03 routine "Deletion requests (GDPR)")

What happens when a keeper deletes the account, what the job does, how the operator sees the legal deadline, and what to do
when the identity at the sign-in service is not removed or a deadline has passed. The runbook is named `account-deletion` in
the code (`delete-job.ts`, `deletion-routes.ts`).

## Flow

1. The keeper requests the deletion (`POST /account/deletion`, body `{ "confirm": true }`). The row `account_deletion` holds
   `requested_at` and `due_at` (7 days later, assumption). The job `privacy.delete_account` is ordered for `due_at`. The
   account works as before; the keeper can withdraw (`DELETE /account/deletion`) until then.
2. When the job runs after `due_at`, it looks at the request first (a withdrawn request, a request not yet due or an account
   that is gone end without doing anything). Then, in this order:
   1. the object store prefix `<account id>/` is emptied (a failure stops the job, nothing else is touched);
   2. the user is removed at the sign-in service (see "Identity removal" below; a failure stops the job before any data is
      erased, so the retry still finds the request and the subject);
   3. the database function `erase_account()` runs in one transaction: running swaps are canceled (cause `account_deleted`),
      proposals nobody else can see are removed, approved catalog contributions are anonymized, and the `account` row is
      deleted with everything that hangs on it;
   4. the log row `deletion_log` keeps when the request and the deletion happened and the sign-in subject, until the identity is
      removed (`identity_removed_at`); the subject is then cleared.
3. The deadline: GDPR Art. 12(3) gives one month from the request. The deadline is the request instant plus one calendar month,
   in UTC (a month that is shorter ends on its last day: 31 January is due on 28 February). The card "Fristen" and the health
   details show it. The warning window is the last 7 days before it (starting value, assumption).

## Seeing the deadlines

- **The card "Fristen"** in the operator area (`/operator?sheet=fristen`, row "Fristen" on the overview): near deadlines, passed
  deadlines, and the identity removals still open with their subject and completion time. Dates are in UTC.
- **The health details** (`GET /health/details` inside the stack, see `staging-deploy-and-backup.md`): `status` is `degraded`
  when a deadline is near or has passed, and `checks.deletionDeadlines` says which:
  - `status: "near"`: a deadline is inside the warning window; act before it passes;
  - `status: "deadline_passed"`: a deadline has passed; follow "Deadline passed" below;
  - `status: "error"`: the state could not be read (the database check and the job check still tell more).
    `near`, `past` and `identityOpen` are the counts.
- **Database** (owner role), the same open items: `select kind, entry_id, requested_at, subject, completed_at from deletion_deadline_rows();`

## Identity removal

The removal at the sign-in service (Keycloak, realm `pflanzendex`) is automated when the four settings of the API are set:

| Variable                       | Value                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `IDENTITY_ADMIN_URL`           | the realm's admin base, inside the stack `http://keycloak:8080/admin/realms/pflanzendex`                             |
| `IDENTITY_TOKEN_URL`           | the realm's token endpoint, inside the stack `http://keycloak:8080/realms/pflanzendex/protocol/openid-connect/token` |
| `IDENTITY_ADMIN_CLIENT_ID`     | the service client (below), e.g. `pflanzendex-identity`                                                              |
| `IDENTITY_ADMIN_CLIENT_SECRET` | its secret; only in the host's `.env`, never in the repo                                                             |

All four or none. A partial set is named in the API's start log (names only) and the removal stays manual. Without any of them the
job leaves the subject open and the operator removes the user by hand (below). Why automated: the job must not wait for a manual
step, and the right it uses is limited to deleting users, so the API gets no realm administration.

**Realm change needed once (not in the repo's realm config yet, so it is a manual step):** in the realm `pflanzendex` of the
sign-in service:

1. Clients, Create client: Client ID `pflanzendex-identity`; Client authentication on (confidential); only the service accounts
   flow on (no standard flow, no direct access grants, no redirect URIs).
2. Credentials: copy the client secret into `IDENTITY_ADMIN_CLIENT_SECRET` in the host's `.env`.
3. Service account roles: assign the client role `manage-users` of `realm-management`, and no other role.
4. Restart the API so it reads the variables. The start log then names nothing about the identity removal.

To rotate the secret: regenerate it in the Credentials tab, put it into `.env`, restart the API. A refused token (401) or
refused delete (401, 403) keeps the job failing with `privacy.identity_removal_failed` until the settings match.

**Removing a user by hand** (the fallback, or when the job cannot do it): in the admin console, realm `pflanzendex`, Users,
search by ID with the subject (the `sub`, the log's `subject`), Delete. Then in the operator area "Fristen", press "Als entfernt
markieren" for that entry. The mark is idempotent: a second press changes nothing. The same closing can be done in the database
(owner role): `update deletion_log set subject = null, identity_removed_at = now() where id = '<entry id>' and identity_removed_at is null;`

## Jobs that keep failing

- The job retries about a day with growing delays. Its last error is in the job row: `select id, status, attempts, last_error from job where type = 'privacy.delete_account';`.
  - `identity not removed: privacy.identity_removal_failed`: the sign-in service refused or did not answer. Check the settings above and
    the sign-in service; nothing has been erased yet, so the retry is safe.
  - `photos not removed: ...`: the object store. Without an object store configured the job fails on purpose: photos are never
    skipped silently. Fix the store (`docs/guides/operations/staging-deploy-and-backup.md`).
- A job that ended `dead` (`/health/details`: `checks.jobs.status: "dead_jobs"`): fix the cause, then set the row back to
  `queued`: `update job set status = 'queued', attempts = 0, run_at = now() where id = '<id>'`.

## Deadline passed (incident)

The application has no incident tool yet (operator messages are an open item of NFR-18). The record is the health entry
`deletionDeadlines.status: "deadline_passed"` and the card "Fristen". Then:

1. Write it down: the request time, the deadline, the open item (job or identity), the cause and what you did, with the time.
   Tell the owner the same day.
2. Finish the deletion now: fix the cause and let the job run (requeue it as above), or, if the user is already gone, mark the
   identity removal in the card. A deletion that is late is not undone; the delay is recorded.
3. Check the card again: the item must be gone and the health back to `ok`.

## Known limit

A withdrawal in the same moment as the job's identity removal is not caught by the job: the identity can be removed while the
account stays. The database keeps the account, the keeper cannot sign in, and nothing alerts. Check the deletion of a withdrawn
request in the job row and report it to the owner; it is not handled automatically.

## Backups

Backups made before the deletion still contain the data until they expire (`staging-deploy-and-backup.md`). A restore must run the
open deletions again: `select requested_at from deletion_log where subject is not null and identity_removed_at is null` and the
open requests (`deletion_deadline_rows()`) tell which accounts to remove after a restore.

## What stays

- Approved species and names the keeper contributed to the shared catalog (creator removed).
- Completed and canceled swaps in the history of the partners, with the display name the partner stored.
- The row of the job queue keeps the account id (a UUID that points at nothing) for 30 days.
- Technical keys of the repeat guard (`idempotency`) go with the account.
