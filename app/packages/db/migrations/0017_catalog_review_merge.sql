-- module: catalog
-- Review of catalog proposals (US-BES-10, FR-BES-11, FR-BES-14, P-04, P-10).
-- 1. Reviewers may read the content of open proposals (not rejected or merged ones) (they cannot judge what they cannot see). The species search
--    of the application still filters by species_status(), so a reviewer's search lists only approved species and
--    their own proposals.
-- 2. A proposal can be merged into an existing species: new status `merged` plus `merged_into`. A merged proposal is
--    visible to nobody (it is a duplicate); everything that pointed to it was re-pointed in the same transaction.

-- Only open proposals: a rejected proposal stays private to its creator, a merged one is gone (FR-BES-11).
create function is_open_proposal(p_species uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select from review_case v
     where is_reviewer() and v.object_kind = 'species' and v.object_id = p_species
       and v.status in ('proposal', 'ai_unreviewed'))
$$;
revoke all on function is_open_proposal(uuid) from public;
grant execute on function is_open_proposal(uuid) to pflanzendex_app;

create policy reviewer_reads on species for select using (is_reviewer() and is_open_proposal(id));
create policy reviewer_reads on species_name for select using (is_reviewer() and is_open_proposal(species_id));

-- Whether a proposal of the caller was merged away (only the creator references it, so other accounts learn nothing
-- about foreign species); modules that reference species ask this instead of reading review_case.
create function species_is_merged(p_species uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select from review_case v
                  where v.object_kind = 'species' and v.object_id = p_species and v.status = 'merged'
                    and v.account_id = current_account())
$$;
revoke all on function species_is_merged(uuid) from public;
grant execute on function species_is_merged(uuid) to pflanzendex_app;

-- A merge locks the species row of the proposal, so a write of the creator that is still in flight (its foreign key
-- holds a key lock on that row) finishes before the references are re-pointed, and a later one finds the species
-- merged (the application re-checks after taking that lock). Without it a specimen could be committed after the
-- re-point and point at a hidden species (P-10). The application role cannot lock rows of `species` itself.
-- `species` has forced row security: FOR UPDATE only locks rows that pass an UPDATE policy of the role that runs the
-- function (its owner), a superuser bypasses this. So exactly the owner role gets an UPDATE policy, limited to
-- reviewers; the application role is no member of the owner role and has no UPDATE privilege, it gains no write
-- power. The function answers whether it really locked a row, it never locks nothing silently.
do $$
begin
  execute format('create policy lock_for_merge on species for update to %I using (is_reviewer())', current_user);
end
$$;

create function lock_species_for_merge(p_species uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_reviewer() then
    raise exception 'Only operators or reviewers merge proposals' using errcode = '42501';
  end if;
  perform 1 from species where id = p_species for update;
  return found;
end
$$;
revoke all on function lock_species_for_merge(uuid) from public;
grant execute on function lock_species_for_merge(uuid) to pflanzendex_app;

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
