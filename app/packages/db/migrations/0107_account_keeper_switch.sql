-- module: account
-- US-ONB-09, DM-ONB-04, P-04, P-05, P-10: the keeper's switch of a feature outside the core purpose ("Konto", "Was die App
-- kann"). One row per account and feature; `enabled` false means off, and a feature without a row is on. `changed_on` is the
-- local calendar date of the last change (NFR-08). Rows are never deleted by the app: switching off keeps the data (P-10).
-- The feature ids live in the domain logic (KEEPER_SWITCH_IDS), so a new switch needs no migration. Forward-only
-- (expand): the previous app version does not know the table and keeps working. The row rule is the generic one of every
-- tenant table (`tenant_protection`). Not the operator's switch (`account_feature`, US-DEV-06).

create table account_keeper_switch (
  account_id uuid not null references account(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z_]{0,39}$'),
  enabled boolean not null,
  changed_on date not null,
  primary key (account_id, feature)
);
select tenant_protection('account_keeper_switch');
