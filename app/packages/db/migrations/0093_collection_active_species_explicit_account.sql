-- module: collection
-- US-POK-14, P-04, P-05, QG-D1 (#907): `active_species_of()` no longer depends on row security for the account it reads.
-- It is `security definer` and answers only for the account ids it is given, by switching the session account per id;
-- when the owner of the tables bypasses row security (a superuser, as the cluster user of the Docker image and of
-- `make dev` is), `select ... from specimen` returned the species of EVERY account for each asked id, so the rarity
-- count could include accounts that never consented. The read now names the asked account (`s.account_id = one`), so
-- the result is the same under a superuser and under a plain owner. Same signature and columns, behaviour with a plain
-- owner unchanged: the previous app version keeps working. Grants stay as they are.

create or replace function active_species_of(p_accounts uuid[]) returns table (account_id uuid, species_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  mine text := nullif(current_setting('app.account_id', true), '');
  one uuid;
begin
  foreach one in array p_accounts loop
    perform set_config('app.account_id', one::text, true);
    return query
      select distinct s.account_id, s.species_id from public.specimen s
       where s.account_id = one and s.status <> 'archived';
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;
