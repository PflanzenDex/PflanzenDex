-- module: equipment
-- US-EQU-12, P-04, P-05, QG-D1 (#907): `friend_equipment()` no longer depends on row security for the account it reads.
-- It is `security definer`; when the owner of the tables bypasses row security (a superuser, as the cluster user of the
-- Docker image and of `make dev` is), `select ... from equipment where shared` returned the shared equipment of EVERY
-- account as soon as the caller had one mutual friendship. The read now names the owner (`e.account_id = p_owner`), so
-- the result is the same under a superuser and under a plain owner. Same signature and columns, behaviour with a plain
-- owner unchanged: the previous app version keeps working. Grants stay as they are.

create or replace function friend_equipment(p_owner uuid)
returns table (equipment_id uuid, type text, name text, model text, lux_ceiling integer, note text)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
begin
  if me is null then
    raise exception 'Reading shared equipment needs an account' using errcode = '42501';
  end if;
  if not exists (select from public.friendship
                  where account_id = me and other_id = p_owner and status = 'confirmed') then
    return;
  end if;
  perform set_config('app.account_id', p_owner::text, true);
  if exists (select from public.friendship
              where account_id = p_owner and other_id = me and status = 'confirmed') then
    return query
      select e.id, e.type, e.name, e.model, z.lux_ceiling, e.share_note
        from public.equipment e
        left join public.light_zone z on z.account_id = e.account_id and z.id = e.light_zone_id
       where e.account_id = p_owner and e.shared and e.status is distinct from 'retired'
       order by lower(e.name), e.id;
  end if;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;
