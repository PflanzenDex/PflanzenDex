-- module: catalog
-- US-BES-16, DM-BES-06, DM-BES-07, FR-BES-12, FR-BES-19: corrections of catalog values and the version history of
-- every field. A keeper proposes a value with a reason (and a source); only a reviewer accepts, rejects or reverts, and
-- only through the functions below (the application role cannot write `species`). Every accepted change or revert
-- raises the catalog version of the species and records the origin of the new value under that version; nothing is
-- deleted from the history (P-10). Forward-only and expand only: one new table, two nullable columns, new functions.

-- Provenance of values that do not come from an open source: a free-text citation (community, AI) and the account that
-- set the value (shown to reviewers only, P-05).
alter table catalog_field_provenance add column citation text check (char_length(citation) between 1 and 500);
alter table catalog_field_provenance add column set_by uuid references account (id) on delete set null;
alter table catalog_field_provenance add constraint catalog_field_provenance_citation_required
  check (origin not in ('community', 'ai') or citation is not null);

create index catalog_field_provenance_set_by_idx on catalog_field_provenance (set_by);

create table catalog_correction (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account (id) on delete cascade,
  species_id uuid not null references species (id) on delete cascade,
  field text not null check (field in ('family_latin', 'german_name', 'botanical_story')),
  -- The catalog value when the correction was made (set by the guard, never by the caller); null = was unknown.
  old_value text,
  proposed_value text not null check (char_length(proposed_value) between 1 and 1000),
  reason text not null check (char_length(reason) between 1 and 500),
  source text check (char_length(source) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_by uuid references account (id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) between 1 and 500),
  check (field <> 'family_latin' or char_length(proposed_value) <= 120),
  check (field <> 'german_name' or char_length(proposed_value) <= 120),
  check (status <> 'rejected' or decision_reason is not null),
  check ((status = 'open') = (decided_at is null))
);

create index catalog_correction_account_idx on catalog_correction (account_id);
create index catalog_correction_decided_by_idx on catalog_correction (decided_by);
create index catalog_correction_species_idx on catalog_correction (species_id, field);
-- Someone proposed the same already: the second one is pointed to the open one (US-BES-14), no duplicates.
create unique index catalog_correction_open_unique on catalog_correction (species_id, field, proposed_value)
  where status = 'open';

select tenant_protection('catalog_correction');

-- Everybody reads only their own corrections (tenant rule above). Reviewers get the open ones of all accounts through
-- `open_catalog_corrections()` below, not through a row rule, so the generic tenant test stays free of exceptions.
-- The decision functions run as the owner role and need to see and change the rows of other accounts.
do $$
begin
  execute format('create policy owner_decides on catalog_correction to %I using (is_reviewer()) with check (is_reviewer())', current_user);
end
$$;

-- The lookup of an open duplicate (open_correction_id below) reads past the creator's row rule, for its own query only.
do $$
begin
  execute format('create policy owner_lookup on catalog_correction for select to %I using (current_setting(''app.correction_lookup'', true) = ''on'')', current_user);
end
$$;

-- The caller states field, value, reason and source; everything else comes from the database. A correction is created
-- open, and after that only a decision (flag set by the functions below) changes it.
create function catalog_correction_guard() returns trigger
language plpgsql
as $$
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
$$;
create trigger catalog_correction_guard before insert or update or delete on catalog_correction
  for each row execute function catalog_correction_guard();

-- Accepts an open correction: the field takes the proposed value, the species gets a new catalog version, the
-- provenance records origin `community`, the citation and the reviewer. Outcome: `accepted`, `not_found`, `decided`.
create function accept_catalog_correction(p_id uuid) returns table (outcome text, version integer)
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

-- Rejects an open correction with a reason; the catalog stays unchanged. Outcome: `rejected`, `not_found`, `decided`.
create function reject_catalog_correction(p_id uuid, p_reason text) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;

-- Reverts a field to an earlier recorded version: the earlier value with its source comes back as a NEW version
-- (origin `reviewer`); the history keeps every row (P-10). Outcome: `reverted`, `not_found`, `unchanged`.
create function revert_catalog_field(p_species uuid, p_field text, p_version integer) returns table (outcome text, version integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;

-- The id of the open correction for the same field and value, so a second proposer is pointed to it (US-BES-14). It
-- reveals nothing else of the other proposal and only for approved species.
create function open_correction_id(p_species uuid, p_field text, p_value text) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;

create function open_catalog_corrections()
returns table (id uuid, species_id uuid, latin_name text, field text, old_value text, proposed_value text, reason text,
               source text, status text, created_at timestamptz, decided_at timestamptz, decision_reason text,
               current_value text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
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
$$;

revoke all on function open_catalog_corrections() from public;
grant execute on function open_catalog_corrections() to pflanzendex_app;

revoke all on function open_correction_id(uuid, text, text) from public;
grant execute on function open_correction_id(uuid, text, text) to pflanzendex_app;

revoke all on function accept_catalog_correction(uuid), reject_catalog_correction(uuid, text), revert_catalog_field(uuid, text, integer) from public;
grant execute on function accept_catalog_correction(uuid), reject_catalog_correction(uuid, text), revert_catalog_field(uuid, text, integer) to pflanzendex_app;
