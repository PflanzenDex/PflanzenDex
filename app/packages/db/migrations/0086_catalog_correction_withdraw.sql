-- module: catalog
-- US-BES-14: the creator withdraws an open correction, and a keeper can report "Stimmt nicht" without proposing a
-- value (the proposed value is then null). A report cannot be accepted (nothing to set), only rejected with a reason
-- or left open; reviewers see it next to the proposals. Forward-only and expand only: one column loses `not null`,
-- accept_catalog_correction learns one more outcome, one new function.

alter table catalog_correction alter column proposed_value drop not null;

create or replace function accept_catalog_correction(p_id uuid) returns table (outcome text, version integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;

-- The creator withdraws their own open correction; nothing changes in the catalog, the row stays (P-10). Outcome:
-- `withdrawn`, `not_found` (also when it is somebody else's), `decided`.
create function withdraw_catalog_correction(p_id uuid) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
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

revoke all on function withdraw_catalog_correction(uuid) from public;
grant execute on function withdraw_catalog_correction(uuid) to pflanzendex_app;

-- Fix of 0085: `perform set_config(...)` resets `found`, so the "not found" test of the vote function and of the guard
-- looked at the row itself only by accident. Both now test `c.id is null`.
create or replace function vote_catalog_correction(p_id uuid, p_vote text) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;

create or replace function catalog_correction_vote_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
