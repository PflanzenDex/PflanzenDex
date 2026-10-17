-- module: equipment
-- US-EQU-12, FR-EQU-02, P-04, P-05: sharing of a piece of equipment with friends. `shared = false` (the default) means
-- private, so all equipment is private and nothing has to be decided. `share_note` is the free-text experience note a
-- friend sees; it exists only while shared, and withdrawing clears it. The global switch "Everything private" suspends
-- all sharing when friends read (not here).
-- `friend_equipment()` is the only way to read the shared equipment of another account: like `friend_shares()` it
-- returns rows only while both sides of the friendship are confirmed, and only the whitelist (US-EQU-12): type, name,
-- model, the light level of a lamp's zone (its lux ceiling) and the note. Never price, place of purchase, serial number,
-- location or purchase date. Retired devices are not listed. Forward-only and additive: the previous app version
-- ignores the columns.

alter table equipment add column shared boolean not null default false;
alter table equipment add column share_note text check (char_length(share_note) between 1 and 300);
alter table equipment add constraint equipment_share_note_shared_only check (share_note is null or shared);

create function friend_equipment(p_owner uuid)
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
       where e.shared and e.status is distinct from 'retired'
       order by lower(e.name), e.id;
  end if;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

revoke all on function friend_equipment(uuid) from public;
grant execute on function friend_equipment(uuid) to pflanzendex_app;
