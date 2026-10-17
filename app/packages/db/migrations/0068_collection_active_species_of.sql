-- module: collection
-- US-POK-14, P-04, P-05: which species do the given accounts own with an active specimen? One distinct row per account
-- and species. `specimen` has forced row security, so the application role cannot read other accounts' rows. This checked
-- function runs as the owner and reads each asked account under that account's own row rule (it sets the session account
-- per ID and restores the caller's afterwards, like `friend_shares()` of migration 0030); no extra select rule is added,
-- so nothing else sees more. It answers only for the account IDs it is given: the caller passes the accounts that
-- consented to the rarity in PflanzenDex (migration 0067) and turns the rows into counts; no response names an account.
-- Archived specimens do not count (the same rule as everywhere, US-BES-07).
-- Expand only: a new function; the previous app version ignores it.

create function active_species_of(p_accounts uuid[]) returns table (account_id uuid, species_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  mine text := nullif(current_setting('app.account_id', true), '');
  one uuid;
begin
  foreach one in array p_accounts loop
    perform set_config('app.account_id', one::text, true);
    return query select distinct s.account_id, s.species_id from public.specimen s where s.status <> 'archived';
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

revoke all on function active_species_of(uuid[]) from public;
grant execute on function active_species_of(uuid[]) to pflanzendex_app;
