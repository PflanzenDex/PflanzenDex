-- module: catalog
-- Review of catalog proposals (US-BES-10, FR-BES-11, FR-BES-14, P-04, P-10).
-- 1. Reviewers may read the content of open proposals (they cannot judge what they cannot see). The species search
--    of the application still filters by species_status(), so a reviewer's search lists only approved species and
--    their own proposals.
-- 2. A proposal can be merged into an existing species: new status `merged` plus `merged_into`. A merged proposal is
--    visible to nobody (it is a duplicate); everything that pointed to it was re-pointed in the same transaction.

create policy reviewer_reads on species for select using (is_reviewer());
create policy reviewer_reads on species_name for select using (is_reviewer());

alter table review_case add column merged_into uuid references species (id) on delete restrict;
alter table review_case drop constraint review_case_status_check;
alter table review_case add constraint review_case_status_check
  check (status in ('proposal', 'ai_unreviewed', 'curated', 'reviewed', 'rejected', 'merged'));
alter table review_case add constraint review_case_merge_check
  check ((status = 'merged') = (merged_into is not null) and merged_into is distinct from object_id);

-- A merged proposal is gone for everybody, including its creator (the creator's specimens now point to the target).
create or replace function species_status(p_species uuid) returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select v.status from review_case v
   where v.object_kind = 'species' and v.object_id = p_species and v.status <> 'merged'
     and (v.status in ('curated', 'reviewed') or v.account_id = current_account())
$$;

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
