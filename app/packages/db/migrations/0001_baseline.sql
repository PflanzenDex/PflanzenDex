-- module: all
-- PflanzenDex schema, baseline (US-DEV-07, owner decision d-122, issue 2519).
-- Replaces the migrations 0001 to 0120 (deleted; their history is in git). Built as the chain built it: the same
-- tables, columns, constraints, indexes, row rules (policies), triggers, functions, grants and the two reference rows.
-- Order: roles, functions, then per module its tables with constraints, indexes, row security, triggers and grants,
-- then the foreign keys in the order the chain created them (refused deletes name the same constraint), then the row
-- rules by module (they may read other modules' tables). A function belongs to the module of the table its body names most.
-- The tenant rules are the policies of tables with an account_id (P-04); see docs/guides/reference/app.md.

set lock_timeout = '5s';
set statement_timeout = '10min';
-- As pg_dump sets it: a plpgsql declaration may name a table that the baseline creates further down.
set check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- Roles: the application role (no login, no BYPASSRLS) and the membership of the migrating owner
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'pflanzendex_app') then
    create role pflanzendex_app nologin;
  end if;
end
$$;
grant pflanzendex_app to current_user;

-- ---------------------------------------------------------------------------
-- Functions by module (security definer ones are registered in security-definer-inventory.test.ts)
-- ---------------------------------------------------------------------------

-- module kernel: functions

-- function cancel_orphaned_swaps
CREATE FUNCTION public.cancel_orphaned_swaps() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  s record;
  n integer := 0;
