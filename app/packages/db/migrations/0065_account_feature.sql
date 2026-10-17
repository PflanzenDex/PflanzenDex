-- module: account
-- US-DEV-06, P-04, P-10: the operator opens a function group (social, ai, recommendations) for single accounts, next to
-- the global switch of the environment variable FEATURES. A row means "on for this account"; no row means off (the default).
-- Switching off deletes only the row: the data of the function stays untouched. Like `account_role` it is the operator's
-- job, not the application's: the application role has no rights on the table and reads only its own rows through
-- features_of_account(). The operator sets a switch in the database console:
--   insert into account_feature (account, feature) values ('<account id>', 'social');
-- Forward-only (expand): a new table and a new function; the previous app version does not know them and keeps working.

create table account_feature (
  account uuid not null references account(id) on delete cascade,
  feature text not null check (feature in ('social', 'ai', 'recommendations')),
  created_at timestamptz not null default now(),
  primary key (account, feature)
);
revoke all on account_feature from public;
alter table account_feature enable row level security;

-- Only the switches of the session's account, never those of other accounts. Runs with owner rights (security definer).
create function features_of_account() returns setof text
language sql stable security definer set search_path = public, pg_temp
as $$ select feature from account_feature where account = current_account() order by feature $$;

revoke all on function features_of_account() from public;
grant execute on function features_of_account() to pflanzendex_app;
