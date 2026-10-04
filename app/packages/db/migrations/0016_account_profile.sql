-- module: account
-- US-ACC-02: profile and settings. The display name column already exists (FR-ACC-01); new are the time zone, the two
-- global switches and the notification switches per occasion. Additive only: the previous app version ignores them.

-- IANA name, e.g. `Europe/Berlin` (NFR-08). `null` = not chosen yet; the device decides until then. The operation
-- `account.update_profile` validates the name against the IANA database; the check only keeps obvious garbage out.
alter table account_data add column time_zone text
  check (time_zone is null or (time_zone ~ '^[A-Za-z]' and length(time_zone) <= 64));

-- "Everything private" (US-SOZ-04) and "No recommendations" (US-EQU-11). Off by default: nothing is shared anyway until
-- the user opts in per object (P-05); the switch suspends sharing settings without deleting them.
alter table account_data add column everything_private boolean not null default false;
alter table account_data add column no_recommendations boolean not null default false;

-- Switch per occasion, e.g. `{"treatment": false}`; an occasion that is missing counts as on (US-MON-08). Keys and
-- values are validated by the operation; the database only guarantees a JSON object.
alter table account_data add column notification_settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(notification_settings) = 'object');
