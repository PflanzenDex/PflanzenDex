-- module: account
-- Access by invitation only (US-ACC-05, P-03, P-04, P-05, P-08, NFR-16).
-- 1. `invitation`: single-use, expiring codes. Only the SHA-256 hash of a code is stored (the code is 120 bits of
--    CSPRNG output, so a plain hash is enough and a leaked database holds no usable codes). Lookup is by equality on
--    the hash: the code is never compared in application code and a timing difference reveals nothing about it.
-- 2. `access_setting`: one row, whether registration needs a code. Off by default: nothing changes for existing
--    installations until the operator switches it on.
-- 3. `account_data.last_active_at`: when the account last opened the app; the only source of "active users".
-- Neither table is tenant data (no account id): the application role has no rights on them and reaches them only
-- through the functions below, which check the operator role in the database again (like `account_role`).

create table invitation (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  created_by uuid references account(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  check (expires_at > created_at)
);
revoke all on invitation from public;

create table access_setting (
  id boolean primary key default true check (id),
  invitation_only boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into access_setting default values;
revoke all on access_setting from public;

alter table account_data add column last_active_at timestamptz;

-- Whether the caller is the installation operator (a reviewer is not).
create function is_operator() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select from account_role where account = current_account() and role = 'operator') $$;

-- Needed before an account exists (sign-in of an unknown subject), so no operator check: it reveals one boolean.
create function invitation_required() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select invitation_only from access_setting $$;

create function set_invitation_only(p_on boolean) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator changes the registration mode' using errcode = '42501';
  end if;
  update access_setting set invitation_only = p_on, updated_at = now();
end
$$;

-- The code arrives in plain text only here and is hashed immediately. 24 characters of the code alphabet, expiry
-- within the next 31 days (core allows 30; the extra day absorbs clock differences).
create function create_invitation(p_code text, p_expires_at timestamptz)
returns table (id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator creates invitations' using errcode = '42501';
  end if;
  if p_code is null or p_code !~ '^[0-9A-HJKMNP-TV-Z]{24}$' then
    raise exception 'Invitation code has the wrong format' using errcode = '22023';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '31 days' then
    raise exception 'Invitation expiry out of range' using errcode = '22023';
  end if;
  return query
    insert into invitation (code_hash, created_by, expires_at)
    values (sha256(convert_to(p_code, 'UTF8')), current_account(), p_expires_at)
    returning invitation.id, invitation.expires_at;
end
$$;

-- Uses a code up: one conditional update, so of any number of concurrent calls exactly one wins (the others wait for
-- the row lock, then see `redeemed_at` set). Runs only in the registration path, which sets `app.subject`.
create function redeem_invitation(p_code text) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if nullif(current_setting('app.subject', true), '') is null then
    raise exception 'Redeeming needs a verified subject' using errcode = '42501';
  end if;
  update invitation set redeemed_at = now()
   where code_hash = sha256(convert_to(p_code, 'UTF8')) and redeemed_at is null and expires_at > now();
  return found;
end
$$;

-- Counts only (P-05): no account, no row of any user table leaves this function.
create function operator_overview(p_window_days integer)
returns table (accounts integer, active_accounts integer, invitation_only boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the overview' using errcode = '42501';
  end if;
  return query select
    (select count(*)::integer from account),
    (select count(*)::integer from account_data
      where last_active_at >= now() - make_interval(days => p_window_days)),
    (select s.invitation_only from access_setting s);
end
$$;

-- The latest invitations with their state, never a code and never who used it (limit 100: assumption, starting value).
create function list_invitations()
returns table (id uuid, created_at timestamptz, expires_at timestamptz, redeemed_at timestamptz, status text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the invitations' using errcode = '42501';
  end if;
  return query
    select i.id, i.created_at, i.expires_at, i.redeemed_at,
           case when i.redeemed_at is not null then 'redeemed'
                when i.expires_at <= now() then 'expired' else 'open' end
      from invitation i order by i.created_at desc, i.id limit 100;
end
$$;

revoke all on function is_operator(), invitation_required(), set_invitation_only(boolean),
  create_invitation(text, timestamptz), redeem_invitation(text), operator_overview(integer),
  list_invitations() from public;
grant execute on function is_operator(), invitation_required(), set_invitation_only(boolean),
  create_invitation(text, timestamptz), redeem_invitation(text), operator_overview(integer),
  list_invitations() to pflanzendex_app;
