-- module: social
-- The "seen" state of "Neu bei Freunden" (US-SOZ-06, DM-SOZ-04, P-04, P-05, FR-SOZ-03).
-- 1. `feed_seen`: one row per account, the instant up to which the account has seen what friends share. No row means
--    the feed was never opened: the first visit creates the row silently, so a new account gets no banner for
--    everything that was shared before it looked.
-- 2. `friend_shares_since()`: like `friend_shares()` (US-SOZ-04, kept as it is, expand/contract: the previous app
--    version still calls it) plus `visible_since`, the instant the specimen became visible to the caller: the later of the
--    moment it was shared and the start of the friendship. "New since my last visit" means visible since then, not caught
--    since then: an old specimen that is shared today is new to me today, and a friend I made today shows everything as new.
-- Forward-only: the previous app version does not know the table or the function.

create table feed_seen (
  account_id uuid primary key references account(id) on delete cascade,
  seen_at timestamptz not null default now()
);
select tenant_protection('feed_seen');

create function friend_shares_since(p_owner uuid)
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
        from public.sharing s order by s.created_at, s.specimen_id;
  end if;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

revoke all on function friend_shares_since(uuid) from public;
grant execute on function friend_shares_since(uuid) to pflanzendex_app;
