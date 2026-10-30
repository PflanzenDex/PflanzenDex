-- module: account
-- US-ONB-03, DM-ONB-01, FR-ONB-06, P-04, P-05: the keeper style of an account, `few` ("ein paar Pflanzen pflegen") or `many`
-- ("viel verwalten, alles sofort"). One row per account; an account without a row counts as `few` (new accounts start with it).
-- `chosen_on` is the local calendar date of the last choice (NFR-08), null for a style set by this migration. No level, no rank.
-- Accounts that exist now keep every function: they are set to `many` before the rules apply (FR-ONB-06). The backfill runs
-- before the row rule is switched on. Forward-only (expand): the previous app version does not know the table and keeps working.

create table account_style (
  account_id uuid primary key references account(id) on delete cascade,
  style text not null check (style in ('few', 'many')),
  chosen_on date
);
insert into account_style (account_id, style) select id, 'many' from account;
select tenant_protection('account_style');
