-- module: catalog
-- NFR-12 (issue #1235): the species visibility policy called the SECURITY DEFINER function species_status() for every
-- species row a query scanned, so one count over the catalog cost one review_case index scan per species row (1,260
-- scans for 1,260 species; the lookup cannot be inlined). The review status of a species and the creator of its review
-- case are now stored on the species row. Triggers keep them current: a species takes them when it is inserted (the
-- review case exists first, see the foreign key species -> review_case), and every change of the review case (decision,
-- merge, creator erased) is copied to the species. The review case stays the source of truth. The row rules do not
-- change, the policies become plain column predicates:
--   visible         approved species (curated, reviewed) to everybody, any other status to its creator, never merged
--   reviewer_reads  open proposals (proposal, ai_unreviewed) to reviewers
-- Not in this migration (#1235): pg_trgm and a GIN trigram index on the names for `like '%term%'`. The application role
-- reads species_name under row security, and `like` is not leakproof, so PostgreSQL does not use such an index for the
-- application's search (plan measured). It would only cost writes. Open question for the owner, see app.md.
-- Forward-only and additive for the previous app version: the new columns are nullable, nothing is renamed or dropped,
-- species_status() stays for the other modules.

alter table species add column review_status text, add column review_account uuid;
alter table species add constraint species_review_status_check check (
  review_status in ('proposal', 'ai_unreviewed', 'curated', 'reviewed', 'rejected', 'merged'));

-- The copy runs with owner rights and must see the review case of a species whatever the row rules say (a forced row
-- security hides foreign cases from the owner). The flag `app.review_sync` is set only inside the two functions below
-- and only for their transaction. The policies grant the owner nothing else: the application role is not the owner.
do $$
begin
  execute format(
    'create policy review_sync_read on review_case for select to %I using (current_setting(''app.review_sync'', true) = ''on'')',
    current_user
  );
  execute format(
    'create policy review_sync_read on species for select to %I using (current_setting(''app.review_sync'', true) = ''on'')',
    current_user
  );
  execute format(
    'create policy review_sync_write on species for update to %I using (current_setting(''app.review_sync'', true) = ''on'') with check (current_setting(''app.review_sync'', true) = ''on'')',
    current_user
  );
end
$$;

-- Existing species take the status and creator of their review case.
select set_config('app.review_sync', 'on', true);
update species s set review_status = v.status, review_account = v.account_id
  from review_case v where v.object_kind = 'species' and v.object_id = s.id;
select set_config('app.review_sync', '', true);

-- The row rules as column predicates. `review_status <> 'merged'` keeps a merged proposal invisible to everybody,
-- its creator included (species_status() excludes it the same way). A null status or creator matches nothing.
drop policy visible on species;
drop policy reviewer_reads on species;
create policy visible on species for select using (
  review_status <> 'merged' and (review_status in ('curated', 'reviewed') or review_account = current_account()));
create policy reviewer_reads on species for select using (
  review_status in ('proposal', 'ai_unreviewed') and (select is_reviewer()));

-- Names follow their species. The inner read applies the species row rules of the caller (the same predicates).
drop policy visible on species_name;
drop policy reviewer_reads on species_name;
create policy visible on species_name for select using (exists (
  select from species s where s.id = species_name.species_id and s.review_status <> 'merged'
     and (s.review_status in ('curated', 'reviewed') or s.review_account = current_account())));
create policy reviewer_reads on species_name for select using ((select is_reviewer()) and exists (
  select from species s where s.id = species_name.species_id and s.review_status in ('proposal', 'ai_unreviewed')));

-- A species takes the status and creator of its review case when it is inserted. The foreign key species -> review_case
-- guarantees that the case exists; it is read by the object id of the new species, nothing else.
create function species_review_copy() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  previous text := coalesce(current_setting('app.review_sync', true), '');
begin
  perform set_config('app.review_sync', 'on', true);
  select v.status, v.account_id into new.review_status, new.review_account
    from review_case v where v.object_kind = 'species' and v.object_id = new.id;
  perform set_config('app.review_sync', previous, true);
  return new;
end
$$;
revoke all on function species_review_copy() from public;
create trigger species_review_copy before insert on species for each row execute function species_review_copy();

-- Every change of a species review case is copied to its species row (by the object id of the case, the same row).
-- A deleted case clears the species (a species cannot outlive its case: the foreign key restricts that).
create function review_case_species_sync() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
revoke all on function review_case_species_sync() from public;
create trigger review_case_species_sync after insert or update or delete on review_case
  for each row execute function review_case_species_sync();
-- Seeds and fixtures write with `session_replication_role = replica` (triggers off for the session). The copy must hold
-- there too, so both triggers fire in every session mode; a species inserted before its case is filled in by the case.
alter table species enable always trigger species_review_copy;
alter table review_case enable always trigger review_case_species_sync;