begin
  if me is null then
    raise exception 'Canceling swaps needs an account' using errcode = '42501';
  end if;
  for s in select swap_id, other_id, role, offer_id, status from public.swap
            where account_id = me and status in ('requested', 'accepted') loop
    if public.friendship_holds(s.other_id) then
      continue;
    end if;
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'friendship_ended', null);
    if s.status = 'accepted' then
      perform public.reopen_offer(case when s.role = 'giver' then me else s.other_id end, s.offer_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;;
REVOKE ALL ON FUNCTION public.cancel_orphaned_swaps() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_orphaned_swaps() TO pflanzendex_app;

-- function cancel_swaps_for_offer
CREATE FUNCTION public.cancel_swaps_for_offer(p_offer uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  s record;
  n integer := 0;
begin
  if me is null then
    raise exception 'Canceling swaps needs an account' using errcode = '42501';
  end if;
  for s in select swap_id, other_id from public.swap
            where account_id = me and role = 'giver' and offer_id = p_offer and status in ('requested', 'accepted') loop
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'offer_withdrawn', null);
    n := n + 1;
  end loop;
  return n;
end
$$;;
REVOKE ALL ON FUNCTION public.cancel_swaps_for_offer(p_offer uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_swaps_for_offer(p_offer uuid) TO pflanzendex_app;

-- function current_account
CREATE FUNCTION public.current_account() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;;

-- function erase_account
CREATE FUNCTION public.erase_account() RETURNS TABLE(subject text, requested_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  r public.account_deletion;
  who text;
begin
  if me is null then
    raise exception 'Deleting an account needs an account' using errcode = '42501';
  end if;
  select * into r from public.account_deletion where account_id = me;
  if not found then
    raise exception 'No deletion was requested' using errcode = '42501';
  end if;
  if r.due_at > now() then
    raise exception 'The grace period has not ended yet' using errcode = '42501';
  end if;
  perform public.cancel_swaps_of_deleted_account();
  perform public.erase_catalog_contributions();
  select a.subject into who from public.account a where a.id = me;
  delete from public.account where id = me;
  insert into public.deletion_log (requested_at, subject) values (r.requested_at, who);
  return query select who, r.requested_at;
end
$$;;
REVOKE ALL ON FUNCTION public.erase_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.erase_account() TO pflanzendex_app;

-- function features_of_account
CREATE FUNCTION public.features_of_account() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ select feature from account_feature where account = current_account() order by feature $$;;
REVOKE ALL ON FUNCTION public.features_of_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.features_of_account() TO pflanzendex_app;

-- function is_operator
CREATE FUNCTION public.is_operator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ select exists (select from public.account_role where account = current_account() and role = 'operator') $$;;
REVOKE ALL ON FUNCTION public.is_operator() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_operator() TO pflanzendex_app;

-- function is_reviewer
CREATE FUNCTION public.is_reviewer() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ select exists (select from account_role where account = current_account()) $$;;
REVOKE ALL ON FUNCTION public.is_reviewer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_reviewer() TO pflanzendex_app;

-- function operator_deletion_queue
CREATE FUNCTION public.operator_deletion_queue() RETURNS TABLE(kind text, entry_id uuid, requested_at timestamp with time zone, subject text, completed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not public.is_operator() then
    raise exception 'Only the operator may see the deletion queue' using errcode = '42501';
  end if;
  return query select * from public.deletion_deadline_rows();
end
$$;;
REVOKE ALL ON FUNCTION public.operator_deletion_queue() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operator_deletion_queue() TO pflanzendex_app;

-- function operator_introduction
CREATE FUNCTION public.operator_introduction(p_window_days integer, p_settle_days integer) RETURNS TABLE(accounts integer, settled integer, settled_without_plant integer, with_plant integer, median_seconds integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  min_accounts constant integer := 5;
  mine text := nullif(current_setting('app.account_id', true), '');
  r record;
  first_plant timestamptz;
  n_accounts integer := 0;
  n_settled integer := 0;
  n_settled_without integer := 0;
  n_with_plant integer := 0;
  seconds double precision[] := '{}';
  median integer;
begin
  if not is_operator() then
    raise exception 'Only the operator sees the figures of the introduction' using errcode = '42501';
  end if;
  for r in select a.id, a.created_at from public.account a
            where a.created_at >= now() - make_interval(days => p_window_days) loop
    perform set_config('app.account_id', r.id::text, true);
    select min(s.created_at) into first_plant from public.specimen s where s.account_id = r.id;
    n_accounts := n_accounts + 1;
    if r.created_at <= now() - make_interval(days => p_settle_days) then
      n_settled := n_settled + 1;
      if first_plant is null then n_settled_without := n_settled_without + 1; end if;
    end if;
    if first_plant is not null then
      n_with_plant := n_with_plant + 1;
      seconds := seconds || extract(epoch from (first_plant - r.created_at));
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
  if n_with_plant >= min_accounts then
    select round(percentile_cont(0.5) within group (order by x))::integer into median from unnest(seconds) as x;
  end if;
  return query select
    case when n_accounts >= min_accounts then n_accounts end,
    case when n_settled >= min_accounts then n_settled end,
    case when n_settled >= min_accounts then n_settled_without end,
    case when n_with_plant >= min_accounts then n_with_plant end,
    median;
end
$$;;
REVOKE ALL ON FUNCTION public.operator_introduction(p_window_days integer, p_settle_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operator_introduction(p_window_days integer, p_settle_days integer) TO pflanzendex_app;

-- function reminder_accounts
CREATE FUNCTION public.reminder_accounts() RETURNS TABLE(account_id uuid, time_zone text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  one uuid;
  zone text;
  mine text := nullif(current_setting('app.account_id', true), '');
begin
  for one in select id from public.account order by id loop
    perform set_config('app.account_id', one::text, true);
    select d.time_zone into zone from public.account_data d where d.account_id = one;
    if zone is not null then
      account_id := one;
      time_zone := zone;
      return next;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;;
REVOKE ALL ON FUNCTION public.reminder_accounts() FROM PUBLIC;

-- function roles_of_account
CREATE FUNCTION public.roles_of_account() RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ select role from account_role where account = current_account() order by role $$;;
REVOKE ALL ON FUNCTION public.roles_of_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.roles_of_account() TO pflanzendex_app;

-- function species_guard
CREATE FUNCTION public.species_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.created_by <> 'user' and not is_reviewer() then
    raise exception 'Created by % may only be given by an operator or reviewer', new.created_by using errcode = '42501';
  end if;
  new.version := 1;
  return new;
end
$$;;

-- function tenant_protection
CREATE FUNCTION public.tenant_protection(table_name regclass, id_column name DEFAULT 'account_id'::name) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  execute format('alter table %s enable row level security', table_name);
  execute format('alter table %s force row level security', table_name);
  execute format(
    'create policy tenant on %s using (%I = current_account()) with check (%I = current_account())',
    table_name, id_column, id_column
  );
  execute format('grant select, insert, update, delete on %s to pflanzendex_app', table_name);
end
$$;;

-- module account: functions

-- function create_invitation
CREATE FUNCTION public.create_invitation(p_code text, p_expires_at timestamp with time zone) RETURNS TABLE(id uuid, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
    insert into public.invitation (code_hash, created_by, expires_at)
    values (sha256(convert_to(p_code, 'UTF8')), current_account(), p_expires_at)
    returning invitation.id, invitation.expires_at;
end
$_$;;
REVOKE ALL ON FUNCTION public.create_invitation(p_code text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_invitation(p_code text, p_expires_at timestamp with time zone) TO pflanzendex_app;

-- function invitation_required
CREATE FUNCTION public.invitation_required() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ select invitation_only from public.access_setting $$;;
REVOKE ALL ON FUNCTION public.invitation_required() FROM PUBLIC;
GRANT ALL ON FUNCTION public.invitation_required() TO pflanzendex_app;

-- function list_invitations
CREATE FUNCTION public.list_invitations() RETURNS TABLE(id uuid, created_at timestamp with time zone, expires_at timestamp with time zone, redeemed_at timestamp with time zone, status text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the invitations' using errcode = '42501';
  end if;
  return query
    select i.id, i.created_at, i.expires_at, i.redeemed_at,
           case when i.redeemed_at is not null then 'redeemed'
                when i.expires_at <= now() then 'expired' else 'open' end
      from public.invitation i order by i.created_at desc, i.id limit 100;
end
$$;;
REVOKE ALL ON FUNCTION public.list_invitations() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_invitations() TO pflanzendex_app;

-- function operator_cost
CREATE FUNCTION public.operator_cost() RETURNS TABLE(amount_cents bigint, currency text, month date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the operating cost' using errcode = '42501';
  end if;
  return query select c.amount_cents, c.currency, c.month from public.operator_cost c;
end
$$;;
REVOKE ALL ON FUNCTION public.operator_cost() FROM PUBLIC;
GRANT ALL ON FUNCTION public.operator_cost() TO pflanzendex_app;

-- function operator_overview
CREATE FUNCTION public.operator_overview(p_window_days integer) RETURNS TABLE(accounts integer, active_accounts integer, invitation_only boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the overview' using errcode = '42501';
  end if;
  return query select
    (select count(*)::integer from public.account),
    (select count(*)::integer from public.account_data
      where last_active_at >= now() - make_interval(days => p_window_days)),
    (select s.invitation_only from public.access_setting s);
end
$$;;
REVOKE ALL ON FUNCTION public.operator_overview(p_window_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operator_overview(p_window_days integer) TO pflanzendex_app;

-- function rarity_participants
CREATE FUNCTION public.rarity_participants() RETURNS TABLE(account_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select d.account_id from public.account_data d where d.rarity_consent order by d.account_id
$$;;
REVOKE ALL ON FUNCTION public.rarity_participants() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rarity_participants() TO pflanzendex_app;

-- function redeem_invitation
CREATE FUNCTION public.redeem_invitation(p_code text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if nullif(current_setting('app.subject', true), '') is null then
    raise exception 'Redeeming needs a verified subject' using errcode = '42501';
  end if;
  update public.invitation set redeemed_at = now()
   where code_hash = sha256(convert_to(p_code, 'UTF8')) and redeemed_at is null and expires_at > now();
  return found;
end
$$;;
REVOKE ALL ON FUNCTION public.redeem_invitation(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_invitation(p_code text) TO pflanzendex_app;

-- function set_invitation_only
CREATE FUNCTION public.set_invitation_only(p_on boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_operator() then
    raise exception 'Only the operator changes the registration mode' using errcode = '42501';
  end if;
  update public.access_setting set invitation_only = p_on, updated_at = now();
end
$$;;
REVOKE ALL ON FUNCTION public.set_invitation_only(p_on boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_invitation_only(p_on boolean) TO pflanzendex_app;

-- function set_operator_cost
CREATE FUNCTION public.set_operator_cost(p_amount_cents bigint, p_currency text, p_month date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_operator() then
    raise exception 'Only the operator enters the operating cost' using errcode = '42501';
  end if;
  if p_month > date_trunc('month', now() at time zone 'UTC')::date then
    raise exception 'The cost month lies in the future' using errcode = '22023';
  end if;
  update public.operator_cost
     set amount_cents = p_amount_cents, currency = p_currency, month = p_month, updated_at = now();
end
$$;;
REVOKE ALL ON FUNCTION public.set_operator_cost(p_amount_cents bigint, p_currency text, p_month date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_operator_cost(p_amount_cents bigint, p_currency text, p_month date) TO pflanzendex_app;

-- module catalog: functions

-- function accept_catalog_correction
CREATE FUNCTION public.accept_catalog_correction(p_id uuid) RETURNS TABLE(outcome text, version integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  c catalog_correction%rowtype;
  v integer;
begin
  if not is_reviewer() then
    raise exception 'Only operators or reviewers accept corrections' using errcode = '42501';
  end if;
  select * into c from catalog_correction where id = p_id for update;
  if not found then
    return query select 'not_found'::text, null::integer;
    return;
  end if;
  if c.status <> 'open' then
    return query select 'decided'::text, null::integer;
    return;
  end if;
  if c.proposed_value is null then
    return query select 'no_value'::text, null::integer;
    return;
  end if;
  if species_status(c.species_id) is distinct from 'curated' and species_status(c.species_id) is distinct from 'reviewed' then
    return query select 'not_found'::text, null::integer;
    return;
  end if;
  execute format('update species set %I = $2, version = version + 1 where id = $1 returning version', c.field)
    into v using c.species_id, c.proposed_value;
  insert into catalog_field_provenance (species_id, field, version, value, origin, citation, set_by)
    values (c.species_id, c.field, v, c.proposed_value, 'community', coalesce(c.source, 'keeper correction: ' || c.reason), current_account());
  perform set_config('app.correction_decision', 'on', true);
  update catalog_correction set status = 'accepted', decided_by = current_account(), decided_at = now() where id = p_id;
  perform set_config('app.correction_decision', 'off', true);
  return query select 'accepted'::text, v;
end
$_$;;
REVOKE ALL ON FUNCTION public.accept_catalog_correction(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_catalog_correction(p_id uuid) TO pflanzendex_app;

-- function catalog_correction_guard
CREATE FUNCTION public.catalog_correction_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
begin
  if tg_op = 'INSERT' then
    -- Whether the species is approved is checked by the operation (core) and again when a reviewer accepts; this
    -- guard reads the old value under the caller's row rules, so a species the caller cannot see yields null.
    execute format('select %I from species where id = $1', new.field) into new.old_value using new.species_id;
    new.status := 'open';
    new.created_at := now();
    new.decided_by := null;
    new.decided_at := null;
    new.decision_reason := null;
    return new;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if current_setting('app.correction_decision', true) is distinct from 'on' then
    raise exception 'A correction is decided by a reviewer only' using errcode = '42501';
  end if;
  if old.status <> 'open' then
    raise exception 'Correction is already decided' using errcode = '42501';
  end if;
  if (new.id, new.account_id, new.species_id, new.field, new.old_value, new.proposed_value, new.reason, new.source, new.created_at)
     is distinct from (old.id, old.account_id, old.species_id, old.field, old.old_value, old.proposed_value, old.reason, old.source, old.created_at) then
    raise exception 'Correction: the content is immutable' using errcode = '42501';
  end if;
  return new;
end
$_$;;

-- function catalog_correction_vote_counts
CREATE FUNCTION public.catalog_correction_vote_counts(p_ids uuid[]) RETURNS TABLE(correction_id uuid, confirmations integer, disputes integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform set_config('app.vote_counts', 'on', true);
  perform set_config('app.correction_lookup', 'on', true);
  return query
    select k.id,
           (select count(*)::integer from catalog_correction_vote v where v.correction_id = k.id and v.vote = 'confirm'),
           (select count(*)::integer from catalog_correction_vote v where v.correction_id = k.id and v.vote = 'dispute')
      from catalog_correction k
     where k.id = any(p_ids) and k.status = 'open'
       and species_status(k.species_id) in ('curated', 'reviewed');
end
$$;;
REVOKE ALL ON FUNCTION public.catalog_correction_vote_counts(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.catalog_correction_vote_counts(p_ids uuid[]) TO pflanzendex_app;

-- function catalog_correction_vote_guard
CREATE FUNCTION public.catalog_correction_vote_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  c catalog_correction%rowtype;
begin
  perform set_config('app.correction_lookup', 'on', true);
  select * into c from catalog_correction where id = new.correction_id;
  perform set_config('app.correction_lookup', 'off', true);
  if c.id is null or c.status <> 'open' then
    raise exception 'Only an open correction can be voted on' using errcode = '42501';
  end if;
  new.updated_at := now();
  if (select count(*) from catalog_correction_vote v
       where v.account_id = new.account_id and v.updated_at > now() - interval '1 hour'
         and v.correction_id <> new.correction_id) >= 50 then
    raise exception 'Too many votes in a short time' using errcode = '54000';
  end if;
  return new;
end
$$;;

-- function erase_catalog_contributions
CREATE FUNCTION public.erase_catalog_contributions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine uuid[];
  n integer;
begin
  if me is null then
    raise exception 'Erasing contributions needs an account' using errcode = '42501';
  end if;
  select coalesce(array_agg(object_id), '{}') into mine from public.review_case
   where account_id = me and object_kind = 'species' and status not in ('curated', 'reviewed');
  perform set_config('app.erasing', me::text, true);
  -- What of the caller still points at these species would block their removal (on delete restrict).
  delete from public.specimen where account_id = me and species_id = any(mine);
  delete from public.care_profile where account_id = me and species_id = any(mine);
  delete from public.species where id = any(mine);
  get diagnostics n = row_count;
  delete from public.review_case where account_id = me and object_kind = 'species' and object_id = any(mine);
  perform set_config('app.erasing', '', true);
  return n;
end
$$;;
REVOKE ALL ON FUNCTION public.erase_catalog_contributions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.erase_catalog_contributions() TO pflanzendex_app;

-- function is_open_proposal
CREATE FUNCTION public.is_open_proposal(p_species uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (
    select from review_case v
     where is_reviewer() and v.object_kind = 'species' and v.object_id = p_species
       and v.status in ('proposal', 'ai_unreviewed'))
$$;;
REVOKE ALL ON FUNCTION public.is_open_proposal(p_species uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_open_proposal(p_species uuid) TO pflanzendex_app;

-- function lock_species_for_merge
CREATE FUNCTION public.lock_species_for_merge(p_species uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_reviewer() then
    raise exception 'Only operators or reviewers merge proposals' using errcode = '42501';
  end if;
  perform 1 from species where id = p_species for update;
  return found;
end
$$;;
REVOKE ALL ON FUNCTION public.lock_species_for_merge(p_species uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lock_species_for_merge(p_species uuid) TO pflanzendex_app;

-- function open_catalog_corrections
CREATE FUNCTION public.open_catalog_corrections() RETURNS TABLE(id uuid, species_id uuid, latin_name text, field text, old_value text, proposed_value text, reason text, source text, status text, created_at timestamp with time zone, decided_at timestamp with time zone, decision_reason text, current_value text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not is_reviewer() then
    raise exception 'Only operators or reviewers read the open corrections' using errcode = '42501';
  end if;
  return query
    select k.id, k.species_id, s.latin_name, k.field, k.old_value, k.proposed_value, k.reason, k.source, k.status,
           k.created_at, k.decided_at, k.decision_reason, to_jsonb(s) ->> k.field
      from catalog_correction k join species s on s.id = k.species_id
     where k.status = 'open' and species_status(k.species_id) in ('curated', 'reviewed')
     order by k.created_at, k.id;
end
$$;;
REVOKE ALL ON FUNCTION public.open_catalog_corrections() FROM PUBLIC;
GRANT ALL ON FUNCTION public.open_catalog_corrections() TO pflanzendex_app;

-- function open_correction_id
CREATE FUNCTION public.open_correction_id(p_species uuid, p_field text, p_value text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  found_id uuid;
begin
  if species_status(p_species) is distinct from 'curated' and species_status(p_species) is distinct from 'reviewed' then
    return null;
  end if;
  perform set_config('app.correction_lookup', 'on', true);
  select k.id into found_id from catalog_correction k
   where k.species_id = p_species and k.field = p_field and k.proposed_value = p_value and k.status = 'open';
  perform set_config('app.correction_lookup', 'off', true);
  return found_id;
end
$$;;
REVOKE ALL ON FUNCTION public.open_correction_id(p_species uuid, p_field text, p_value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.open_correction_id(p_species uuid, p_field text, p_value text) TO pflanzendex_app;

-- function open_species_corrections
CREATE FUNCTION public.open_species_corrections(p_species uuid) RETURNS TABLE(id uuid, field text, proposed_value text, reason text, source text, created_at timestamp with time zone, confirmations integer, disputes integer, my_vote text, is_mine boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if current_account() is null or coalesce(species_status(p_species), '') not in ('curated', 'reviewed') then
    return;
  end if;
  perform set_config('app.vote_counts', 'on', true);
  perform set_config('app.correction_lookup', 'on', true);
  return query
    select k.id, k.field, k.proposed_value, k.reason, k.source, k.created_at,
           (select count(*)::integer from catalog_correction_vote v where v.correction_id = k.id and v.vote = 'confirm'),
           (select count(*)::integer from catalog_correction_vote v where v.correction_id = k.id and v.vote = 'dispute'),
           (select v.vote from catalog_correction_vote v where v.correction_id = k.id and v.account_id = current_account()),
           k.account_id = current_account()
      from catalog_correction k
     where k.species_id = p_species and k.status = 'open'
     order by k.created_at, k.id;
end
$$;;
REVOKE ALL ON FUNCTION public.open_species_corrections(p_species uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.open_species_corrections(p_species uuid) TO pflanzendex_app;

-- function reject_catalog_correction
CREATE FUNCTION public.reject_catalog_correction(p_id uuid, p_reason text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  c catalog_correction%rowtype;
begin
  if not is_reviewer() then
    raise exception 'Only operators or reviewers reject corrections' using errcode = '42501';
  end if;
  select * into c from catalog_correction where id = p_id for update;
  if not found then
    return 'not_found';
  end if;
  if c.status <> 'open' then
    return 'decided';
  end if;
  perform set_config('app.correction_decision', 'on', true);
  update catalog_correction set status = 'rejected', decided_by = current_account(), decided_at = now(),
    decision_reason = p_reason where id = p_id;
  perform set_config('app.correction_decision', 'off', true);
  return 'rejected';
end
$$;;
REVOKE ALL ON FUNCTION public.reject_catalog_correction(p_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reject_catalog_correction(p_id uuid, p_reason text) TO pflanzendex_app;

-- function revert_catalog_field
CREATE FUNCTION public.revert_catalog_field(p_species uuid, p_field text, p_version integer) RETURNS TABLE(outcome text, version integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  old catalog_field_provenance%rowtype;
  current_value text;
  v integer;
begin
  if not is_reviewer() then
    raise exception 'Only operators or reviewers revert catalog values' using errcode = '42501';
  end if;
  select * into old from catalog_field_provenance where species_id = p_species and field = p_field and catalog_field_provenance.version = p_version;
  if not found or species_status(p_species) is null then
    return query select 'not_found'::text, null::integer;
    return;
  end if;
  execute format('select %I from species where id = $1', p_field) into current_value using p_species;
  if current_value is not distinct from old.value then
    return query select 'unchanged'::text, null::integer;
    return;
  end if;
  execute format('update species set %I = $2, version = version + 1 where id = $1 returning version', p_field)
    into v using p_species, old.value;
  insert into catalog_field_provenance
    (species_id, field, version, value, origin, source, link, license, retrieved_on, disputed, citation, set_by)
    values (p_species, p_field, v, old.value, 'reviewer', old.source, old.link, old.license, old.retrieved_on, old.disputed,
            coalesce(old.citation, 'reverted to version ' || p_version), current_account());
  return query select 'reverted'::text, v;
end
$_$;;
REVOKE ALL ON FUNCTION public.revert_catalog_field(p_species uuid, p_field text, p_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revert_catalog_field(p_species uuid, p_field text, p_version integer) TO pflanzendex_app;

-- function review_case_guard
CREATE FUNCTION public.review_case_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('proposal', 'ai_unreviewed') and not (new.status = 'curated' and is_reviewer()) then
      raise exception 'Review status % may only be created by a reviewer', new.status using errcode = '42501';
    end if;
    new.reason := null;
    new.merged_into := null;
    new.reviewed_by := case when new.status = 'curated' then current_account() end;
    new.reviewed_at := case when new.status = 'curated' then now() end;
    return new;
  end if;
  if to_jsonb(new) = to_jsonb(old) then
    return new;
  end if;
  if to_jsonb(new) - 'account_id' - 'reviewed_by' = to_jsonb(old) - 'account_id' - 'reviewed_by'
     and (new.account_id is null or new.account_id = old.account_id)
     and (new.reviewed_by is null or new.reviewed_by = old.reviewed_by) then
    return new;
  end if;
  if (new.id, new.account_id, new.object_kind, new.object_id, new.created_at)
     is distinct from (old.id, old.account_id, old.object_kind, old.object_id, old.created_at) then
    raise exception 'Review case: the assignment is immutable' using errcode = '42501';
  end if;
  if not is_reviewer() then
    raise exception 'Only operators or reviewers change the review status' using errcode = '42501';
  end if;
  if new.status in ('proposal', 'ai_unreviewed', 'curated') then
    raise exception 'Review status % cannot be set afterwards', new.status using errcode = '42501';
  end if;
  -- Only an open proposal can be decided; a decided case is final (P-10: nothing is decided twice).
  if old.status not in ('proposal', 'ai_unreviewed') then
    raise exception 'Review case is already decided' using errcode = '42501';
  end if;
  if new.status = 'merged' and not exists (
       select from review_case t
        where t.object_kind = 'species' and t.object_id = new.merged_into and t.status in ('curated', 'reviewed')) then
    raise exception 'Merge target is not an approved species' using errcode = '42501';
  end if;
  new.reviewed_by := current_account();
  new.reviewed_at := now();
  return new;
end
$$;;

-- function review_case_species_sync
CREATE FUNCTION public.review_case_species_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  previous text := coalesce(current_setting('app.review_sync', true), '');
begin
  if tg_op = 'DELETE' then
    if old.object_kind <> 'species' then return null; end if;
    perform set_config('app.review_sync', 'on', true);
    update species set review_status = null, review_account = null where id = old.object_id;
  else
    if new.object_kind <> 'species' then return null; end if;
    perform set_config('app.review_sync', 'on', true);
    update species set review_status = new.status, review_account = new.account_id
     where id = new.object_id
       and (review_status, review_account) is distinct from (new.status, new.account_id);
  end if;
  perform set_config('app.review_sync', previous, true);
  return null;
end
$$;;
REVOKE ALL ON FUNCTION public.review_case_species_sync() FROM PUBLIC;

-- function species_is_merged
CREATE FUNCTION public.species_is_merged(p_species uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (select from review_case v
                  where v.object_kind = 'species' and v.object_id = p_species and v.status = 'merged'
                    and v.account_id = current_account())
$$;;
REVOKE ALL ON FUNCTION public.species_is_merged(p_species uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.species_is_merged(p_species uuid) TO pflanzendex_app;

-- function species_own
CREATE FUNCTION public.species_own(p_species uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select exists (select from review_case v
                  where v.object_kind = 'species' and v.object_id = p_species and v.account_id = current_account())
$$;;
REVOKE ALL ON FUNCTION public.species_own(p_species uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.species_own(p_species uuid) TO pflanzendex_app;

-- function species_review_copy
CREATE FUNCTION public.species_review_copy() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  previous text := coalesce(current_setting('app.review_sync', true), '');
begin
  perform set_config('app.review_sync', 'on', true);
  select v.status, v.account_id into new.review_status, new.review_account
    from review_case v where v.object_kind = 'species' and v.object_id = new.id;
  perform set_config('app.review_sync', previous, true);
  return new;
end
$$;;
REVOKE ALL ON FUNCTION public.species_review_copy() FROM PUBLIC;

-- function species_status
CREATE FUNCTION public.species_status(p_species uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select v.status from review_case v
   where v.object_kind = 'species' and v.object_id = p_species and v.status <> 'merged'
     and (v.status in ('curated', 'reviewed') or v.account_id = current_account())
$$;;
REVOKE ALL ON FUNCTION public.species_status(p_species uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.species_status(p_species uuid) TO pflanzendex_app;

-- function vote_catalog_correction
CREATE FUNCTION public.vote_catalog_correction(p_id uuid, p_vote text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  c catalog_correction%rowtype;
  me uuid := current_account();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform set_config('app.correction_lookup', 'on', true);
  select * into c from catalog_correction where id = p_id;
  perform set_config('app.correction_lookup', 'off', true);
  if c.id is null
     or species_status(c.species_id) is distinct from 'curated' and species_status(c.species_id) is distinct from 'reviewed' then
    return 'not_found';
  end if;
  if c.status <> 'open' then
    return 'decided';
  end if;
  if c.account_id = me then
    return 'own';
  end if;
  if (select count(*) from catalog_correction_vote v
       where v.account_id = me and v.updated_at > now() - interval '1 hour' and v.correction_id <> p_id) >= 50 then
    return 'rate_limited';
  end if;
  insert into catalog_correction_vote (account_id, correction_id, vote) values (me, p_id, p_vote)
    on conflict (account_id, correction_id) do update set vote = excluded.vote;
  return 'voted';
end
$$;;
REVOKE ALL ON FUNCTION public.vote_catalog_correction(p_id uuid, p_vote text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vote_catalog_correction(p_id uuid, p_vote text) TO pflanzendex_app;

-- function withdraw_catalog_correction
CREATE FUNCTION public.withdraw_catalog_correction(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  c catalog_correction%rowtype;
begin
  if current_account() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform set_config('app.correction_lookup', 'on', true);
  select * into c from catalog_correction where id = p_id and account_id = current_account() for update;
  perform set_config('app.correction_lookup', 'off', true);
  -- `found` is reset by the perform above, so the row itself is checked.
  if c.id is null then
    return 'not_found';
  end if;
  if c.status <> 'open' then
    return 'decided';
  end if;
  perform set_config('app.correction_decision', 'on', true);
  update catalog_correction set status = 'withdrawn', decided_at = now() where id = p_id;
  perform set_config('app.correction_decision', 'off', true);
  return 'withdrawn';
end
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;;
REVOKE ALL ON FUNCTION public.withdraw_catalog_correction(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_catalog_correction(p_id uuid) TO pflanzendex_app;

-- module collection: functions

-- function active_species_of
CREATE FUNCTION public.active_species_of(p_accounts uuid[]) RETURNS TABLE(account_id uuid, species_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.active_species_of(p_accounts uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.active_species_of(p_accounts uuid[]) TO pflanzendex_app;

-- module equipment: functions

-- function friend_equipment
CREATE FUNCTION public.friend_equipment(p_owner uuid) RETURNS TABLE(equipment_id uuid, type text, name text, model text, lux_ceiling integer, note text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.friend_equipment(p_owner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.friend_equipment(p_owner uuid) TO pflanzendex_app;

-- module social: functions

-- function answer_friendship
CREATE FUNCTION public.answer_friendship(p_id uuid, p_accept boolean) RETURNS TABLE(outcome text, answered_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.answer_friendship(p_id uuid, p_accept boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.answer_friendship(p_id uuid, p_accept boolean) TO pflanzendex_app;

-- function create_friend_code
CREATE FUNCTION public.create_friend_code(p_code text, p_expires_at timestamp with time zone) RETURNS TABLE(id uuid, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
$_$;;
REVOKE ALL ON FUNCTION public.create_friend_code(p_code text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_friend_code(p_code text, p_expires_at timestamp with time zone) TO pflanzendex_app;

-- function end_friendship
CREATE FUNCTION public.end_friendship(p_id uuid) RETURNS TABLE(outcome text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f public.friendship;
begin
  if me is null then
    raise exception 'Ending a friendship needs an account' using errcode = '42501';
  end if;
  select * into f from public.friendship where id = p_id and account_id = me for update;
  if not found or f.status not in ('confirmed', 'ended') then
    return query select 'not_found'::text;
    return;
  end if;
  if f.status = 'confirmed' then
    update public.friendship set status = 'ended' where id = f.id;
    perform set_config('app.account_id', f.other_id::text, true);
    update public.friendship set status = 'ended' where account_id = f.other_id and other_id = me;
    perform set_config('app.account_id', coalesce(mine, ''), true);
  end if;
  return query select 'ended'::text;
end
$$;;
REVOKE ALL ON FUNCTION public.end_friendship(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_friendship(p_id uuid) TO pflanzendex_app;

-- function friend_offers
CREATE FUNCTION public.friend_offers() RETURNS TABLE(owner_id uuid, owner_name text, offer_id uuid, specimen_id uuid, type text, mode text, wish text, note text, offered_at timestamp with time zone, share_photos boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f record;
begin
  if me is null then
    raise exception 'Reading offers of friends needs an account' using errcode = '42501';
  end if;
  for f in select fr.other_id, fr.other_name from public.friendship fr
            where fr.account_id = me and fr.status = 'confirmed' order by fr.other_id loop
    perform set_config('app.account_id', f.other_id::text, true);
    if exists (select from public.friendship where account_id = f.other_id and other_id = me and status = 'confirmed')
       and not exists (select from public.account_data where account_id = f.other_id and everything_private) then
      return query
        select f.other_id, f.other_name, o.id, o.specimen_id, o.type, o.mode, o.wish, o.note, o.created_at, sh.share_photos
          from public.offer o
          join public.sharing sh on sh.account_id = o.account_id and sh.specimen_id = o.specimen_id
         where o.account_id = f.other_id and o.status = 'open'
         order by o.created_at desc, o.id;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;;
REVOKE ALL ON FUNCTION public.friend_offers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.friend_offers() TO pflanzendex_app;

-- function friend_shares
CREATE FUNCTION public.friend_shares(p_owner uuid) RETURNS TABLE(specimen_id uuid, share_photos boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.friend_shares(p_owner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.friend_shares(p_owner uuid) TO pflanzendex_app;

-- function friend_shares_since
CREATE FUNCTION public.friend_shares_since(p_owner uuid) RETURNS TABLE(specimen_id uuid, share_photos boolean, visible_since timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.friend_shares_since(p_owner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.friend_shares_since(p_owner uuid) TO pflanzendex_app;

-- function friend_wants
CREATE FUNCTION public.friend_wants(p_keys text[]) RETURNS TABLE(owner_id uuid, name_key text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.friend_wants(p_keys text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.friend_wants(p_keys text[]) TO pflanzendex_app;

-- function friendship_holds
CREATE FUNCTION public.friendship_holds(p_other uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  me uuid := current_account();
  cur text := nullif(current_setting('app.account_id', true), '');
  holds boolean;
begin
  holds := exists (select from public.friendship where account_id = me and other_id = p_other and status = 'confirmed');
  if holds then
    perform set_config('app.account_id', p_other::text, true);
    holds := exists (select from public.friendship where account_id = p_other and other_id = me and status = 'confirmed');
    perform set_config('app.account_id', coalesce(cur, ''), true);
  end if;
  return holds;
end
$$;;
REVOKE ALL ON FUNCTION public.friendship_holds(p_other uuid) FROM PUBLIC;

-- function request_friendship
CREATE FUNCTION public.request_friendship(p_code text) RETURNS TABLE(outcome text, request_id uuid, other_name text, requested_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
$$;;
REVOKE ALL ON FUNCTION public.request_friendship(p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_friendship(p_code text) TO pflanzendex_app;

-- module swap: functions

-- function answer_swap
CREATE FUNCTION public.answer_swap(p_swap_id uuid, p_action text, p_reason text, p_proposal text) RETURNS TABLE(outcome text, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  s public.swap;
  target text;
  o record;
begin
  if me is null then
    raise exception 'Answering a swap needs an account' using errcode = '42501';
  end if;
  select * into s from public.swap where swap_id = p_swap_id and account_id = me;
  if not found then
    return query select 'not_found'::text, null::text;
    return;
  end if;
  if s.status in ('requested', 'accepted') and not public.friendship_holds(s.other_id) then
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'friendship_ended', null);
    if s.status = 'accepted' then
      perform public.reopen_offer(case when s.role = 'giver' then me else s.other_id end, s.offer_id);
    end if;
    return query select 'friendship_ended'::text, 'canceled'::text;
    return;
  end if;
  if p_action in ('accept', 'decline', 'propose', 'cancel') and s.role <> 'giver'
     or p_action = 'withdraw' and s.role <> 'recipient'
     or p_action not in ('accept', 'decline', 'propose', 'cancel', 'withdraw') then
    return query select 'not_allowed'::text, null::text;
    return;
  end if;
  target := case p_action when 'accept' then 'accepted' when 'decline' then 'declined'
                          when 'cancel' then 'canceled' when 'withdraw' then 'withdrawn' else 'requested' end;
  if s.status = target and p_action <> 'propose' then
    return query select 'ok'::text, s.status;
    return;
  end if;
  if p_action in ('accept', 'decline', 'propose') and s.status <> 'requested'
     or p_action = 'cancel' and s.status <> 'accepted'
     or p_action = 'withdraw' and s.status not in ('requested', 'accepted') then
    return query select 'wrong_state'::text, s.status;
    return;
  end if;
  if p_action = 'accept' then
    update public.offer set status = 'reserved', updated_at = now() where id = s.offer_id and status = 'open';
    if not found then
      return query select 'offer_not_open'::text, s.status;
      return;
    end if;
    for o in select swap_id, other_id from public.swap
              where account_id = me and role = 'giver' and offer_id = s.offer_id and status = 'requested'
                and swap_id <> s.swap_id loop
      perform public.set_swap_state(o.swap_id, o.other_id, 'declined', null, 'already_given', null);
    end loop;
  end if;
  perform public.set_swap_state(s.swap_id, s.other_id, target, p_reason, null, case when p_action = 'propose' then p_proposal end);
  if p_action in ('cancel', 'withdraw') and s.status = 'accepted' then
    perform public.reopen_offer(case when s.role = 'giver' then me else s.other_id end, s.offer_id);
  end if;
  return query select 'ok'::text, target;
end
$$;;
REVOKE ALL ON FUNCTION public.answer_swap(p_swap_id uuid, p_action text, p_reason text, p_proposal text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.answer_swap(p_swap_id uuid, p_action text, p_reason text, p_proposal text) TO pflanzendex_app;

-- function cancel_swaps_of_deleted_account
CREATE FUNCTION public.cancel_swaps_of_deleted_account() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  s record;
  n integer := 0;
begin
  if me is null then
    raise exception 'Canceling swaps needs an account' using errcode = '42501';
  end if;
  for s in select swap_id, other_id, role, offer_id, status from public.swap
            where account_id = me and status in ('requested', 'accepted') and other_id is not null loop
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'account_deleted', null);
    -- A reserved offer of the partner goes back to open; an offer of the caller disappears with the account.
    if s.status = 'accepted' and s.role = 'recipient' then
      perform public.reopen_offer(s.other_id, s.offer_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;;
REVOKE ALL ON FUNCTION public.cancel_swaps_of_deleted_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_swaps_of_deleted_account() TO pflanzendex_app;

-- function confirm_handover
CREATE FUNCTION public.confirm_handover(p_swap_id uuid, p_marker text) RETURNS TABLE(outcome text, all_done boolean, role text, other_id uuid, offer_id uuid, specimen_id uuid, type text, marker text, mode text, other_name text, recipient_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  cur text := nullif(current_setting('app.account_id', true), '');
  s public.swap;
  giver uuid;
  spec uuid;
  mark text;
  both_done boolean;
  their_name text;
begin
  if me is null then
    raise exception 'Confirming a handover needs an account' using errcode = '42501';
  end if;
  select * into s from public.swap where swap_id = p_swap_id and account_id = me;
  if not found then
    return query select 'not_found'::text, false, null::text, null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if s.status = 'handed_over' then
    return query select 'already_handed_over'::text, true, s.role, s.other_id, s.offer_id, null::uuid, s.type, s.recipient_marker, s.mode, s.other_name, null::text;
    return;
  end if;
  if s.status <> 'accepted' then
    return query select 'wrong_state'::text, false, s.role, s.other_id, s.offer_id, null::uuid, s.type, s.recipient_marker, s.mode, s.other_name, null::text;
    return;
  end if;
  if not public.friendship_holds(s.other_id) then
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'friendship_ended', null);
    perform public.reopen_offer(case when s.role = 'giver' then me else s.other_id end, s.offer_id);
    return query select 'friendship_ended'::text, false, s.role, s.other_id, s.offer_id, null::uuid, s.type, null::text, s.mode, s.other_name, null::text;
    return;
  end if;
  mark := case when s.role = 'recipient' then coalesce(p_marker, s.recipient_marker) else s.recipient_marker end;
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id and account_id = me returning (confirmed_giver and confirmed_recipient) into both_done;
  perform set_config('app.account_id', s.other_id::text, true);
  -- The other side's row holds the name that side gives me (`other_name`): when I am the recipient, the recipient's name.
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id and account_id = s.other_id returning other_name into their_name;
  giver := case when s.role = 'giver' then me else s.other_id end;
  perform set_config('app.account_id', giver::text, true);
  select o.specimen_id into spec from public.offer o where o.id = s.offer_id and o.account_id = giver;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  -- The recipient's name: my own row names it when I am the giver; otherwise the other side's row names me.
  return query select 'ok'::text, both_done, s.role, s.other_id, s.offer_id, spec, s.type, mark, s.mode, s.other_name,
    case when s.role = 'giver' then s.other_name else their_name end;
end
$$;;
REVOKE ALL ON FUNCTION public.confirm_handover(p_swap_id uuid, p_marker text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.confirm_handover(p_swap_id uuid, p_marker text) TO pflanzendex_app;

-- function finish_handover
CREATE FUNCTION public.finish_handover(p_swap_id uuid, p_given uuid, p_received uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  cur text := nullif(current_setting('app.account_id', true), '');
  s public.swap;
  giver uuid;
  recipient uuid;
begin
  if me is null then
    raise exception 'Completing a handover needs an account' using errcode = '42501';
  end if;
  select * into s from public.swap where swap_id = p_swap_id and account_id = me;
  if not found or s.status <> 'accepted' or not (s.confirmed_giver and s.confirmed_recipient) then
    return false;
  end if;
  giver := case when s.role = 'giver' then me else s.other_id end;
  recipient := case when s.role = 'giver' then s.other_id else me end;
  perform set_config('app.account_id', giver::text, true);
  update public.swap set status = 'handed_over', given_specimen_id = p_given, handed_over_at = now(), decided_at = now(),
         updated_at = now() where swap_id = p_swap_id and account_id = giver;
  update public.offer set status = 'handed_over', updated_at = now() where id = s.offer_id and account_id = giver;
  perform set_config('app.account_id', recipient::text, true);
  update public.swap set status = 'handed_over', received_specimen_id = p_received, handed_over_at = now(),
         decided_at = now(), updated_at = now() where swap_id = p_swap_id and account_id = recipient;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  return true;
end
$$;;
REVOKE ALL ON FUNCTION public.finish_handover(p_swap_id uuid, p_given uuid, p_received uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_handover(p_swap_id uuid, p_given uuid, p_received uuid) TO pflanzendex_app;

-- function reopen_offer
CREATE FUNCTION public.reopen_offer(p_giver uuid, p_offer uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  cur text := nullif(current_setting('app.account_id', true), '');
begin
  perform set_config('app.account_id', p_giver::text, true);
  update public.offer set status = 'open', updated_at = now()
   where id = p_offer and account_id = p_giver and status = 'reserved';
  perform set_config('app.account_id', coalesce(cur, ''), true);
end
$$;;
REVOKE ALL ON FUNCTION public.reopen_offer(p_giver uuid, p_offer uuid) FROM PUBLIC;

-- function request_swap
CREATE FUNCTION public.request_swap(p_offer_id uuid, p_counter_specimen uuid, p_counter_text text) RETURNS TABLE(outcome text, swap_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f record;
  o public.offer;
  giver uuid;
  giver_name text;
  my_name text;
  found_offer boolean := false;
  visible boolean := false;
  latin text;
  german text;
  counter_label text;
  new_id uuid := gen_random_uuid();
begin
  if me is null then
    raise exception 'Requesting an offer needs an account' using errcode = '42501';
  end if;
  if exists (select from public.offer where id = p_offer_id and account_id = me) then
    return query select 'own_offer'::text, null::uuid;
    return;
  end if;
  -- Find the offer among the friends' offers, as each friend in turn.
  for f in select fr.other_id, fr.other_name from public.friendship fr
            where fr.account_id = me and fr.status = 'confirmed' order by fr.other_id loop
    perform set_config('app.account_id', f.other_id::text, true);
    select * into o from public.offer where id = p_offer_id and account_id = f.other_id;
    if found then
      found_offer := true;
      giver := f.other_id;
      giver_name := f.other_name;
      visible := exists (select from public.friendship where account_id = giver and other_id = me and status = 'confirmed')
        and not exists (select from public.account_data where account_id = giver and everything_private)
        and exists (select from public.sharing where account_id = giver and specimen_id = o.specimen_id);
      select sp.latin_name, sp.german_name into latin, german from public.species sp
       where sp.id = (select e.species_id from public.specimen e where e.account_id = giver and e.id = o.specimen_id);
      select fr.other_name into my_name from public.friendship fr where fr.account_id = giver and fr.other_id = me;
      exit;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
  if not found_offer or not visible then
    return query select 'offer_unknown'::text, null::uuid;
    return;
  end if;
  if o.status <> 'open' then
    return query select 'not_open'::text, null::uuid;
    return;
  end if;
  if exists (select from public.swap s where s.account_id = me and s.offer_id = o.id and s.role = 'recipient'
                and s.status in ('requested', 'accepted')) then
    return query select 'already_requested'::text, null::uuid;
    return;
  end if;
  if p_counter_specimen is not null then
    if o.mode <> 'swap' then
      return query select 'counter_not_allowed'::text, null::uuid;
      return;
    end if;
    select e.name into counter_label from public.specimen e where e.account_id = me and e.id = p_counter_specimen and e.status <> 'archived';
    if not found then
      return query select 'counter_unknown'::text, null::uuid;
      return;
    end if;
    if not exists (select from public.sharing where account_id = me and specimen_id = p_counter_specimen) then
      return query select 'counter_not_shared'::text, null::uuid;
      return;
    end if;
  elsif p_counter_text is not null and o.mode <> 'swap' then
    return query select 'counter_not_allowed'::text, null::uuid;
    return;
  end if;
  -- The giver's side, written as the giver.
  perform set_config('app.account_id', giver::text, true);
  insert into public.swap (account_id, swap_id, role, other_id, other_name, offer_id, species_latin, species_german,
                           type, mode, counter_name, counter_text)
  values (giver, new_id, 'giver', me, my_name, o.id, latin, german, o.type, o.mode, counter_label, p_counter_text);
  perform set_config('app.account_id', coalesce(mine, ''), true);
  -- The requester's side.
  insert into public.swap (account_id, swap_id, role, other_id, other_name, offer_id, species_latin, species_german,
                           type, mode, counter_specimen_id, counter_name, counter_text)
  values (me, new_id, 'recipient', giver, giver_name, o.id, latin, german, o.type, o.mode, p_counter_specimen,
          counter_label, p_counter_text);
  return query select 'requested'::text, new_id;
end
$$;;
REVOKE ALL ON FUNCTION public.request_swap(p_offer_id uuid, p_counter_specimen uuid, p_counter_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_swap(p_offer_id uuid, p_counter_specimen uuid, p_counter_text text) TO pflanzendex_app;

-- function set_swap_state
CREATE FUNCTION public.set_swap_state(p_swap_id uuid, p_other uuid, p_status text, p_reason text, p_cause text, p_proposal text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  cur text := nullif(current_setting('app.account_id', true), '');
begin
  update public.swap set status = p_status, reason = coalesce(p_reason, reason), cause = coalesce(p_cause, cause),
         counter_text = coalesce(p_proposal, counter_text),
         counter_name = case when p_proposal is not null then null else counter_name end,
         counter_specimen_id = case when p_proposal is not null then null else counter_specimen_id end,
         proposal = proposal or p_proposal is not null, decided_at = now(), updated_at = now()
   where swap_id = p_swap_id and account_id = current_account();
  perform set_config('app.account_id', p_other::text, true);
  update public.swap set status = p_status, reason = coalesce(p_reason, reason), cause = coalesce(p_cause, cause),
         counter_text = coalesce(p_proposal, counter_text),
         counter_name = case when p_proposal is not null then null else counter_name end,
         counter_specimen_id = case when p_proposal is not null then null else counter_specimen_id end,
         proposal = proposal or p_proposal is not null, decided_at = now(), updated_at = now()
   where swap_id = p_swap_id and account_id = p_other;
  perform set_config('app.account_id', coalesce(cur, ''), true);
end
$$;;
REVOKE ALL ON FUNCTION public.set_swap_state(p_swap_id uuid, p_other uuid, p_status text, p_reason text, p_cause text, p_proposal text) FROM PUBLIC;

-- module privacy: functions

-- function deletion_deadline_rows
CREATE FUNCTION public.deletion_deadline_rows() RETURNS TABLE(kind text, entry_id uuid, requested_at timestamp with time zone, subject text, completed_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select 'request'::text, null::uuid, r.requested_at, null::text, null::timestamptz
    from public.account_deletion r
  union all
  select 'identity'::text, l.id, l.requested_at, l.subject, l.completed_at
    from public.deletion_log l
   where l.subject is not null and l.identity_removed_at is null
$$;;
REVOKE ALL ON FUNCTION public.deletion_deadline_rows() FROM PUBLIC;

-- function operator_mark_identity_removed
CREATE FUNCTION public.operator_mark_identity_removed(entry uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if not public.is_operator() then
    raise exception 'Only the operator may mark an identity removal' using errcode = '42501';
  end if;
  update public.deletion_log set subject = null, identity_removed_at = now()
   where id = entry and identity_removed_at is null;
  if found then return 'marked'; end if;
  if exists (select 1 from public.deletion_log where id = entry) then return 'already'; end if;
  return 'unknown';
end
$$;;
REVOKE ALL ON FUNCTION public.operator_mark_identity_removed(entry uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operator_mark_identity_removed(entry uuid) TO pflanzendex_app;

-- ---------------------------------------------------------------------------
-- Tables by module: table, constraints, indexes, row security, triggers, grants
-- ---------------------------------------------------------------------------

-- module kernel

-- table account
CREATE TABLE public.account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text
);

ALTER TABLE ONLY public.account FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_subject_key UNIQUE (subject);
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account TO pflanzendex_app;

-- table idempotency
CREATE TABLE public.idempotency (
    account_id uuid NOT NULL,
    operation text NOT NULL,
    key text NOT NULL,
    fingerprint text NOT NULL,
    result jsonb,
    done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.idempotency
    ADD CONSTRAINT idempotency_pkey PRIMARY KEY (account_id, operation, key);
ALTER TABLE public.idempotency ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.idempotency TO pflanzendex_app;

-- module jobs

-- table job
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.job (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    dedupe_key text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    attempts integer DEFAULT 0 NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    max_attempts integer DEFAULT 5 NOT NULL,
    run_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    locked_by text,
    lease_until timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT job_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT job_check CHECK ((attempts <= max_attempts)),
    CONSTRAINT job_check1 CHECK (((status = 'running'::text) = ((locked_by IS NOT NULL) AND (lease_until IS NOT NULL)))),
    CONSTRAINT job_dedupe_key_check CHECK (((char_length(dedupe_key) >= 1) AND (char_length(dedupe_key) <= 200))),
    CONSTRAINT job_last_error_check CHECK ((char_length(last_error) <= 500)),
    CONSTRAINT job_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
    CONSTRAINT job_payload_check CHECK (((jsonb_typeof(payload) = 'object'::text) AND (char_length((payload)::text) <= 8100))),
    CONSTRAINT job_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'dead'::text, 'expired'::text]))),
    CONSTRAINT job_type_check CHECK (char_length(type) between 3 and 80 and type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$')
);
ALTER TABLE ONLY public.job
    ADD CONSTRAINT job_pkey PRIMARY KEY (id);
CREATE INDEX job_due ON public.job USING btree (run_at) WHERE (status = 'queued'::text);
CREATE INDEX job_finished ON public.job USING btree (finished_at) WHERE (finished_at IS NOT NULL);
CREATE INDEX job_lease ON public.job USING btree (lease_until) WHERE (status = 'running'::text);
CREATE UNIQUE INDEX job_open_dedupe ON public.job USING btree (type, dedupe_key) WHERE ((dedupe_key IS NOT NULL) AND (status = ANY (ARRAY['queued'::text, 'running'::text])));
ALTER TABLE public.job ENABLE ROW LEVEL SECURITY;

-- module account

-- table account_data
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.account_data (
    account_id uuid NOT NULL,
    email text NOT NULL,
    display_name text,
    email_confirmed boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    time_zone text,
    everything_private boolean DEFAULT false NOT NULL,
    no_recommendations boolean DEFAULT false NOT NULL,
    notification_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_active_at timestamp with time zone,
    -- squawk-ignore prefer-bigint-over-smallint
    replenish_buffer smallint DEFAULT 2 NOT NULL,
    rarity_consent boolean DEFAULT false NOT NULL,
    position_thresholds jsonb,
    keyboard_shortcuts text DEFAULT 'plain'::text NOT NULL,
    motion text DEFAULT 'system'::text NOT NULL,
    CONSTRAINT account_data_keyboard_shortcuts_check CHECK ((keyboard_shortcuts = ANY (ARRAY['plain'::text, 'modifier'::text, 'disabled'::text]))),
    CONSTRAINT account_data_motion_check CHECK ((motion = ANY (ARRAY['system'::text, 'reduced'::text]))),
    CONSTRAINT account_data_notification_settings_check CHECK ((jsonb_typeof(notification_settings) = 'object'::text)),
    CONSTRAINT account_data_position_thresholds_shape CHECK (((position_thresholds IS NULL) OR ((jsonb_typeof(position_thresholds) = 'array'::text) AND (jsonb_array_length(position_thresholds) = 4)))),
    CONSTRAINT account_data_replenish_buffer_check CHECK (((replenish_buffer >= 0) AND (replenish_buffer <= 10))),
    CONSTRAINT account_data_time_zone_check CHECK (((time_zone IS NULL) OR ((time_zone ~ '^[A-Za-z]'::text) AND (length(time_zone) <= 64))))
);

ALTER TABLE ONLY public.account_data FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account_data
    ADD CONSTRAINT account_data_pkey PRIMARY KEY (account_id);
ALTER TABLE public.account_data ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_data TO pflanzendex_app;

-- table account_role
CREATE TABLE public.account_role (
    account uuid NOT NULL,
    role text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_role_role_check CHECK ((role = ANY (ARRAY['operator'::text, 'reviewer'::text])))
);
ALTER TABLE ONLY public.account_role
    ADD CONSTRAINT account_role_pkey PRIMARY KEY (account, role);

-- table invitation
CREATE TABLE public.invitation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash bytea NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    redeemed_at timestamp with time zone,
    CONSTRAINT invitation_check CHECK ((expires_at > created_at)),
    CONSTRAINT invitation_code_hash_check CHECK ((octet_length(code_hash) = 32))
);

ALTER TABLE ONLY public.invitation FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_code_hash_key UNIQUE (code_hash);
ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_pkey PRIMARY KEY (id);
CREATE INDEX invitation_created_by ON public.invitation USING btree (created_by);
ALTER TABLE public.invitation ENABLE ROW LEVEL SECURITY;

-- table access_setting
CREATE TABLE public.access_setting (
    id boolean DEFAULT true NOT NULL,
    invitation_only boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT access_setting_id_check CHECK (id)
);

ALTER TABLE ONLY public.access_setting FORCE ROW LEVEL SECURITY;
-- Reference row the chain inserted when it created the table (its own migration), before row security is on.
insert into access_setting default values;
ALTER TABLE ONLY public.access_setting
    ADD CONSTRAINT access_setting_pkey PRIMARY KEY (id);
ALTER TABLE public.access_setting ENABLE ROW LEVEL SECURITY;

-- table operator_cost
CREATE TABLE public.operator_cost (
    id boolean DEFAULT true NOT NULL,
    amount_cents bigint,
    currency text,
    month date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operator_cost_amount_cents_check CHECK (((amount_cents >= 0) AND (amount_cents <= 100000000))),
    CONSTRAINT operator_cost_check CHECK ((((amount_cents IS NULL) = (currency IS NULL)) AND ((currency IS NULL) = (month IS NULL)))),
    CONSTRAINT operator_cost_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT operator_cost_id_check CHECK (id),
    CONSTRAINT operator_cost_month_check CHECK ((month = (date_trunc('month'::text, (month)::timestamp with time zone))::date))
);
-- Reference row the chain inserted when it created the table (its own migration), before row security is on.
insert into operator_cost default values;
ALTER TABLE ONLY public.operator_cost
    ADD CONSTRAINT operator_cost_pkey PRIMARY KEY (id);
ALTER TABLE public.operator_cost ENABLE ROW LEVEL SECURITY;

-- table account_feature
CREATE TABLE public.account_feature (
    account uuid NOT NULL,
    feature text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_feature_feature_check CHECK ((feature = ANY (ARRAY['social'::text, 'ai'::text, 'recommendations'::text])))
);
ALTER TABLE ONLY public.account_feature
    ADD CONSTRAINT account_feature_pkey PRIMARY KEY (account, feature);
ALTER TABLE public.account_feature ENABLE ROW LEVEL SECURITY;

-- table account_unlock
CREATE TABLE public.account_unlock (
    account_id uuid NOT NULL,
    function_id text NOT NULL,
    unlocked_on date NOT NULL,
    source text NOT NULL,
    CONSTRAINT account_unlock_function_id_check CHECK ((function_id ~ '^[a-z][a-z_]{0,39}$'::text)),
    CONSTRAINT account_unlock_source_check CHECK ((source = ANY (ARRAY['tap'::text, 'style_many'::text, 'existing_data'::text])))
);

ALTER TABLE ONLY public.account_unlock FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account_unlock
    ADD CONSTRAINT account_unlock_pkey PRIMARY KEY (account_id, function_id);
ALTER TABLE public.account_unlock ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_unlock TO pflanzendex_app;

-- table account_style
CREATE TABLE public.account_style (
    account_id uuid NOT NULL,
    style text NOT NULL,
    chosen_on date,
    CONSTRAINT account_style_style_check CHECK ((style = ANY (ARRAY['few'::text, 'many'::text])))
);

ALTER TABLE ONLY public.account_style FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account_style
    ADD CONSTRAINT account_style_pkey PRIMARY KEY (account_id);
ALTER TABLE public.account_style ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_style TO pflanzendex_app;

-- table account_hint
CREATE TABLE public.account_hint (
    account_id uuid NOT NULL,
    occasion text NOT NULL,
    shown_on date NOT NULL,
    dismissed_on date,
    CONSTRAINT account_hint_occasion_check CHECK ((occasion ~ '^[a-z][a-z_]{0,39}$'::text))
);

ALTER TABLE ONLY public.account_hint FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account_hint
    ADD CONSTRAINT account_hint_pkey PRIMARY KEY (account_id, occasion);
ALTER TABLE public.account_hint ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_hint TO pflanzendex_app;

-- table account_keeper_switch
CREATE TABLE public.account_keeper_switch (
    account_id uuid NOT NULL,
    feature text NOT NULL,
    enabled boolean NOT NULL,
    changed_on date NOT NULL,
    CONSTRAINT account_keeper_switch_feature_check CHECK ((feature ~ '^[a-z][a-z_]{0,39}$'::text))
);

ALTER TABLE ONLY public.account_keeper_switch FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account_keeper_switch
    ADD CONSTRAINT account_keeper_switch_pkey PRIMARY KEY (account_id, feature);
ALTER TABLE public.account_keeper_switch ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_keeper_switch TO pflanzendex_app;

-- module catalog

-- table species
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.species (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    object_kind text DEFAULT 'species'::text NOT NULL,
    genus text NOT NULL,
    epithet text,
    cultivar text,
    latin_name text NOT NULL,
    german_name text,
    english_name text,
    family_german text,
    family_latin text,
    -- squawk-ignore prefer-bigint-over-smallint
    difficulty smallint,
    -- squawk-ignore prefer-bigint-over-smallint
    standard_level smallint,
    -- squawk-ignore prefer-bigint-over-int
    light_demand_lux integer,
    dormancy_from text,
    dormancy_until text,
    location_hint text,
    growth_measure text,
    etiolation_signs text,
    watering_hint text,
    substrate text,
    pruning text,
    growth_hacks text,
    success_criteria text,
    botanical_story text,
    source text,
    created_by text NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    soft_leaf boolean,
    review_status text,
    review_account uuid,
    CONSTRAINT species_botanical_story_check CHECK (((char_length(botanical_story) >= 1) AND (char_length(botanical_story) <= 1000))),
    CONSTRAINT species_check CHECK (((dormancy_from IS NULL) = (dormancy_until IS NULL))),
    CONSTRAINT species_created_by_check CHECK ((created_by = ANY (ARRAY['operator'::text, 'reviewer'::text, 'user'::text]))),
    CONSTRAINT species_cultivar_check CHECK (((char_length(cultivar) >= 1) AND (char_length(cultivar) <= 60))),
    CONSTRAINT species_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 3))),
    CONSTRAINT species_dormancy_from_check CHECK ((dormancy_from ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'::text)),
    CONSTRAINT species_dormancy_until_check CHECK ((dormancy_until ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'::text)),
    CONSTRAINT species_english_name_check CHECK (((char_length(english_name) >= 1) AND (char_length(english_name) <= 120))),
    CONSTRAINT species_epithet_check CHECK (((char_length(epithet) >= 2) AND (char_length(epithet) <= 60))),
    CONSTRAINT species_etiolation_signs_check CHECK (((char_length(etiolation_signs) >= 1) AND (char_length(etiolation_signs) <= 1000))),
    CONSTRAINT species_family_german_check CHECK (((char_length(family_german) >= 1) AND (char_length(family_german) <= 120))),
    CONSTRAINT species_family_latin_check CHECK (((char_length(family_latin) >= 1) AND (char_length(family_latin) <= 120))),
    CONSTRAINT species_genus_check CHECK (((char_length(genus) >= 2) AND (char_length(genus) <= 60))),
    CONSTRAINT species_german_name_check CHECK (((char_length(german_name) >= 1) AND (char_length(german_name) <= 120))),
    CONSTRAINT species_growth_hacks_check CHECK (((char_length(growth_hacks) >= 1) AND (char_length(growth_hacks) <= 200))),
    CONSTRAINT species_growth_measure_check CHECK ((growth_measure = ANY (ARRAY['height'::text, 'rosette_diameter'::text, 'shoot_length'::text]))),
    CONSTRAINT species_latin_name_check CHECK (((char_length(latin_name) >= 2) AND (char_length(latin_name) <= 160))),
    CONSTRAINT species_light_demand_lux_check CHECK (((light_demand_lux >= 1) AND (light_demand_lux <= 200000))),
    CONSTRAINT species_location_hint_check CHECK (((char_length(location_hint) >= 1) AND (char_length(location_hint) <= 200))),
    CONSTRAINT species_object_kind_check CHECK ((object_kind = 'species'::text)),
    CONSTRAINT species_pruning_check CHECK (((char_length(pruning) >= 1) AND (char_length(pruning) <= 200))),
    CONSTRAINT species_review_status_check CHECK ((review_status = ANY (ARRAY['proposal'::text, 'ai_unreviewed'::text, 'curated'::text, 'reviewed'::text, 'rejected'::text, 'merged'::text]))),
    CONSTRAINT species_source_check CHECK (((char_length(source) >= 1) AND (char_length(source) <= 200))),
    CONSTRAINT species_standard_level_check CHECK (((standard_level >= 2) AND (standard_level <= 4))),
    CONSTRAINT species_substrate_check CHECK (((char_length(substrate) >= 1) AND (char_length(substrate) <= 200))),
    CONSTRAINT species_success_criteria_check CHECK (((char_length(success_criteria) >= 1) AND (char_length(success_criteria) <= 1000))),
    CONSTRAINT species_watering_hint_check CHECK (((char_length(watering_hint) >= 1) AND (char_length(watering_hint) <= 200)))
);

ALTER TABLE ONLY public.species FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_pkey PRIMARY KEY (id);
CREATE INDEX species_latin_name ON public.species USING btree (latin_name);
ALTER TABLE public.species ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER species_guard BEFORE INSERT ON public.species FOR EACH ROW EXECUTE FUNCTION public.species_guard();
CREATE TRIGGER species_review_copy BEFORE INSERT ON public.species FOR EACH ROW EXECUTE FUNCTION public.species_review_copy();

ALTER TABLE public.species ENABLE ALWAYS TRIGGER species_review_copy;
GRANT SELECT,INSERT ON TABLE public.species TO pflanzendex_app;

-- table species_name
CREATE TABLE public.species_name (
    species_id uuid NOT NULL,
    field text NOT NULL,
    display text NOT NULL,
    norm text NOT NULL,
    CONSTRAINT species_name_display_check CHECK (((char_length(display) >= 1) AND (char_length(display) <= 160))),
    CONSTRAINT species_name_field_check CHECK ((field = ANY (ARRAY['latin'::text, 'german'::text, 'english'::text, 'synonym'::text]))),
    CONSTRAINT species_name_norm_check CHECK ((norm <> ''::text))
);

ALTER TABLE ONLY public.species_name FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.species_name
    ADD CONSTRAINT species_name_pkey PRIMARY KEY (species_id, field, norm);
CREATE INDEX species_name_norm ON public.species_name USING btree (norm);
ALTER TABLE public.species_name ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON TABLE public.species_name TO pflanzendex_app;

-- table review_case
CREATE TABLE public.review_case (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid,
    object_kind text NOT NULL,
    object_id uuid NOT NULL,
    status text NOT NULL,
    reason text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    merged_into uuid,
    CONSTRAINT review_case_check CHECK (((status <> 'rejected'::text) OR (reason IS NOT NULL))),
    CONSTRAINT review_case_merge_check CHECK ((((status = 'merged'::text) = (merged_into IS NOT NULL)) AND (merged_into IS DISTINCT FROM object_id))),
    CONSTRAINT review_case_object_kind_check CHECK ((object_kind ~ '^[a-z_]{1,40}$'::text)),
    CONSTRAINT review_case_reason_check CHECK ((char_length(reason) <= 500)),
    CONSTRAINT review_case_status_check CHECK ((status = ANY (ARRAY['proposal'::text, 'ai_unreviewed'::text, 'curated'::text, 'reviewed'::text, 'rejected'::text, 'merged'::text])))
);

ALTER TABLE ONLY public.review_case FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.review_case
    ADD CONSTRAINT review_case_object_kind_object_id_key UNIQUE (object_kind, object_id);
ALTER TABLE ONLY public.review_case
    ADD CONSTRAINT review_case_pkey PRIMARY KEY (id);
CREATE INDEX review_case_account ON public.review_case USING btree (account_id);
CREATE INDEX review_case_curated_species ON public.review_case USING btree (created_at DESC, id) WHERE ((status = 'curated'::text) AND (object_kind = 'species'::text));
CREATE INDEX review_case_merged_into ON public.review_case USING btree (merged_into);
CREATE INDEX review_case_open ON public.review_case USING btree (created_at, id) WHERE (status = ANY (ARRAY['proposal'::text, 'ai_unreviewed'::text]));
CREATE INDEX review_case_reviewed_by ON public.review_case USING btree (reviewed_by);
ALTER TABLE public.review_case ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER review_case_guard BEFORE INSERT OR UPDATE ON public.review_case FOR EACH ROW EXECUTE FUNCTION public.review_case_guard();
CREATE TRIGGER review_case_species_sync AFTER INSERT OR DELETE OR UPDATE ON public.review_case FOR EACH ROW EXECUTE FUNCTION public.review_case_species_sync();

ALTER TABLE public.review_case ENABLE ALWAYS TRIGGER review_case_species_sync;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.review_case TO pflanzendex_app;

-- table catalog_source_snapshot
CREATE TABLE public.catalog_source_snapshot (
    species_id uuid NOT NULL,
    source text NOT NULL,
    source_id text,
    retrieved_at timestamp with time zone NOT NULL,
    link text NOT NULL,
    license text NOT NULL,
    raw jsonb,
    CONSTRAINT catalog_source_snapshot_license_check CHECK (((char_length(license) >= 1) AND (char_length(license) <= 40))),
    CONSTRAINT catalog_source_snapshot_link_check CHECK (((link ~ '^https://[^/?#@]+'::text) AND (char_length(link) <= 2000))),
    CONSTRAINT catalog_source_snapshot_source_check CHECK ((source = ANY (ARRAY['gbif'::text, 'wikidata'::text, 'wikipedia'::text]))),
    CONSTRAINT catalog_source_snapshot_source_id_check CHECK (((char_length(source_id) >= 1) AND (char_length(source_id) <= 200)))
);
ALTER TABLE ONLY public.catalog_source_snapshot
    ADD CONSTRAINT catalog_source_snapshot_pkey PRIMARY KEY (species_id, source);
ALTER TABLE public.catalog_source_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.catalog_source_snapshot TO pflanzendex_app;

-- table catalog_field_provenance
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.catalog_field_provenance (
    species_id uuid NOT NULL,
    field text NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    version integer NOT NULL,
    value text NOT NULL,
    origin text NOT NULL,
    source text,
    link text,
    license text,
    retrieved_on date,
    disputed boolean DEFAULT false NOT NULL,
    set_at timestamp with time zone DEFAULT now() NOT NULL,
    citation text,
    set_by uuid,
    CONSTRAINT catalog_field_provenance_check CHECK (((origin <> 'source'::text) OR ((source IS NOT NULL) AND (link IS NOT NULL) AND (license IS NOT NULL) AND (retrieved_on IS NOT NULL)))),
    CONSTRAINT catalog_field_provenance_citation_check CHECK (((char_length(citation) >= 1) AND (char_length(citation) <= 500))),
    CONSTRAINT catalog_field_provenance_citation_required CHECK (((origin <> ALL (ARRAY['community'::text, 'ai'::text])) OR (citation IS NOT NULL))),
    CONSTRAINT catalog_field_provenance_field_check CHECK ((field = ANY (ARRAY['family_latin'::text, 'german_name'::text, 'botanical_story'::text]))),
    CONSTRAINT catalog_field_provenance_license_check CHECK (((char_length(license) >= 1) AND (char_length(license) <= 40))),
    CONSTRAINT catalog_field_provenance_link_check CHECK (((link ~ '^https://[^/?#@]+'::text) AND (char_length(link) <= 2000))),
    CONSTRAINT catalog_field_provenance_origin_check CHECK ((origin = ANY (ARRAY['source'::text, 'ai'::text, 'community'::text, 'reviewer'::text, 'operator'::text]))),
    CONSTRAINT catalog_field_provenance_source_check CHECK ((source = ANY (ARRAY['gbif'::text, 'wikidata'::text, 'wikipedia'::text]))),
    CONSTRAINT catalog_field_provenance_value_check CHECK (((char_length(value) >= 1) AND (char_length(value) <= 1000))),
    CONSTRAINT catalog_field_provenance_version_check CHECK ((version >= 1))
);
ALTER TABLE ONLY public.catalog_field_provenance
    ADD CONSTRAINT catalog_field_provenance_pkey PRIMARY KEY (species_id, field, version);
CREATE INDEX catalog_field_provenance_set_by_idx ON public.catalog_field_provenance USING btree (set_by);
ALTER TABLE public.catalog_field_provenance ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.catalog_field_provenance TO pflanzendex_app;

-- table catalog_correction
CREATE TABLE public.catalog_correction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    species_id uuid NOT NULL,
    field text NOT NULL,
    old_value text,
    proposed_value text,
    reason text NOT NULL,
    source text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    decision_reason text,
    CONSTRAINT catalog_correction_check CHECK (((field <> 'family_latin'::text) OR (char_length(proposed_value) <= 120))),
    CONSTRAINT catalog_correction_check1 CHECK (((field <> 'german_name'::text) OR (char_length(proposed_value) <= 120))),
    CONSTRAINT catalog_correction_check2 CHECK (((status <> 'rejected'::text) OR (decision_reason IS NOT NULL))),
    CONSTRAINT catalog_correction_check3 CHECK (((status = 'open'::text) = (decided_at IS NULL))),
    CONSTRAINT catalog_correction_decision_reason_check CHECK (((char_length(decision_reason) >= 1) AND (char_length(decision_reason) <= 500))),
    CONSTRAINT catalog_correction_field_check CHECK ((field = ANY (ARRAY['family_latin'::text, 'german_name'::text, 'botanical_story'::text]))),
    CONSTRAINT catalog_correction_proposed_value_check CHECK (((char_length(proposed_value) >= 1) AND (char_length(proposed_value) <= 1000))),
    CONSTRAINT catalog_correction_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 500))),
    CONSTRAINT catalog_correction_source_check CHECK (((char_length(source) >= 1) AND (char_length(source) <= 500))),
    CONSTRAINT catalog_correction_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'rejected'::text, 'withdrawn'::text])))
);

ALTER TABLE ONLY public.catalog_correction FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.catalog_correction
    ADD CONSTRAINT catalog_correction_pkey PRIMARY KEY (id);
CREATE INDEX catalog_correction_account_idx ON public.catalog_correction USING btree (account_id);
CREATE INDEX catalog_correction_decided_by_idx ON public.catalog_correction USING btree (decided_by);
CREATE UNIQUE INDEX catalog_correction_open_unique ON public.catalog_correction USING btree (species_id, field, proposed_value) WHERE (status = 'open'::text);
CREATE INDEX catalog_correction_species_idx ON public.catalog_correction USING btree (species_id, field);
ALTER TABLE public.catalog_correction ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER catalog_correction_guard BEFORE INSERT OR DELETE OR UPDATE ON public.catalog_correction FOR EACH ROW EXECUTE FUNCTION public.catalog_correction_guard();
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.catalog_correction TO pflanzendex_app;

-- table catalog_correction_vote
CREATE TABLE public.catalog_correction_vote (
    account_id uuid NOT NULL,
    correction_id uuid NOT NULL,
    vote text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT catalog_correction_vote_vote_check CHECK ((vote = ANY (ARRAY['confirm'::text, 'dispute'::text])))
);

ALTER TABLE ONLY public.catalog_correction_vote FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.catalog_correction_vote
    ADD CONSTRAINT catalog_correction_vote_pkey PRIMARY KEY (account_id, correction_id);
CREATE INDEX catalog_correction_vote_correction_idx ON public.catalog_correction_vote USING btree (correction_id);
CREATE INDEX catalog_correction_vote_rate_idx ON public.catalog_correction_vote USING btree (account_id, updated_at);
ALTER TABLE public.catalog_correction_vote ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER catalog_correction_vote_guard BEFORE INSERT OR UPDATE ON public.catalog_correction_vote FOR EACH ROW EXECUTE FUNCTION public.catalog_correction_vote_guard();
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.catalog_correction_vote TO pflanzendex_app;

-- module light

-- table light_zone
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.light_zone (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    lux_ceiling integer NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    ppfd integer,
    -- squawk-ignore prefer-bigint-over-int
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT light_zone_lux_ceiling_check CHECK (((lux_ceiling >= 1) AND (lux_ceiling <= 200000))),
    CONSTRAINT light_zone_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT light_zone_ppfd_check CHECK (((ppfd >= 1) AND (ppfd <= 3000))),
    CONSTRAINT light_zone_sort_order_check CHECK (((sort_order >= 0) AND (sort_order <= 999)))
);

ALTER TABLE ONLY public.light_zone FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.light_zone
    ADD CONSTRAINT light_zone_account_id_id_key UNIQUE (account_id, id);
ALTER TABLE ONLY public.light_zone
    ADD CONSTRAINT light_zone_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX light_zone_name_per_account ON public.light_zone USING btree (account_id, lower(name));
ALTER TABLE public.light_zone ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.light_zone TO pflanzendex_app;

-- table location
CREATE TABLE public.location (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    light_zone_id uuid,
    kind text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT location_kind_check CHECK ((kind = ANY (ARRAY['indoor'::text, 'outdoor'::text]))),
    CONSTRAINT location_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60)))
);

ALTER TABLE ONLY public.location FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.location
    ADD CONSTRAINT location_account_id_id UNIQUE (account_id, id);
ALTER TABLE ONLY public.location
    ADD CONSTRAINT location_pkey PRIMARY KEY (id);
CREATE INDEX location_light_zone ON public.location USING btree (account_id, light_zone_id);
CREATE UNIQUE INDEX location_name_per_account ON public.location USING btree (account_id, lower(name));
CREATE INDEX location_zone ON public.location USING btree (light_zone_id);
ALTER TABLE public.location ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.location TO pflanzendex_app;

-- module collection

-- table specimen
CREATE TABLE public.specimen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    species_id uuid NOT NULL,
    name text NOT NULL,
    marker text,
    location_id uuid,
    status text DEFAULT 'plant'::text NOT NULL,
    caught_at date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at date,
    archived_reason text,
    status_before_archived text,
    repotted_at date,
    light_zone_id uuid,
    notes text,
    CONSTRAINT specimen_archive_together CHECK ((((status = 'archived'::text) AND (archived_at IS NOT NULL) AND (archived_reason IS NOT NULL)) OR ((status <> 'archived'::text) AND (archived_at IS NULL) AND (archived_reason IS NULL)))),
    CONSTRAINT specimen_archived_reason_check CHECK (((char_length(archived_reason) >= 1) AND (char_length(archived_reason) <= 250))),
    CONSTRAINT specimen_marker_check CHECK (((char_length(marker) >= 1) AND (char_length(marker) <= 40))),
    CONSTRAINT specimen_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 250))),
    CONSTRAINT specimen_notes_length CHECK (((notes IS NULL) OR ((char_length(notes) >= 1) AND (char_length(notes) <= 2000)))),
    CONSTRAINT specimen_status_before_archived_check CHECK ((status_before_archived = ANY (ARRAY['plant'::text, 'cutting'::text]))),
    CONSTRAINT specimen_status_check CHECK ((status = ANY (ARRAY['plant'::text, 'cutting'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.specimen FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.specimen
    ADD CONSTRAINT specimen_account_id_id UNIQUE (account_id, id);
ALTER TABLE ONLY public.specimen
    ADD CONSTRAINT specimen_pkey PRIMARY KEY (id);
CREATE INDEX specimen_light_zone ON public.specimen USING btree (account_id, light_zone_id);
CREATE INDEX specimen_location ON public.specimen USING btree (account_id, location_id);
CREATE UNIQUE INDEX specimen_marker_per_species ON public.specimen USING btree (account_id, species_id, lower(marker)) WHERE (marker IS NOT NULL);
CREATE UNIQUE INDEX specimen_name_per_account ON public.specimen USING btree (account_id, lower(name));
CREATE INDEX specimen_species ON public.specimen USING btree (species_id);
CREATE INDEX specimen_species_idx ON public.specimen USING btree (account_id, species_id);
ALTER TABLE public.specimen ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.specimen TO pflanzendex_app;

-- table care_profile
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.care_profile (
    account_id uuid NOT NULL,
    species_id uuid NOT NULL,
    growth_location_id uuid,
    dormancy_location_id uuid,
    light_zone_id uuid,
    dormancy_from text,
    dormancy_until text,
    -- squawk-ignore prefer-bigint-over-smallint
    watering_growth_days smallint,
    -- squawk-ignore prefer-bigint-over-smallint
    watering_dormancy_days smallint,
    own_hints text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT care_profile_check CHECK (((dormancy_from IS NULL) = (dormancy_until IS NULL))),
    CONSTRAINT care_profile_dormancy_from_check CHECK ((dormancy_from ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'::text)),
    CONSTRAINT care_profile_dormancy_until_check CHECK ((dormancy_until ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'::text)),
    CONSTRAINT care_profile_own_hints_check CHECK (((char_length(own_hints) >= 1) AND (char_length(own_hints) <= 1000))),
    CONSTRAINT care_profile_watering_dormancy_days_check CHECK (((watering_dormancy_days >= 1) AND (watering_dormancy_days <= 365))),
    CONSTRAINT care_profile_watering_growth_days_check CHECK (((watering_growth_days >= 1) AND (watering_growth_days <= 365)))
);

ALTER TABLE ONLY public.care_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.care_profile
    ADD CONSTRAINT care_profile_pkey PRIMARY KEY (account_id, species_id);
CREATE INDEX care_profile_dormancy_location ON public.care_profile USING btree (account_id, dormancy_location_id);
CREATE INDEX care_profile_growth_location ON public.care_profile USING btree (account_id, growth_location_id);
CREATE INDEX care_profile_light_zone ON public.care_profile USING btree (account_id, light_zone_id);
CREATE INDEX care_profile_species ON public.care_profile USING btree (species_id);
ALTER TABLE public.care_profile ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.care_profile TO pflanzendex_app;

-- table repot
CREATE TABLE public.repot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    repotted_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.repot FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.repot
    ADD CONSTRAINT repot_pkey PRIMARY KEY (id);
CREATE INDEX repot_specimen ON public.repot USING btree (account_id, specimen_id, repotted_on);
ALTER TABLE public.repot ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.repot TO pflanzendex_app;

-- table repot_sign
CREATE TABLE public.repot_sign (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    sign text NOT NULL,
    ticked_on date NOT NULL,
    cleared_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT repot_sign_check CHECK (((cleared_on IS NULL) OR (cleared_on >= ticked_on))),
    CONSTRAINT repot_sign_sign_check CHECK ((sign = ANY (ARRAY['roots_out'::text, 'dries_fast'::text, 'tips_over'::text])))
);

ALTER TABLE ONLY public.repot_sign FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.repot_sign
    ADD CONSTRAINT repot_sign_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX repot_sign_open ON public.repot_sign USING btree (account_id, specimen_id, sign) WHERE (cleared_on IS NULL);
CREATE INDEX repot_sign_specimen ON public.repot_sign USING btree (account_id, specimen_id);
ALTER TABLE public.repot_sign ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.repot_sign TO pflanzendex_app;

-- module monitoring

-- table reminder
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.reminder (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    local_date date NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reminder_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT reminder_last_error_check CHECK ((char_length(last_error) <= 500)),
    CONSTRAINT reminder_status_check CHECK ((status = ANY (ARRAY['none'::text, 'pending'::text, 'in_app'::text, 'delivered'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.reminder FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.reminder
    ADD CONSTRAINT reminder_day UNIQUE (account_id, local_date);
ALTER TABLE ONLY public.reminder
    ADD CONSTRAINT reminder_pkey PRIMARY KEY (id);
ALTER TABLE public.reminder ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reminder TO pflanzendex_app;

-- table reminder_setting
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.reminder_setting (
    account_id uuid NOT NULL,
    send_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    quiet_from time without time zone,
    quiet_to time without time zone,
    paused jsonb DEFAULT '{}'::jsonb NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    measurement_days integer DEFAULT 30 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reminder_setting_check CHECK (((quiet_from IS NULL) = (quiet_to IS NULL))),
    CONSTRAINT reminder_setting_measurement_days_check CHECK (((measurement_days >= 1) AND (measurement_days <= 365)))
);

ALTER TABLE ONLY public.reminder_setting FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.reminder_setting
    ADD CONSTRAINT reminder_setting_pkey PRIMARY KEY (account_id);
ALTER TABLE public.reminder_setting ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.reminder_setting TO pflanzendex_app;

-- table watering_log
CREATE TABLE public.watering_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    watered_on date NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT watering_log_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'sensor'::text])))
);

ALTER TABLE ONLY public.watering_log FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.watering_log
    ADD CONSTRAINT watering_log_day UNIQUE (account_id, specimen_id, watered_on, source);
ALTER TABLE ONLY public.watering_log
    ADD CONSTRAINT watering_log_pkey PRIMARY KEY (id);
ALTER TABLE public.watering_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.watering_log TO pflanzendex_app;

-- table fertilizing_log
CREATE TABLE public.fertilizing_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    fertilized_on date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.fertilizing_log FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.fertilizing_log
    ADD CONSTRAINT fertilizing_log_day UNIQUE (account_id, specimen_id, fertilized_on);
ALTER TABLE ONLY public.fertilizing_log
    ADD CONSTRAINT fertilizing_log_pkey PRIMARY KEY (id);
ALTER TABLE public.fertilizing_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fertilizing_log TO pflanzendex_app;

-- table delivery_channel
CREATE TABLE public.delivery_channel (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    kind text DEFAULT 'web_push'::text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT delivery_channel_auth_check CHECK (((char_length(auth) >= 1) AND (char_length(auth) <= 200))),
    CONSTRAINT delivery_channel_endpoint_check CHECK (((char_length(endpoint) >= 12) AND (char_length(endpoint) <= 2000))),
    CONSTRAINT delivery_channel_kind_check CHECK ((kind = 'web_push'::text)),
    CONSTRAINT delivery_channel_p256dh_check CHECK (((char_length(p256dh) >= 1) AND (char_length(p256dh) <= 200)))
);

ALTER TABLE ONLY public.delivery_channel FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.delivery_channel
    ADD CONSTRAINT delivery_channel_endpoint UNIQUE (account_id, endpoint);
ALTER TABLE ONLY public.delivery_channel
    ADD CONSTRAINT delivery_channel_pkey PRIMARY KEY (id);
ALTER TABLE public.delivery_channel ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.delivery_channel TO pflanzendex_app;

-- module care

-- table treatment
CREATE TABLE public.treatment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    reason text NOT NULL,
    agent text,
    due_at date NOT NULL,
    done boolean DEFAULT false NOT NULL,
    done_at date,
    course_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT treatment_agent_check CHECK (((char_length(agent) >= 1) AND (char_length(agent) <= 200))),
    CONSTRAINT treatment_check CHECK ((done = (done_at IS NOT NULL))),
    CONSTRAINT treatment_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 200)))
);

ALTER TABLE ONLY public.treatment FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.treatment
    ADD CONSTRAINT treatment_pkey PRIMARY KEY (id);
CREATE INDEX treatment_open ON public.treatment USING btree (account_id, specimen_id, due_at) WHERE (NOT done);
CREATE INDEX treatment_specimen ON public.treatment USING btree (account_id, specimen_id);
ALTER TABLE public.treatment ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.treatment TO pflanzendex_app;

-- table measurement
CREATE TABLE public.measurement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    date date NOT NULL,
    value numeric(7,1) NOT NULL,
    quality text DEFAULT 'healthy'::text NOT NULL,
    note text,
    rated_by text DEFAULT 'keeper'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    photo text,
    CONSTRAINT measurement_note_check CHECK (((char_length(note) >= 1) AND (char_length(note) <= 1000))),
    CONSTRAINT measurement_photo_check CHECK ((photo ~ '^[a-z0-9][a-z0-9-]{0,63}\.webp$'::text)),
    CONSTRAINT measurement_quality_check CHECK ((quality = ANY (ARRAY['healthy'::text, 'etiolated'::text]))),
    CONSTRAINT measurement_rated_by_check CHECK ((rated_by = ANY (ARRAY['keeper'::text, 'ai_adopted'::text]))),
    CONSTRAINT measurement_value_check CHECK (((value >= (0)::numeric) AND (value <= (10000)::numeric)))
);

ALTER TABLE ONLY public.measurement FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.measurement
    ADD CONSTRAINT measurement_pkey PRIMARY KEY (id);
CREATE INDEX measurement_specimen_date ON public.measurement USING btree (account_id, specimen_id, date DESC, created_at DESC);
ALTER TABLE public.measurement ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.measurement TO pflanzendex_app;

-- table leaf
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.leaf (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    date date NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    length_mm integer,
    -- squawk-ignore prefer-bigint-over-int
    width_mm integer,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leaf_length_mm_check CHECK (((length_mm >= 1) AND (length_mm <= 5000))),
    CONSTRAINT leaf_note_check CHECK (((char_length(note) >= 1) AND (char_length(note) <= 500))),
    CONSTRAINT leaf_width_mm_check CHECK (((width_mm >= 1) AND (width_mm <= 5000)))
);

ALTER TABLE ONLY public.leaf FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.leaf
    ADD CONSTRAINT leaf_pkey PRIMARY KEY (id);
CREATE INDEX leaf_specimen_date ON public.leaf USING btree (account_id, specimen_id, date DESC, created_at DESC);
ALTER TABLE public.leaf ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leaf TO pflanzendex_app;

-- module wishlist

-- table wish
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.wish (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    name text NOT NULL,
    german text,
    target_zone_id uuid,
    -- squawk-ignore prefer-bigint-over-smallint
    difficulty smallint,
    reasoning text,
    image_url text,
    image_source text,
    license text,
    type text DEFAULT 'plant'::text NOT NULL,
    status text DEFAULT 'wishlist'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name_key text,
    specimen_id uuid,
    image_object text,
    source text DEFAULT 'manual'::text NOT NULL,
    decided_at date,
    equipment_type text,
    product_id text,
    price_eur numeric(10,2),
    visible_to_friends boolean DEFAULT false NOT NULL,
    last_decision text,
    CONSTRAINT wish_check CHECK (((image_url IS NULL) = (image_source IS NULL))),
    CONSTRAINT wish_difficulty_check CHECK (((difficulty >= 1) AND (difficulty <= 3))),
    CONSTRAINT wish_equipment_fields CHECK (
CASE
    WHEN (type = 'equipment'::text) THEN ((equipment_type IS NOT NULL) AND (target_zone_id IS NULL))
    ELSE ((equipment_type IS NULL) AND (product_id IS NULL) AND (price_eur IS NULL))
END),
    CONSTRAINT wish_equipment_type_check CHECK ((equipment_type = ANY (ARRAY['Lamp'::text, 'Timer'::text, 'Sensor'::text, 'Ventilation'::text, 'Pump'::text, 'Pot'::text, 'Substrate'::text, 'Fertilizer'::text, 'Plant agent'::text, 'Other'::text]))),
    CONSTRAINT wish_german_check CHECK (((char_length(german) >= 1) AND (char_length(german) <= 120))),
    CONSTRAINT wish_image_object_check CHECK ((image_object ~ '^[a-z0-9][a-z0-9-]{0,63}\.webp$'::text)),
    CONSTRAINT wish_image_source_check CHECK (((char_length(image_source) >= 1) AND (char_length(image_source) <= 300))),
    CONSTRAINT wish_image_url_check CHECK (char_length(image_url) between 1 and 500 and image_url ~* '^https://' and image_url !~* '^https://[^/?#]*@'),
    CONSTRAINT wish_last_decision_check CHECK ((last_decision = ANY (ARRAY['yes'::text, 'no'::text]))),
    CONSTRAINT wish_license_check CHECK (((char_length(license) >= 1) AND (char_length(license) <= 100))),
    CONSTRAINT wish_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
    CONSTRAINT wish_price_eur_check CHECK (((price_eur >= (0)::numeric) AND (price_eur <= (100000)::numeric))),
    CONSTRAINT wish_product_id_check CHECK (char_length(product_id) between 1 and 60 and product_id !~* '://' and product_id !~* '^www\.'),
    CONSTRAINT wish_reasoning_check CHECK (((char_length(reasoning) >= 1) AND (char_length(reasoning) <= 500))),
    CONSTRAINT wish_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'discover'::text]))),
    CONSTRAINT wish_specimen_only_when_bought CHECK (((specimen_id IS NULL) OR (status = 'bought'::text))),
    CONSTRAINT wish_status_check CHECK ((status = ANY (ARRAY['wishlist'::text, 'bought'::text, 'discarded'::text]))),
    CONSTRAINT wish_type_check CHECK ((type = ANY (ARRAY['plant'::text, 'equipment'::text]))),
    CONSTRAINT wish_visible_only_plant CHECK (((NOT visible_to_friends) OR (type = 'plant'::text)))
);

ALTER TABLE ONLY public.wish FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.wish
    ADD CONSTRAINT wish_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX wish_last_decision_once ON public.wish USING btree (account_id) WHERE (last_decision IS NOT NULL);
CREATE UNIQUE INDEX wish_name ON public.wish USING btree (account_id, lower(name));
CREATE UNIQUE INDEX wish_name_key ON public.wish USING btree (account_id, name_key);
CREATE INDEX wish_open ON public.wish USING btree (account_id, created_at) WHERE (status = 'wishlist'::text);
CREATE INDEX wish_specimen ON public.wish USING btree (account_id, specimen_id);
CREATE UNIQUE INDEX wish_specimen_once ON public.wish USING btree (account_id, specimen_id) WHERE (specimen_id IS NOT NULL);
CREATE INDEX wish_target_zone ON public.wish USING btree (account_id, target_zone_id);
ALTER TABLE public.wish ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.wish TO pflanzendex_app;


--
-- PostgreSQL database dump complete
--

-- module pokedex

-- table taxon
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.taxon (
    latin_name text NOT NULL,
    status text NOT NULL,
    failure_code text,
    accepted_name text,
    genus text,
    family text,
    order_name text,
    ott_id bigint,
    summary text,
    summary_language text,
    image_url text,
    page_url text,
    -- squawk-ignore prefer-bigint-over-int
    genus_species_count integer,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    catalog_fingerprint text NOT NULL,
    built_at timestamp with time zone NOT NULL,
    nature_iucn_category text,
    nature_gbif_occurrences bigint,
    CONSTRAINT taxon_accepted_name_check CHECK (((char_length(accepted_name) >= 2) AND (char_length(accepted_name) <= 160))),
    CONSTRAINT taxon_catalog_fingerprint_check CHECK (((char_length(catalog_fingerprint) >= 1) AND (char_length(catalog_fingerprint) <= 64))),
    CONSTRAINT taxon_check CHECK (((status = 'unresolved'::text) = (failure_code IS NOT NULL))),
    CONSTRAINT taxon_check1 CHECK (((status = 'resolved'::text) OR ((accepted_name IS NULL) AND (genus IS NULL) AND (summary IS NULL) AND (image_url IS NULL) AND (genus_species_count IS NULL)))),
    CONSTRAINT taxon_check2 CHECK (((status = 'unresolved'::text) OR ((accepted_name IS NOT NULL) AND (genus IS NOT NULL)))),
    CONSTRAINT taxon_failure_code_check CHECK ((failure_code ~ '^[a-z_]+\.[a-z_]+$'::text)),
    CONSTRAINT taxon_family_check CHECK (((char_length(family) >= 2) AND (char_length(family) <= 120))),
    CONSTRAINT taxon_genus_check CHECK (((char_length(genus) >= 2) AND (char_length(genus) <= 60))),
    CONSTRAINT taxon_genus_species_count_check CHECK ((genus_species_count > 0)),
    CONSTRAINT taxon_image_url_check CHECK (((char_length(image_url) >= 1) AND (char_length(image_url) <= 2000))),
    CONSTRAINT taxon_latin_name_check CHECK (((char_length(latin_name) >= 2) AND (char_length(latin_name) <= 160))),
    CONSTRAINT taxon_nature_gbif_occurrences_check CHECK ((nature_gbif_occurrences > 0)),
    CONSTRAINT taxon_nature_iucn_category_check CHECK ((nature_iucn_category = ANY (ARRAY['LC'::text, 'NT'::text, 'VU'::text, 'EN'::text, 'CR'::text, 'EW'::text, 'EX'::text, 'DD'::text]))),
    CONSTRAINT taxon_nature_rarity_resolved CHECK (((status = 'resolved'::text) OR ((nature_iucn_category IS NULL) AND (nature_gbif_occurrences IS NULL)))),
    CONSTRAINT taxon_order_name_check CHECK (((char_length(order_name) >= 2) AND (char_length(order_name) <= 120))),
    CONSTRAINT taxon_page_url_check CHECK (((char_length(page_url) >= 1) AND (char_length(page_url) <= 2000))),
    CONSTRAINT taxon_provenance_check CHECK ((jsonb_typeof(provenance) = 'object'::text)),
    CONSTRAINT taxon_status_check CHECK ((status = ANY (ARRAY['resolved'::text, 'unresolved'::text]))),
    CONSTRAINT taxon_summary_check CHECK (((char_length(summary) >= 1) AND (char_length(summary) <= 240))),
    CONSTRAINT taxon_summary_language_check CHECK ((summary_language = ANY (ARRAY['de'::text, 'en'::text])))
);
ALTER TABLE ONLY public.taxon
    ADD CONSTRAINT taxon_pkey PRIMARY KEY (latin_name);
CREATE INDEX taxon_family ON public.taxon USING btree (family) WHERE (status = 'resolved'::text);
ALTER TABLE public.taxon ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.taxon TO pflanzendex_app;

-- table taxon_attribute
CREATE TABLE public.taxon_attribute (
    latin_name text NOT NULL,
    field text NOT NULL,
    value jsonb NOT NULL,
    source text NOT NULL,
    source_url text NOT NULL,
    license text NOT NULL,
    retrieved_on date NOT NULL,
    CONSTRAINT taxon_attribute_check CHECK ((((field = 'humidity'::text) AND (value = ANY (ARRAY['"low"'::jsonb, '"medium"'::jsonb, '"high"'::jsonb]))) OR ((field = 'growth_size'::text) AND (value = ANY (ARRAY['"small"'::jsonb, '"medium"'::jsonb, '"large"'::jsonb]))) OR ((field = 'min_temperature'::text) AND (jsonb_typeof(value) = 'number'::text) AND ((((value #>> '{}'::text[]))::numeric >= ('-30'::integer)::numeric) AND (((value #>> '{}'::text[]))::numeric <= (30)::numeric))) OR ((field = 'toxic_to_pets'::text) AND (jsonb_typeof(value) = 'boolean'::text)) OR ((field = 'light_description'::text) AND (value = ANY (ARRAY['"low"'::jsonb, '"medium"'::jsonb, '"bright_indirect"'::jsonb, '"direct_sun"'::jsonb]))))),
    CONSTRAINT taxon_attribute_field_check CHECK ((field = ANY (ARRAY['humidity'::text, 'min_temperature'::text, 'growth_size'::text, 'toxic_to_pets'::text, 'light_description'::text]))),
    CONSTRAINT taxon_attribute_latin_name_check CHECK (((char_length(latin_name) >= 2) AND (char_length(latin_name) <= 160))),
    CONSTRAINT taxon_attribute_license_check CHECK ((license = ANY (ARRAY['CC0-1.0'::text, 'CC-BY-4.0'::text, 'CC-BY-SA-4.0'::text, 'CC-BY-SA-3.0'::text]))),
    CONSTRAINT taxon_attribute_source_check CHECK ((source = ANY (ARRAY['gbif'::text, 'wikipedia'::text, 'wikidata'::text]))),
    CONSTRAINT taxon_attribute_source_url_check CHECK (((source_url ~ '^https://[^/?#@]+'::text) AND (char_length(source_url) <= 2000)))
);
ALTER TABLE ONLY public.taxon_attribute
    ADD CONSTRAINT taxon_attribute_pkey PRIMARY KEY (latin_name, field);
CREATE INDEX taxon_attribute_field ON public.taxon_attribute USING btree (field, latin_name);
ALTER TABLE public.taxon_attribute ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.taxon_attribute TO pflanzendex_app;

-- table pokedex_state
CREATE TABLE public.pokedex_state (
    account_id uuid NOT NULL,
    seen_species text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.pokedex_state FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.pokedex_state
    ADD CONSTRAINT pokedex_state_pkey PRIMARY KEY (account_id);
ALTER TABLE public.pokedex_state ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pokedex_state TO pflanzendex_app;

-- module equipment

-- table equipment
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    status text,
    manufacturer text,
    model text,
    product_id text,
    price_eur numeric(10,2),
    bought_at date,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    light_zone_id uuid,
    -- squawk-ignore prefer-bigint-over-int
    power_w integer,
    -- squawk-ignore prefer-bigint-over-int
    lux_statement integer,
    in_operation_since date,
    -- squawk-ignore prefer-bigint-over-int
    check_interval_days integer,
    last_checked_on date,
    lifetime_value text,
    lifetime_source text,
    supply text,
    agent_link text,
    assigned_specimen_id uuid,
    assigned_location_id uuid,
    shared boolean DEFAULT false NOT NULL,
    share_note text,
    diameter_cm numeric(5,1),
    height_cm numeric(5,1),
    material text,
    drainage boolean,
    CONSTRAINT equipment_agent_link_check CHECK (((char_length(agent_link) >= 1) AND (char_length(agent_link) <= 80))),
    CONSTRAINT equipment_agent_link_plant_agents_only CHECK (((agent_link IS NULL) OR (type = 'Plant agent'::text))),
    CONSTRAINT equipment_check CHECK (((status IS NULL) = (type = ANY (ARRAY['Substrate'::text, 'Fertilizer'::text, 'Plant agent'::text])))),
    CONSTRAINT equipment_check_interval_days_check CHECK (((check_interval_days >= 1) AND (check_interval_days <= 3650))),
    CONSTRAINT equipment_diameter_cm_check CHECK (((diameter_cm >= (1)::numeric) AND (diameter_cm <= (300)::numeric))),
    CONSTRAINT equipment_height_cm_check CHECK (((height_cm >= (1)::numeric) AND (height_cm <= (300)::numeric))),
    CONSTRAINT equipment_lamp_data_only CHECK (((type = 'Lamp'::text) OR ((power_w IS NULL) AND (lux_statement IS NULL)))),
    CONSTRAINT equipment_lifetime_source_check CHECK (((char_length(lifetime_source) >= 1) AND (char_length(lifetime_source) <= 80))),
    CONSTRAINT equipment_lifetime_value_check CHECK (((char_length(lifetime_value) >= 1) AND (char_length(lifetime_value) <= 80))),
    CONSTRAINT equipment_lifetime_with_source CHECK (((lifetime_value IS NULL) = (lifetime_source IS NULL))),
    CONSTRAINT equipment_lux_statement_check CHECK (((lux_statement >= 1) AND (lux_statement <= 200000))),
    CONSTRAINT equipment_maintenance_devices_only CHECK (((status IS NOT NULL) OR ((in_operation_since IS NULL) AND (check_interval_days IS NULL) AND (last_checked_on IS NULL) AND (lifetime_value IS NULL)))),
    CONSTRAINT equipment_manufacturer_check CHECK (((char_length(manufacturer) >= 1) AND (char_length(manufacturer) <= 80))),
    CONSTRAINT equipment_material_check CHECK (((char_length(material) >= 1) AND (char_length(material) <= 60))),
    CONSTRAINT equipment_model_check CHECK (((char_length(model) >= 1) AND (char_length(model) <= 80))),
    CONSTRAINT equipment_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80))),
    CONSTRAINT equipment_note_check CHECK (((char_length(note) >= 1) AND (char_length(note) <= 500))),
    CONSTRAINT equipment_pot_fields_pots_only CHECK (((type = 'Pot'::text) OR ((diameter_cm IS NULL) AND (height_cm IS NULL) AND (material IS NULL) AND (drainage IS NULL)))),
    CONSTRAINT equipment_power_w_check CHECK (((power_w >= 1) AND (power_w <= 10000))),
    CONSTRAINT equipment_price_eur_check CHECK (((price_eur >= (0)::numeric) AND (price_eur <= (100000)::numeric))),
    CONSTRAINT equipment_product_id_check CHECK (char_length(product_id) between 1 and 60 and product_id !~* '://' and product_id !~* '^www\.'),
    CONSTRAINT equipment_sensor_target_one_place CHECK (((assigned_specimen_id IS NULL) OR (assigned_location_id IS NULL))),
    CONSTRAINT equipment_sensor_target_sensors_only CHECK (((type = 'Sensor'::text) OR ((assigned_specimen_id IS NULL) AND (assigned_location_id IS NULL)))),
    CONSTRAINT equipment_share_note_check CHECK (((char_length(share_note) >= 1) AND (char_length(share_note) <= 300))),
    CONSTRAINT equipment_share_note_shared_only CHECK (((share_note IS NULL) OR shared)),
    CONSTRAINT equipment_status_check CHECK ((status = ANY (ARRAY['active'::text, 'defective'::text, 'retired'::text]))),
    CONSTRAINT equipment_supply_check CHECK ((supply = ANY (ARRAY['available'::text, 'low'::text, 'empty'::text]))),
    CONSTRAINT equipment_supply_consumables_only CHECK (((supply IS NULL) OR (status IS NULL))),
    CONSTRAINT equipment_type_check CHECK ((type = ANY (ARRAY['Lamp'::text, 'Timer'::text, 'Sensor'::text, 'Ventilation'::text, 'Pump'::text, 'Pot'::text, 'Substrate'::text, 'Fertilizer'::text, 'Plant agent'::text, 'Other'::text]))),
    CONSTRAINT equipment_zone_lamp_only CHECK (((light_zone_id IS NULL) OR (type = 'Lamp'::text)))
);

ALTER TABLE ONLY public.equipment FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX equipment_account_id ON public.equipment USING btree (account_id, id);
CREATE INDEX equipment_assigned_location_index ON public.equipment USING btree (account_id, assigned_location_id);
CREATE INDEX equipment_light_zone ON public.equipment USING btree (account_id, light_zone_id);
CREATE UNIQUE INDEX equipment_name ON public.equipment USING btree (account_id, lower(name));
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.equipment TO pflanzendex_app;

-- table lamp_measurement
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.lamp_measurement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    equipment_id uuid NOT NULL,
    measured_on date NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    lux integer NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    distance_cm integer,
    method text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lamp_measurement_distance_cm_check CHECK (((distance_cm >= 1) AND (distance_cm <= 1000))),
    CONSTRAINT lamp_measurement_lux_check CHECK (((lux >= 1) AND (lux <= 200000))),
    CONSTRAINT lamp_measurement_method_check CHECK (((char_length(method) >= 1) AND (char_length(method) <= 60)))
);

ALTER TABLE ONLY public.lamp_measurement FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.lamp_measurement
    ADD CONSTRAINT lamp_measurement_pkey PRIMARY KEY (id);
CREATE INDEX lamp_measurement_equipment_index ON public.lamp_measurement USING btree (account_id, equipment_id, measured_on);
ALTER TABLE public.lamp_measurement ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.lamp_measurement TO pflanzendex_app;

-- table equipment_setting
-- Integer columns as the chain defined them (counts, versions, small scores): a type change would be a later migration.
CREATE TABLE public.equipment_setting (
    account_id uuid NOT NULL,
    -- squawk-ignore prefer-bigint-over-smallint
    deviation_percent smallint,
    CONSTRAINT equipment_setting_deviation_percent_check CHECK (((deviation_percent >= 1) AND (deviation_percent <= 100)))
);

ALTER TABLE ONLY public.equipment_setting FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.equipment_setting
    ADD CONSTRAINT equipment_setting_pkey PRIMARY KEY (account_id);
ALTER TABLE public.equipment_setting ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.equipment_setting TO pflanzendex_app;

-- table pot_placement
CREATE TABLE public.pot_placement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    pot_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    placed_on date NOT NULL,
    left_on date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pot_placement_check CHECK (((left_on IS NULL) OR (left_on >= placed_on)))
);

ALTER TABLE ONLY public.pot_placement FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.pot_placement
    ADD CONSTRAINT pot_placement_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX pot_placement_open_pot ON public.pot_placement USING btree (account_id, pot_id) WHERE (left_on IS NULL);
CREATE UNIQUE INDEX pot_placement_open_specimen ON public.pot_placement USING btree (account_id, specimen_id) WHERE (left_on IS NULL);
CREATE INDEX pot_placement_pot ON public.pot_placement USING btree (account_id, pot_id, placed_on);
CREATE INDEX pot_placement_specimen ON public.pot_placement USING btree (account_id, specimen_id, placed_on);
ALTER TABLE public.pot_placement ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pot_placement TO pflanzendex_app;

-- module social

-- table friendship
CREATE TABLE public.friendship (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    other_id uuid NOT NULL,
    other_name text,
    direction text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    since timestamp with time zone,
    CONSTRAINT friendship_check CHECK ((account_id <> other_id)),
    CONSTRAINT friendship_direction_check CHECK ((direction = ANY (ARRAY['sent'::text, 'received'::text]))),
    CONSTRAINT friendship_other_name_check CHECK (((char_length(other_name) >= 1) AND (char_length(other_name) <= 80))),
    CONSTRAINT friendship_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'ended'::text, 'declined'::text])))
);

ALTER TABLE ONLY public.friendship FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.friendship
    ADD CONSTRAINT friendship_account_id_other_id_key UNIQUE (account_id, other_id);
ALTER TABLE ONLY public.friendship
    ADD CONSTRAINT friendship_pkey PRIMARY KEY (id);
CREATE INDEX friendship_other ON public.friendship USING btree (other_id);
CREATE INDEX friendship_requested ON public.friendship USING btree (account_id, requested_at DESC) WHERE (status = 'requested'::text);
ALTER TABLE public.friendship ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.friendship TO pflanzendex_app;

-- table friend_code
CREATE TABLE public.friend_code (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash bytea NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    redeemed_at timestamp with time zone,
    redeemed_by uuid,
    CONSTRAINT friend_code_check CHECK ((expires_at > created_at)),
    CONSTRAINT friend_code_check1 CHECK (((redeemed_by IS NULL) OR (redeemed_at IS NOT NULL))),
    CONSTRAINT friend_code_code_hash_check CHECK ((octet_length(code_hash) = 32))
);
ALTER TABLE ONLY public.friend_code
    ADD CONSTRAINT friend_code_code_hash_key UNIQUE (code_hash);
ALTER TABLE ONLY public.friend_code
    ADD CONSTRAINT friend_code_pkey PRIMARY KEY (id);
CREATE INDEX friend_code_created_by ON public.friend_code USING btree (created_by);
CREATE INDEX friend_code_redeemed_by ON public.friend_code USING btree (redeemed_by);
ALTER TABLE public.friend_code ENABLE ROW LEVEL SECURITY;

-- table sharing
CREATE TABLE public.sharing (
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    share_photos boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.sharing FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.sharing
    ADD CONSTRAINT sharing_pkey PRIMARY KEY (account_id, specimen_id);
ALTER TABLE public.sharing ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sharing TO pflanzendex_app;

-- table feed_seen
CREATE TABLE public.feed_seen (
    account_id uuid NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.feed_seen FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.feed_seen
    ADD CONSTRAINT feed_seen_pkey PRIMARY KEY (account_id);
ALTER TABLE public.feed_seen ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feed_seen TO pflanzendex_app;

-- module swap

-- table offer
CREATE TABLE public.offer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    specimen_id uuid NOT NULL,
    type text NOT NULL,
    mode text NOT NULL,
    wish text,
    note text,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT offer_mode_check CHECK ((mode = ANY (ARRAY['swap'::text, 'give_away'::text]))),
    CONSTRAINT offer_note_check CHECK (((char_length(note) >= 1) AND (char_length(note) <= 500))),
    CONSTRAINT offer_status_check CHECK ((status = ANY (ARRAY['open'::text, 'reserved'::text, 'handed_over'::text, 'withdrawn'::text]))),
    CONSTRAINT offer_type_check CHECK ((type = ANY (ARRAY['cutting'::text, 'plant'::text, 'offshoot'::text]))),
    CONSTRAINT offer_wish_check CHECK (((char_length(wish) >= 1) AND (char_length(wish) <= 200)))
);

ALTER TABLE ONLY public.offer FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_account_id_id_key UNIQUE (account_id, id);
ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_pkey PRIMARY KEY (id);
CREATE INDEX offer_by_account ON public.offer USING btree (account_id, created_at DESC);
CREATE UNIQUE INDEX offer_one_open ON public.offer USING btree (account_id, specimen_id) WHERE (status = ANY (ARRAY['open'::text, 'reserved'::text]));
CREATE INDEX offer_specimen ON public.offer USING btree (account_id, specimen_id);
ALTER TABLE public.offer ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.offer TO pflanzendex_app;

-- table swap
CREATE TABLE public.swap (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    swap_id uuid NOT NULL,
    role text NOT NULL,
    other_id uuid,
    other_name text,
    offer_id uuid NOT NULL,
    species_latin text,
    species_german text,
    type text NOT NULL,
    mode text NOT NULL,
    counter_specimen_id uuid,
    counter_name text,
    counter_text text,
    status text DEFAULT 'requested'::text NOT NULL,
    confirmed_giver boolean DEFAULT false NOT NULL,
    confirmed_recipient boolean DEFAULT false NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text,
    cause text,
    proposal boolean DEFAULT false NOT NULL,
    decided_at timestamp with time zone,
    recipient_marker text,
    given_specimen_id uuid,
    received_specimen_id uuid,
    handed_over_at timestamp with time zone,
    CONSTRAINT swap_cause_check CHECK ((cause = ANY (ARRAY['already_given'::text, 'friendship_ended'::text, 'offer_withdrawn'::text, 'account_deleted'::text]))),
    CONSTRAINT swap_check CHECK (((counter_specimen_id IS NULL) OR (role = 'recipient'::text))),
    CONSTRAINT swap_check1 CHECK (((given_specimen_id IS NULL) OR (role = 'giver'::text))),
    CONSTRAINT swap_check2 CHECK (((received_specimen_id IS NULL) OR (role = 'recipient'::text))),
    CONSTRAINT swap_counter_text_check CHECK (((char_length(counter_text) >= 1) AND (char_length(counter_text) <= 500))),
    CONSTRAINT swap_mode_check CHECK ((mode = ANY (ARRAY['swap'::text, 'give_away'::text]))),
    CONSTRAINT swap_other_name_check CHECK (((char_length(other_name) >= 1) AND (char_length(other_name) <= 80))),
    CONSTRAINT swap_reason_check CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 200))),
    CONSTRAINT swap_recipient_marker_check CHECK (((char_length(recipient_marker) >= 1) AND (char_length(recipient_marker) <= 40))),
    CONSTRAINT swap_role_check CHECK ((role = ANY (ARRAY['giver'::text, 'recipient'::text]))),
    CONSTRAINT swap_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'accepted'::text, 'handed_over'::text, 'declined'::text, 'canceled'::text, 'withdrawn'::text]))),
    CONSTRAINT swap_type_check CHECK ((type = ANY (ARRAY['cutting'::text, 'plant'::text, 'offshoot'::text])))
);

ALTER TABLE ONLY public.swap FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_account_id_swap_id_key UNIQUE (account_id, swap_id);
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_pkey PRIMARY KEY (id);
CREATE INDEX swap_by_account ON public.swap USING btree (account_id, requested_at DESC);
CREATE INDEX swap_counter_specimen_idx ON public.swap USING btree (account_id, counter_specimen_id);
CREATE INDEX swap_given_specimen_idx ON public.swap USING btree (account_id, given_specimen_id);
CREATE UNIQUE INDEX swap_one_request ON public.swap USING btree (account_id, offer_id) WHERE ((role = 'recipient'::text) AND (status = ANY (ARRAY['requested'::text, 'accepted'::text])));
CREATE INDEX swap_other ON public.swap USING btree (other_id);
CREATE INDEX swap_received_specimen_idx ON public.swap USING btree (account_id, received_specimen_id);
ALTER TABLE public.swap ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.swap TO pflanzendex_app;

-- table swap_match_answer
CREATE TABLE public.swap_match_answer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    answer text NOT NULL,
    answered_on date NOT NULL,
    reconsider_at date,
    species_latin text,
    species_german text,
    giver_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT swap_match_answer_answer_check CHECK ((answer = ANY (ARRAY['no'::text, 'later'::text])))
);

ALTER TABLE ONLY public.swap_match_answer FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.swap_match_answer
    ADD CONSTRAINT swap_match_answer_account_id_offer_id_key UNIQUE (account_id, offer_id);
ALTER TABLE ONLY public.swap_match_answer
    ADD CONSTRAINT swap_match_answer_pkey PRIMARY KEY (id);
ALTER TABLE public.swap_match_answer ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.swap_match_answer TO pflanzendex_app;

-- module achievements

-- table achievement_setting
CREATE TABLE public.achievement_setting (
    account_id uuid NOT NULL,
    calm_mode boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.achievement_setting FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.achievement_setting
    ADD CONSTRAINT achievement_setting_pkey PRIMARY KEY (account_id);
ALTER TABLE public.achievement_setting ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.achievement_setting TO pflanzendex_app;

-- table achievement_seen
CREATE TABLE public.achievement_seen (
    account_id uuid NOT NULL,
    seen_achievements text[] DEFAULT '{}'::text[] NOT NULL,
    known_definitions text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.achievement_seen FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.achievement_seen
    ADD CONSTRAINT achievement_seen_pkey PRIMARY KEY (account_id);
ALTER TABLE public.achievement_seen ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.achievement_seen TO pflanzendex_app;

-- table achievement_rhythm_pause
CREATE TABLE public.achievement_rhythm_pause (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    from_on date NOT NULL,
    until_on date NOT NULL,
    CONSTRAINT achievement_rhythm_pause_range CHECK (((until_on >= from_on) AND ((until_on - from_on) <= 27)))
);

ALTER TABLE ONLY public.achievement_rhythm_pause FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.achievement_rhythm_pause
    ADD CONSTRAINT achievement_rhythm_pause_pkey PRIMARY KEY (id);
CREATE INDEX achievement_rhythm_pause_account_idx ON public.achievement_rhythm_pause USING btree (account_id, from_on);
ALTER TABLE public.achievement_rhythm_pause ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.achievement_rhythm_pause TO pflanzendex_app;

-- module privacy

-- table account_deletion
CREATE TABLE public.account_deletion (
    account_id uuid NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    due_at timestamp with time zone NOT NULL,
    CONSTRAINT account_deletion_check CHECK ((due_at > requested_at))
);

ALTER TABLE ONLY public.account_deletion FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.account_deletion
    ADD CONSTRAINT account_deletion_pkey PRIMARY KEY (account_id);
ALTER TABLE public.account_deletion ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account_deletion TO pflanzendex_app;

-- table deletion_log
CREATE TABLE public.deletion_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requested_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    subject text,
    identity_removed_at timestamp with time zone
);
ALTER TABLE ONLY public.deletion_log
    ADD CONSTRAINT deletion_log_pkey PRIMARY KEY (id);
CREATE INDEX deletion_log_open ON public.deletion_log USING btree (completed_at) WHERE (identity_removed_at IS NULL);
ALTER TABLE public.deletion_log ENABLE ROW LEVEL SECURITY;

-- module ai

-- table ai_connection
CREATE TABLE public.ai_connection (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    client_id text NOT NULL,
    client_name text NOT NULL,
    rights text DEFAULT 'drafts'::text NOT NULL,
    requested_rights text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_use timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT ai_connection_client_id_check CHECK (((char_length(client_id) >= 1) AND (char_length(client_id) <= 500))),
    CONSTRAINT ai_connection_client_name_check CHECK (((char_length(client_name) >= 1) AND (char_length(client_name) <= 100))),
    CONSTRAINT ai_connection_requested_rights_check CHECK ((requested_rights = ANY (ARRAY['read'::text, 'drafts'::text, 'write'::text]))),
    CONSTRAINT ai_connection_rights_check CHECK ((rights = ANY (ARRAY['read'::text, 'drafts'::text, 'write'::text])))
);

ALTER TABLE ONLY public.ai_connection FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.ai_connection
    ADD CONSTRAINT ai_connection_account_id UNIQUE (account_id, id);
ALTER TABLE ONLY public.ai_connection
    ADD CONSTRAINT ai_connection_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ai_connection_active ON public.ai_connection USING btree (account_id, client_id) WHERE (revoked_at IS NULL);
CREATE INDEX ai_connection_list ON public.ai_connection USING btree (account_id, created_at DESC);
ALTER TABLE public.ai_connection ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_connection TO pflanzendex_app;

-- table ai_log
CREATE TABLE public.ai_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    operation text NOT NULL,
    effect text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    undone_at timestamp with time zone,
    CONSTRAINT ai_log_effect_check CHECK ((char_length(effect) <= 500)),
    CONSTRAINT ai_log_operation_check CHECK (((char_length(operation) >= 1) AND (char_length(operation) <= 100)))
);

ALTER TABLE ONLY public.ai_log FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.ai_log
    ADD CONSTRAINT ai_log_pkey PRIMARY KEY (id);
CREATE INDEX ai_log_connection ON public.ai_log USING btree (account_id, connection_id);
CREATE INDEX ai_log_connection_day ON public.ai_log USING btree (account_id, connection_id, created_at);
CREATE INDEX ai_log_list ON public.ai_log USING btree (account_id, created_at DESC);
ALTER TABLE public.ai_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_log TO pflanzendex_app;

-- table ai_draft
CREATE TABLE public.ai_draft (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    connection_id uuid NOT NULL,
    type text NOT NULL,
    reference text,
    content jsonb NOT NULL,
    content_key text NOT NULL,
    source text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    CONSTRAINT ai_draft_content_key_check CHECK ((char_length(content_key) <= 20000)),
    CONSTRAINT ai_draft_reference_check CHECK ((char_length(reference) <= 200)),
    CONSTRAINT ai_draft_source_check CHECK (((char_length(source) >= 1) AND (char_length(source) <= 1000))),
    CONSTRAINT ai_draft_status_check CHECK ((status = ANY (ARRAY['open'::text, 'adopted'::text, 'discarded'::text]))),
    CONSTRAINT ai_draft_type_check CHECK (((char_length(type) >= 1) AND (char_length(type) <= 50)))
);

ALTER TABLE ONLY public.ai_draft FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.ai_draft
    ADD CONSTRAINT ai_draft_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ai_draft_account_id ON public.ai_draft USING btree (account_id, id);
CREATE INDEX ai_draft_connection ON public.ai_draft USING btree (account_id, connection_id);
CREATE INDEX ai_draft_list ON public.ai_draft USING btree (account_id, created_at DESC);
CREATE UNIQUE INDEX ai_draft_open ON public.ai_draft USING btree (account_id, type, md5(content_key)) WHERE (status = 'open'::text);
ALTER TABLE public.ai_draft ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_draft TO pflanzendex_app;

-- table ai_task
CREATE TABLE public.ai_task (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    type text NOT NULL,
    reference text NOT NULL,
    label text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    connection_id uuid,
    draft_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_task_label_check CHECK (((char_length(label) >= 1) AND (char_length(label) <= 200))),
    CONSTRAINT ai_task_reference_check CHECK (((char_length(reference) >= 1) AND (char_length(reference) <= 200))),
    CONSTRAINT ai_task_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'done'::text, 'declined'::text, 'expired'::text]))),
    CONSTRAINT ai_task_type_check CHECK ((type = ANY (ARRAY['species_profile'::text, 'wish_candidates'::text, 'photo_assessment'::text])))
);

ALTER TABLE ONLY public.ai_task FORCE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.ai_task
    ADD CONSTRAINT ai_task_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ai_task_active ON public.ai_task USING btree (account_id, type, md5(reference)) WHERE (status = ANY (ARRAY['open'::text, 'in_progress'::text]));
CREATE INDEX ai_task_connection ON public.ai_task USING btree (account_id, connection_id);
CREATE INDEX ai_task_draft ON public.ai_task USING btree (account_id, draft_id);
CREATE INDEX ai_task_list ON public.ai_task USING btree (account_id, created_at DESC);
ALTER TABLE public.ai_task ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_task TO pflanzendex_app;

-- ---------------------------------------------------------------------------
-- Foreign keys (after all tables exist), in the order the chain created them
-- ---------------------------------------------------------------------------
ALTER TABLE ONLY public.account_role
    ADD CONSTRAINT account_role_account_fkey FOREIGN KEY (account) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.review_case
    ADD CONSTRAINT review_case_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.account_data
    ADD CONSTRAINT account_data_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.light_zone
    ADD CONSTRAINT light_zone_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.location
    ADD CONSTRAINT location_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.location
    ADD CONSTRAINT location_account_id_light_zone_id_fkey FOREIGN KEY (account_id, light_zone_id) REFERENCES public.light_zone(account_id, id);
ALTER TABLE ONLY public.idempotency
    ADD CONSTRAINT idempotency_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.species_name
    ADD CONSTRAINT species_name_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.specimen
    ADD CONSTRAINT specimen_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.specimen
    ADD CONSTRAINT specimen_location FOREIGN KEY (account_id, location_id) REFERENCES public.location(account_id, id);
ALTER TABLE ONLY public.specimen
    ADD CONSTRAINT specimen_species FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.measurement
    ADD CONSTRAINT measurement_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.measurement
    ADD CONSTRAINT measurement_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.species
    ADD CONSTRAINT species_object_kind_id_fkey FOREIGN KEY (object_kind, id) REFERENCES public.review_case(object_kind, object_id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.care_profile
    ADD CONSTRAINT care_profile_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.care_profile
    ADD CONSTRAINT care_profile_species FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.care_profile
    ADD CONSTRAINT care_profile_growth_location FOREIGN KEY (account_id, growth_location_id) REFERENCES public.location(account_id, id);
ALTER TABLE ONLY public.care_profile
    ADD CONSTRAINT care_profile_dormancy_location FOREIGN KEY (account_id, dormancy_location_id) REFERENCES public.location(account_id, id);
ALTER TABLE ONLY public.care_profile
    ADD CONSTRAINT care_profile_light_zone FOREIGN KEY (account_id, light_zone_id) REFERENCES public.light_zone(account_id, id);
ALTER TABLE ONLY public.treatment
    ADD CONSTRAINT treatment_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.treatment
    ADD CONSTRAINT treatment_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.review_case
    ADD CONSTRAINT review_case_merged_into_fkey FOREIGN KEY (merged_into) REFERENCES public.species(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.invitation
    ADD CONSTRAINT invitation_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.wish
    ADD CONSTRAINT wish_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wish
    ADD CONSTRAINT wish_target_zone FOREIGN KEY (account_id, target_zone_id) REFERENCES public.light_zone(account_id, id);
ALTER TABLE ONLY public.wish
    ADD CONSTRAINT wish_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id);
ALTER TABLE ONLY public.friend_code
    ADD CONSTRAINT friend_code_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friend_code
    ADD CONSTRAINT friend_code_redeemed_by_fkey FOREIGN KEY (redeemed_by) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.friendship
    ADD CONSTRAINT friendship_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.friendship
    ADD CONSTRAINT friendship_other_id_fkey FOREIGN KEY (other_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pokedex_state
    ADD CONSTRAINT pokedex_state_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sharing
    ADD CONSTRAINT sharing_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sharing
    ADD CONSTRAINT sharing_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.feed_seen
    ADD CONSTRAINT feed_seen_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id);
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_counter_specimen FOREIGN KEY (account_id, counter_specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE SET NULL (counter_specimen_id);
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_given_specimen FOREIGN KEY (account_id, given_specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE SET NULL (given_specimen_id);
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_received_specimen FOREIGN KEY (account_id, received_specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE SET NULL (received_specimen_id);
ALTER TABLE ONLY public.reminder_setting
    ADD CONSTRAINT reminder_setting_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.delivery_channel
    ADD CONSTRAINT delivery_channel_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reminder
    ADD CONSTRAINT reminder_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.watering_log
    ADD CONSTRAINT watering_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.watering_log
    ADD CONSTRAINT watering_log_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_connection
    ADD CONSTRAINT ai_connection_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_log
    ADD CONSTRAINT ai_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_log
    ADD CONSTRAINT ai_log_connection FOREIGN KEY (account_id, connection_id) REFERENCES public.ai_connection(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_draft
    ADD CONSTRAINT ai_draft_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_draft
    ADD CONSTRAINT ai_draft_connection FOREIGN KEY (account_id, connection_id) REFERENCES public.ai_connection(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_task
    ADD CONSTRAINT ai_task_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_task
    ADD CONSTRAINT ai_task_connection FOREIGN KEY (account_id, connection_id) REFERENCES public.ai_connection(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_task
    ADD CONSTRAINT ai_task_draft FOREIGN KEY (account_id, draft_id) REFERENCES public.ai_draft(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_light_zone FOREIGN KEY (account_id, light_zone_id) REFERENCES public.light_zone(account_id, id);
ALTER TABLE ONLY public.lamp_measurement
    ADD CONSTRAINT lamp_measurement_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lamp_measurement
    ADD CONSTRAINT lamp_measurement_equipment FOREIGN KEY (account_id, equipment_id) REFERENCES public.equipment(account_id, id);
ALTER TABLE ONLY public.equipment_setting
    ADD CONSTRAINT equipment_setting_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_assigned_location FOREIGN KEY (account_id, assigned_location_id) REFERENCES public.location(account_id, id) ON DELETE SET NULL (assigned_location_id);
ALTER TABLE ONLY public.achievement_setting
    ADD CONSTRAINT achievement_setting_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.achievement_seen
    ADD CONSTRAINT achievement_seen_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.account_feature
    ADD CONSTRAINT account_feature_account_fkey FOREIGN KEY (account) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.swap
    ADD CONSTRAINT swap_other_id_fkey FOREIGN KEY (other_id) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.review_case
    ADD CONSTRAINT review_case_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.account_deletion
    ADD CONSTRAINT account_deletion_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.achievement_rhythm_pause
    ADD CONSTRAINT achievement_rhythm_pause_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.specimen
    ADD CONSTRAINT specimen_light_zone FOREIGN KEY (account_id, light_zone_id) REFERENCES public.light_zone(account_id, id);
ALTER TABLE ONLY public.catalog_source_snapshot
    ADD CONSTRAINT catalog_source_snapshot_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.catalog_field_provenance
    ADD CONSTRAINT catalog_field_provenance_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.account_unlock
    ADD CONSTRAINT account_unlock_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.catalog_field_provenance
    ADD CONSTRAINT catalog_field_provenance_set_by_fkey FOREIGN KEY (set_by) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.catalog_correction
    ADD CONSTRAINT catalog_correction_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.catalog_correction
    ADD CONSTRAINT catalog_correction_species_id_fkey FOREIGN KEY (species_id) REFERENCES public.species(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.catalog_correction
    ADD CONSTRAINT catalog_correction_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.account(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.account_style
    ADD CONSTRAINT account_style_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.account_hint
    ADD CONSTRAINT account_hint_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.catalog_correction_vote
    ADD CONSTRAINT catalog_correction_vote_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.catalog_correction_vote
    ADD CONSTRAINT catalog_correction_vote_correction_id_fkey FOREIGN KEY (correction_id) REFERENCES public.catalog_correction(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.swap_match_answer
    ADD CONSTRAINT swap_match_answer_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.account_keeper_switch
    ADD CONSTRAINT account_keeper_switch_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.leaf
    ADD CONSTRAINT leaf_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.leaf
    ADD CONSTRAINT leaf_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fertilizing_log
    ADD CONSTRAINT fertilizing_log_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.fertilizing_log
    ADD CONSTRAINT fertilizing_log_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.repot
    ADD CONSTRAINT repot_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.repot
    ADD CONSTRAINT repot_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.repot_sign
    ADD CONSTRAINT repot_sign_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.repot_sign
    ADD CONSTRAINT repot_sign_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pot_placement
    ADD CONSTRAINT pot_placement_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.account(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pot_placement
    ADD CONSTRAINT pot_placement_pot FOREIGN KEY (account_id, pot_id) REFERENCES public.equipment(account_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.pot_placement
    ADD CONSTRAINT pot_placement_specimen FOREIGN KEY (account_id, specimen_id) REFERENCES public.specimen(account_id, id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Row rules (policies) by module of the table; they may read the tables of other modules
-- ---------------------------------------------------------------------------

-- module kernel
CREATE POLICY owner_count ON public.account FOR SELECT TO current_user USING (true);
CREATE POLICY sign_in_create ON public.account FOR INSERT WITH CHECK (((subject IS NOT NULL) AND (subject = NULLIF(current_setting('app.subject'::text, true), ''::text))));
CREATE POLICY sign_in_read ON public.account FOR SELECT USING (((subject IS NOT NULL) AND (subject = NULLIF(current_setting('app.subject'::text, true), ''::text))));
CREATE POLICY tenant ON public.account USING ((id = public.current_account())) WITH CHECK ((id = public.current_account()));
CREATE POLICY tenant ON public.idempotency USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module account
CREATE POLICY owner_count ON public.account_data FOR SELECT TO current_user USING (true);
CREATE POLICY owner_create ON public.invitation FOR INSERT TO current_user WITH CHECK (true);
CREATE POLICY owner_read ON public.access_setting FOR SELECT TO current_user USING (true);
CREATE POLICY owner_read ON public.invitation FOR SELECT TO current_user USING (true);
CREATE POLICY owner_update ON public.access_setting FOR UPDATE TO current_user USING (true) WITH CHECK (true);
CREATE POLICY owner_update ON public.invitation FOR UPDATE TO current_user USING (true) WITH CHECK (true);
CREATE POLICY tenant ON public.account_data USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.account_hint USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.account_keeper_switch USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.account_style USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.account_unlock USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module catalog
CREATE POLICY catalog_approved ON public.review_case FOR SELECT TO current_user USING ((status = ANY (ARRAY['curated'::text, 'reviewed'::text])));
CREATE POLICY catalog_fill ON public.species FOR UPDATE TO current_user USING ((current_setting('app.catalog_fill'::text, true) = 'on'::text));
CREATE POLICY erase_own_proposal ON public.species FOR DELETE USING (((current_setting('app.erasing'::text, true) = (public.current_account())::text) AND (EXISTS ( SELECT
   FROM public.review_case v
  WHERE ((v.object_kind = 'species'::text) AND (v.object_id = species.id) AND (v.account_id = public.current_account()) AND (v.status <> ALL (ARRAY['curated'::text, 'reviewed'::text])))))));
CREATE POLICY lock_for_merge ON public.species FOR UPDATE TO current_user USING (public.is_reviewer());
CREATE POLICY owner_counts ON public.catalog_correction_vote FOR SELECT TO current_user USING ((current_setting('app.vote_counts'::text, true) = 'on'::text));
CREATE POLICY owner_decides ON public.catalog_correction TO current_user USING (public.is_reviewer()) WITH CHECK (public.is_reviewer());
CREATE POLICY owner_lookup ON public.catalog_correction FOR SELECT TO current_user USING ((current_setting('app.correction_lookup'::text, true) = 'on'::text));
CREATE POLICY propose ON public.species FOR INSERT WITH CHECK (public.species_own(id));
CREATE POLICY propose ON public.species_name FOR INSERT WITH CHECK (public.species_own(species_id));
CREATE POLICY review_sync_read ON public.review_case FOR SELECT TO current_user USING ((current_setting('app.review_sync'::text, true) = 'on'::text));
CREATE POLICY review_sync_read ON public.species FOR SELECT TO current_user USING ((current_setting('app.review_sync'::text, true) = 'on'::text));
CREATE POLICY review_sync_write ON public.species FOR UPDATE TO current_user USING ((current_setting('app.review_sync'::text, true) = 'on'::text)) WITH CHECK ((current_setting('app.review_sync'::text, true) = 'on'::text));
CREATE POLICY reviewer_decides ON public.review_case FOR UPDATE USING (public.is_reviewer()) WITH CHECK (public.is_reviewer());
CREATE POLICY reviewer_reads ON public.review_case FOR SELECT USING (public.is_reviewer());
CREATE POLICY reviewer_reads ON public.species FOR SELECT USING (((review_status = ANY (ARRAY['proposal'::text, 'ai_unreviewed'::text])) AND ( SELECT public.is_reviewer() AS is_reviewer)));
CREATE POLICY reviewer_reads ON public.species_name FOR SELECT USING ((( SELECT public.is_reviewer() AS is_reviewer) AND (EXISTS ( SELECT
   FROM public.species s
  WHERE ((s.id = species_name.species_id) AND (s.review_status = ANY (ARRAY['proposal'::text, 'ai_unreviewed'::text])))))));
CREATE POLICY tenant ON public.catalog_correction USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.catalog_correction_vote USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.review_case USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY visible ON public.catalog_field_provenance FOR SELECT TO pflanzendex_app USING ((public.species_status(species_id) IS NOT NULL));
CREATE POLICY visible ON public.catalog_source_snapshot FOR SELECT TO pflanzendex_app USING ((public.species_status(species_id) IS NOT NULL));
CREATE POLICY visible ON public.species FOR SELECT USING (((review_status <> 'merged'::text) AND ((review_status = ANY (ARRAY['curated'::text, 'reviewed'::text])) OR (review_account = public.current_account()))));
CREATE POLICY visible ON public.species_name FOR SELECT USING ((EXISTS ( SELECT
   FROM public.species s
  WHERE ((s.id = species_name.species_id) AND (s.review_status <> 'merged'::text) AND ((s.review_status = ANY (ARRAY['curated'::text, 'reviewed'::text])) OR (s.review_account = public.current_account()))))));

-- module light
CREATE POLICY tenant ON public.light_zone USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.location USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module collection
CREATE POLICY tenant ON public.care_profile USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.repot USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.repot_sign USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.specimen USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module monitoring
CREATE POLICY tenant ON public.delivery_channel USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.fertilizing_log USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.reminder USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.reminder_setting USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.watering_log USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module care
CREATE POLICY tenant ON public.leaf USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.measurement USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.treatment USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module wishlist
CREATE POLICY tenant ON public.wish USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module pokedex
CREATE POLICY shared_read ON public.taxon FOR SELECT TO pflanzendex_app USING (true);
CREATE POLICY shared_read ON public.taxon_attribute FOR SELECT TO pflanzendex_app USING (true);
CREATE POLICY tenant ON public.pokedex_state USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module equipment
CREATE POLICY tenant ON public.equipment USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.equipment_setting USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.lamp_measurement USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.pot_placement USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module social
CREATE POLICY tenant ON public.feed_seen USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.friendship USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.sharing USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module swap
CREATE POLICY tenant ON public.offer USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.swap USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.swap_match_answer USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module achievements
CREATE POLICY tenant ON public.achievement_rhythm_pause USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.achievement_seen USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.achievement_setting USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module privacy
CREATE POLICY owner_deadlines ON public.account_deletion FOR SELECT TO current_user USING (true);
CREATE POLICY tenant ON public.account_deletion USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));

-- module ai
CREATE POLICY tenant ON public.ai_connection USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.ai_draft USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.ai_log USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
CREATE POLICY tenant ON public.ai_task USING ((account_id = public.current_account())) WITH CHECK ((account_id = public.current_account()));
