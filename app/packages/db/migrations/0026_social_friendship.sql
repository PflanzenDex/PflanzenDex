-- module: social
-- Friendship requests by invitation code (US-SOZ-01, DM-SOZ-01, FR-SOZ-08, P-04, P-05).
-- 1. `friend_code`: single-use friend codes that expire after 7 days. Like `invitation` (US-ACC-05) the table is not tenant
--    data: a code is looked up by its hash across all accounts, which a row rule on `account_id` cannot allow. The
--    application role has no rights on it and reaches it only through the two functions below. Only the SHA-256 hash
--    is stored (the code is 120 bits of CSPRNG output).
-- 2. `friendship`: one row per side, so every account sees exactly its own side under the normal row rule
--    (`account_id` is the owner of the row). The row of the other side is written by `request_friendship()` in the
--    same transaction, as that account for the duration of the statements (the display names of both sides are stored
--    on the rows, DM-SOZ-01). Before acceptance (US-SOZ-02) nothing but the display name is stored or visible.
-- Forward-only: the previous app version does not know the tables and keeps working.

create table friend_code (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  created_by uuid not null references account(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references account(id) on delete set null,
  check (expires_at > created_at),
  check (redeemed_by is null or redeemed_at is not null)
);
revoke all on friend_code from public;
-- Row security on without any policy: even a wrongly granted right would show no row. Only ENABLE, not FORCE: the
-- `security definer` functions below run as the table owner and must keep working when the owner is not a superuser.
alter table friend_code enable row level security;

create table friendship (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  other_id uuid not null references account(id) on delete cascade,
  -- Display name of the other side as stored at the time of the request; `null` = the other side has none (P-08).
  other_name text check (char_length(other_name) between 1 and 80),
  -- `sent`: this account redeemed a code of the other side; `received`: the other side redeemed this account's code.
  direction text not null check (direction in ('sent', 'received')),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'ended')),
  requested_at timestamptz not null default now(),
  -- Set when the request is accepted (US-SOZ-02).
  since timestamptz,
  check (account_id <> other_id),
  unique (account_id, other_id)
);
-- The open requests of an account, newest first.
create index friendship_requested on friendship (account_id, requested_at desc) where status = 'requested';
select tenant_protection('friendship');

-- Creates a code for the calling account. The code arrives in plain text only here and is hashed immediately: 24
-- characters of the code alphabet, expiry within the next 8 days (core uses 7; the extra day absorbs clock differences).
create function create_friend_code(p_code text, p_expires_at timestamptz)
returns table (id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if current_account() is null then
    raise exception 'Creating a friend code needs an account' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{24}$' then
    raise exception 'Friend code has the wrong format' using errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '8 days' then
    raise exception 'Friend code expiry out of range' using errcode = '22023';
  end if;
  return query
    insert into public.friend_code (code_hash, created_by, expires_at)
    values (sha256(convert_to(p_code, 'UTF8')), current_account(), p_expires_at)
    returning friend_code.id, friend_code.expires_at;
end
$$;

-- Redeems a code as the calling account and creates the request on both sides, in one transaction (FR-SOZ-06).
-- Outcome: `requested` (new request, or the same account redeeming the same code again: the existing request is
-- returned and nothing is written twice), `unknown_code`, `code_used`, `code_expired`, `own_code` (no
-- self-invitation) or `already_linked` (a request or friendship between the two exists in either direction: no second
-- request). A refused redemption does not use the code up. After an ended friendship a new request is allowed
-- (assumption, decided by the PO): the old rows are reused. The conditional lock `for update` makes exactly one of
-- several concurrent redemptions win.
create function request_friendship(p_code text)
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
  if have_row and f.status <> 'ended' then
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

revoke all on function create_friend_code(text, timestamptz), request_friendship(text) from public;
grant execute on function create_friend_code(text, timestamptz), request_friendship(text) to pflanzendex_app;
