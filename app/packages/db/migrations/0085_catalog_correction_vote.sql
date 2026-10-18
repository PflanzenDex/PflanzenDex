-- module: catalog
-- US-BES-15, DM-BES-08, E-26: "Stimmt" / "Stimmt nicht" on an open correction. A vote is a signal for the reviewers
-- only: nothing here changes a catalog value, and the counts never say who voted (P-05). One row per account and
-- correction (changing or withdrawing a vote updates the row; a withdrawn vote has `vote` null). More than 50 voted
-- corrections per hour and account are refused (starting value, assumption). Forward-only and expand only.

create table catalog_correction_vote (
  account_id uuid not null references account (id) on delete cascade,
  correction_id uuid not null references catalog_correction (id) on delete cascade,
  vote text check (vote in ('confirm', 'dispute')),
  updated_at timestamptz not null default now(),
  primary key (account_id, correction_id)
);

create index catalog_correction_vote_correction_idx on catalog_correction_vote (correction_id);
create index catalog_correction_vote_rate_idx on catalog_correction_vote (account_id, updated_at);

select tenant_protection('catalog_correction_vote');

-- The functions below run as the owner role and count the votes of all accounts, for their own queries only.
do $$
begin
  execute format('create policy owner_counts on catalog_correction_vote for select to %I using (current_setting(''app.vote_counts'', true) = ''on'')', current_user);
end
$$;

-- Defence in depth for plain statements: only an open correction can be voted on, and not more than 50 other
-- corrections in the last hour (the function below reports the same as outcomes and also checks that the species is
-- approved, because only the proposer sees the corrections of a private proposal).
create function catalog_correction_vote_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  c catalog_correction%rowtype;
begin
  perform set_config('app.correction_lookup', 'on', true);
  select * into c from catalog_correction where id = new.correction_id;
  perform set_config('app.correction_lookup', 'off', true);
  if not found or c.status <> 'open' then
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
create trigger catalog_correction_vote_guard before insert or update on catalog_correction_vote
  for each row execute function catalog_correction_vote_guard();

-- Sets, changes or withdraws (p_vote null) the vote of the caller. Outcome: `voted`, `not_found` (also for a species
-- that is not approved), `decided` (no longer open), `own` (the creator does not vote for their own proposal),
-- `rate_limited`.
create function vote_catalog_correction(p_id uuid, p_vote text) returns text
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
  if not found
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

-- Counts for open corrections of approved species; never who voted.
create function catalog_correction_vote_counts(p_ids uuid[])
returns table (correction_id uuid, confirmations integer, disputes integer)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
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
$$;

-- Open corrections of one approved species for every signed-in keeper (to find one to confirm, US-BES-14/15): no
-- account ids, only whether the proposal is the caller's own and the caller's own vote.
create function open_species_corrections(p_species uuid)
returns table (id uuid, field text, proposed_value text, reason text, source text, created_at timestamptz,
               confirmations integer, disputes integer, my_vote text, is_mine boolean)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
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
$$;

revoke all on function vote_catalog_correction(uuid, text), catalog_correction_vote_counts(uuid[]), open_species_corrections(uuid) from public;
grant execute on function vote_catalog_correction(uuid, text), catalog_correction_vote_counts(uuid[]), open_species_corrections(uuid) to pflanzendex_app;
