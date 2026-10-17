-- module: account
-- US-POK-14, US-ACC-02, P-04, P-05: the global consent of an account to count in the rarity in PflanzenDex (the share of
-- participating accounts that own a species). Off until the keeper switches it on (decided by the PO). One column next to
-- the other settings of `account_data`, written through `account.update_profile`; the row rule of the table applies.
-- `rarity_participants()` lists the accounts that consented: `account_data` has forced row security, so the application
-- role cannot see other accounts' rows, and only this checked function (it runs as the owner, which may read the table
-- through the select rule `owner_count` of migration 0023) gives the list. It returns account IDs of consenting
-- accounts and nothing else; the application only ever turns them into counts.
-- Expand only: a column with a default and a new function; the previous app version ignores both.

alter table account_data add column rarity_consent boolean not null default false;

create function rarity_participants() returns table (account_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select d.account_id from public.account_data d where d.rarity_consent order by d.account_id
$$;

revoke all on function rarity_participants() from public;
grant execute on function rarity_participants() to pflanzendex_app;
