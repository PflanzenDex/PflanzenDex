-- module: catalog
-- US-ACC-04, E-02, P-04, P-05: what happens to the keeper's contributions to the shared catalog when the account is
-- deleted.
--
-- A proposal that was approved (`curated`, `reviewed`) belongs to the shared catalog and stays, anonymized: the
-- creator of its review case becomes null (`account_id` is nullable now and set to null when the account goes; it used
-- to delete the case, which the species restricts). Every other proposal (open, rejected, merged, AI-unreviewed) is
-- visible to its creator only; it is personal content and is removed together with the creator's own specimens and care
-- profiles that point at it. `erase_catalog_contributions()` does that for the caller; the deletion of the account (module
-- privacy) calls it first. The delete policy on `species` is open only inside that function (a session flag that holds
-- the caller's own account id), so no other path can delete a species. Forward-only.

alter table review_case alter column account_id drop not null;
alter table review_case drop constraint review_case_account_id_fkey;
alter table review_case add constraint review_case_account_id_fkey
  foreign key (account_id) references account(id) on delete set null;

-- The creator (or the reviewer) goes away: the foreign keys set `account_id` (or `reviewed_by`) to null, nothing else may change. A case without creator is
-- seen by nobody but reviewers and, once approved, by everybody (species_status); `erase_catalog_contributions()`
-- removes the private ones before the account goes.
create or replace function review_case_guard() returns trigger
language plpgsql
as $$
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
$$;

create policy erase_own_proposal on species for delete using (
  current_setting('app.erasing', true) = current_account()::text
  and exists (select from review_case v
               where v.object_kind = 'species' and v.object_id = species.id
                 and v.account_id = current_account() and v.status not in ('curated', 'reviewed'))
);

-- Removes the caller's proposals that are not part of the shared catalog; returns how many species were removed.
create function erase_catalog_contributions()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
revoke all on function erase_catalog_contributions() from public;
grant execute on function erase_catalog_contributions() to pflanzendex_app;
