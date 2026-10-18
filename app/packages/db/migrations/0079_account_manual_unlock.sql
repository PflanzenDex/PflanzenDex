-- module: account
-- US-ONB-05, DM-ONB-02, P-04, P-05, P-10: the keeper's decision to open a staged function ("Jetzt freischalten"), one row
-- per account and function. Only the decision is stored; the lock state itself stays derived (NFR-04). `unlocked_on` is a
-- local calendar date (NFR-08). Rows are never deleted by the app. Forward-only (expand): the previous app version does not
-- know the table and keeps working. The row rule is the generic one of every tenant table (`tenant_protection`).

create table account_unlock (
  account_id uuid not null references account(id) on delete cascade,
  function_id text not null check (function_id ~ '^[a-z][a-z_]{0,39}$'),
  unlocked_on date not null,
  source text not null check (source in ('tap', 'style_many', 'existing_data')),
  primary key (account_id, function_id)
);
select tenant_protection('account_unlock');
