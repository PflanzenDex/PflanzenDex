-- module: social
-- Answer a friendship request (US-SOZ-02, DM-SOZ-01, P-04, P-05, P-10).
-- 1. Status `declined`: set on both rows when the receiver declines. The receiver's list shows nothing of it; the
--    sender sees only "not accepted" (no reason, no name beyond the one it already knows). A later request with a new
--    code replaces it (`request_friendship()` treats `declined` like `ended`).
-- 2. `answer_friendship()`: the receiver accepts or declines in one transaction on both sides (FR-SOZ-06). Like
--    `request_friendship()` it writes the other side's row as that account, by switching the account inside the function.
-- Forward-only: the previous app version never writes the new status and keeps working.

alter table friendship drop constraint friendship_status_check;
alter table friendship add constraint friendship_status_check
  check (status in ('requested', 'confirmed', 'ended', 'declined'));

-- Redeems a code as the calling account and creates the request on both sides, in one transaction (FR-SOZ-06).
-- Outcome: `requested` (new request, or the same account redeeming the same code again: the existing request is
-- returned and nothing is written twice), `unknown_code`, `code_used`, `code_expired`, `own_code` (no
-- self-invitation) or `already_linked` (a request or friendship between the two exists in either direction: no second
-- request). A refused redemption does not use the code up. After an ended or declined friendship a new request is allowed
-- (assumption, decided by the PO): the old rows are reused. The conditional lock `for update` makes exactly one of
-- several concurrent redemptions win.
create or replace function request_friendship(p_code text)
returns table (outcome text, request_id uuid, other_name text, requested_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  c public.friend_code;
  my_name text;
  their_name text;
  f public.friendship;
  have_row boolean;
begin
  if me is null then
    raise exception 'Redeeming a friend code needs an account' using errcode = '42501';
  end if;
  select * into c from public.friend_code where code_hash = sha256(convert_to(p_code, 'UTF8')) for update;
  if not found then
    return query select 'unknown_code'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if c.created_by = me then
    return query select 'own_code'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  select * into f from public.friendship where account_id = me and other_id = c.created_by;
  have_row := found;
  if c.redeemed_at is not null then
    if c.redeemed_by = me and have_row and f.status = 'requested' then
      return query select 'requested'::text, f.id, f.other_name, f.requested_at;
    else
      return query select 'code_used'::text, null::uuid, null::text, null::timestamptz;
    end if;
    return;
  end if;
  if c.expires_at <= now() then
    return query select 'code_expired'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  if have_row and f.status in ('requested', 'confirmed') then
    return query select 'already_linked'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;
  select d.display_name into my_name from public.account_data d where d.account_id = me;
  -- The other side's name and row are read and written as that account, then the caller's account is restored.
  perform set_config('app.account_id', c.created_by::text, true);
  select d.display_name into their_name from public.account_data d where d.account_id = c.created_by;
  insert into public.friendship (account_id, other_id, other_name, direction)
  values (c.created_by, me, my_name, 'received')
  on conflict (account_id, other_id)
  do update set other_name = excluded.other_name, direction = 'received', status = 'requested',
                requested_at = now(), since = null;
  perform set_config('app.account_id', coalesce(mine, ''), true);
  insert into public.friendship (account_id, other_id, other_name, direction)
  values (me, c.created_by, their_name, 'sent')
  on conflict (account_id, other_id)
  do update set other_name = excluded.other_name, direction = 'sent', status = 'requested',
                requested_at = now(), since = null
  returning * into f;
  update public.friend_code set redeemed_at = now(), redeemed_by = me where id = c.id;
  return query select 'requested'::text, f.id, f.other_name, f.requested_at;
end
$$;

-- Accept or decline a request as the receiving account. Outcome: `accepted` or `declined` (also when the request was
-- already answered the same way: nothing is written twice), `not_found` (unknown id, an id of another account and a
-- request this account sent look the same: existence does not leak) or `not_open` (answered the other way already, or
-- the friendship ended).
create function answer_friendship(p_id uuid, p_accept boolean)
returns table (outcome text, answered_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f public.friendship;
  target text := case when p_accept then 'confirmed' else 'declined' end;
  stamp timestamptz := now();
begin
  if me is null then
    raise exception 'Answering a friend request needs an account' using errcode = '42501';
  end if;
  select * into f from public.friendship where id = p_id and account_id = me and direction = 'received' for update;
  if not found then
    return query select 'not_found'::text, null::timestamptz;
    return;
  end if;
  if f.status = target then
    return query select (case when p_accept then 'accepted' else 'declined' end)::text, coalesce(f.since, f.requested_at);
    return;
  end if;
  if f.status <> 'requested' then
    return query select 'not_open'::text, null::timestamptz;
    return;
  end if;
  update public.friendship set status = target, since = case when p_accept then stamp else null end where id = f.id;
  perform set_config('app.account_id', f.other_id::text, true);
  update public.friendship set status = target, since = case when p_accept then stamp else null end
   where account_id = f.other_id and other_id = me;
  perform set_config('app.account_id', coalesce(mine, ''), true);
  return query select (case when p_accept then 'accepted' else 'declined' end)::text, stamp;
end
$$;

revoke all on function answer_friendship(uuid, boolean) from public;
grant execute on function answer_friendship(uuid, boolean) to pflanzendex_app;
