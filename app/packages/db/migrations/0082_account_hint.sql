-- module: account
-- US-ONB-07, DM-ONB-03, P-04, P-05: the hints of the introduction that an account has seen or dismissed, and the end of the
-- first-plant guide ("Einstieg beenden"), per account instead of per device. One row per account and occasion;
-- `shown_on` is the local calendar date the hint was first shown (NFR-08, it starts the 7-day expiry), `dismissed_on` the
-- local date of "Okay"; null while not dismissed. Rows are never deleted by the app (P-10). The occasion ids live in the
-- domain logic, so a new occasion needs no migration. Forward-only (expand): the previous app version does not know the
-- table and keeps working.

create table account_hint (
  account_id uuid not null references account(id) on delete cascade,
  occasion text not null check (occasion ~ '^[a-z][a-z_]{0,39}$'),
  shown_on date not null,
  dismissed_on date,
  primary key (account_id, occasion)
);
select tenant_protection('account_hint');
