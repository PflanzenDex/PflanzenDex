-- module: wishlist
-- US-TAU-05, DM-TAU-02, P-04, P-05, FR-WUN-07: the wish flag "visible to friends as wanted".
-- Private by default: the flag is false until the owner sets it, per wish, and the owner takes it back at any time. Only
-- a plant wish can carry it. Forward-only (expand): a column with a default; the previous app version never reads it.
alter table wish add column visible_to_friends boolean not null default false;
alter table wish add constraint wish_visible_only_plant check (not visible_to_friends or type = 'plant');

-- The only way a friend learns anything about a wish: the question "does this friend want one of these species?". The
-- caller passes folded species names (the `name_key` of its own open offers); the answer lists, per confirmed friend,
-- only the keys among them that the friend deliberately marked (open plant wish, flag set). The wishlist itself is never
-- returned (FR-WUN-07); nothing is returned for a stranger, a pending or one-sided friendship, or a friend who has
-- "Everything private" on, so the answer gives no sign of who exists (P-05). Each friend's rows are read as that friend
-- (the account is switched inside and restored at the end), like friend_offers().
create function friend_wants(p_keys text[])
returns table (owner_id uuid, name_key text)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f record;
begin
  if me is null then
    raise exception 'Reading wanted species of friends needs an account' using errcode = '42501';
  end if;
  if p_keys is null or cardinality(p_keys) = 0 then
    return;
  end if;
  for f in select fr.other_id from public.friendship fr
            where fr.account_id = me and fr.status = 'confirmed' order by fr.other_id loop
    perform set_config('app.account_id', f.other_id::text, true);
    if exists (select from public.friendship where account_id = f.other_id and other_id = me and status = 'confirmed')
       and not exists (select from public.account_data where account_id = f.other_id and everything_private) then
      return query
        select f.other_id, w.name_key
          from public.wish w
         where w.account_id = f.other_id and w.type = 'plant' and w.status = 'wishlist'
           and w.visible_to_friends and w.name_key = any (p_keys)
         order by w.name_key;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;
revoke all on function friend_wants(text[]) from public;
grant execute on function friend_wants(text[]) to pflanzendex_app;
