-- module: social
-- US-SOZ-04, US-SOZ-05, P-04, P-05, QG-D1 (#907): `friend_shares()` and `friend_shares_since()` no longer depend on row
-- security for the account they read. Both are `security definer`; when the owner of the tables bypasses row security
-- (a superuser, as the cluster user of the Docker image and of `make dev` is), `select ... from sharing` returned the
-- sharing rows of EVERY account as soon as the caller had one mutual friendship. The read now names the owner
-- (`s.account_id = p_owner`), so the result is the same under a superuser and under a plain owner. Same signatures and
-- columns, behaviour with a plain owner unchanged: the previous app version keeps working. Grants stay as they are.

create or replace function friend_shares(p_owner uuid)
returns table (specimen_id uuid, share_photos boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
begin
  if me is null then
    raise exception 'Reading shared specimens needs an account' using errcode = '42501';
  end if;
  if not exists (select from public.friendship
                  where account_id = me and other_id = p_owner and status = 'confirmed') then
    return;
  end if;
  perform set_config('app.account_id', p_owner::text, true);
  if exists (select from public.friendship
              where account_id = p_owner and other_id = me and status = 'confirmed') then
    return query
      select s.specimen_id, s.share_photos from public.sharing s
       where s.account_id = p_owner order by s.created_at, s.specimen_id;
  end if;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

create or replace function friend_shares_since(p_owner uuid)
returns table (specimen_id uuid, share_photos boolean, visible_since timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  started timestamptz;
begin
  if me is null then
    raise exception 'Reading shared specimens needs an account' using errcode = '42501';
  end if;
  select f.since into started from public.friendship f
   where f.account_id = me and f.other_id = p_owner and f.status = 'confirmed';
  if not found then
    return;
  end if;
  perform set_config('app.account_id', p_owner::text, true);
  if exists (select from public.friendship
              where account_id = p_owner and other_id = me and status = 'confirmed') then
    return query
      select s.specimen_id, s.share_photos, greatest(s.created_at, coalesce(started, s.created_at))
        from public.sharing s where s.account_id = p_owner order by s.created_at, s.specimen_id;
  end if;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;
