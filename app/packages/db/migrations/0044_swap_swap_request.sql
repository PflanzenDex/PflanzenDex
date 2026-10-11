-- module: swap
-- US-SOZ-09, DM-SOZ-03, ADR 0012, P-04, P-05, P-10, FR-WUN-07: the swap table and the two functions that let friends see
-- open offers and request them.
--
-- `swap` is two-sided like `friendship`: one row per side. Each account sees exactly its own side under the normal row
-- rule; `swap_id` is shared by both rows, `role` says which side the row is. The offer data that must outlive the offer
-- (species names, type, mode) and the name of the other side are copied into the row, so the history survives a
-- withdrawn offer and the end of the friendship (US-SOZ-13). The counter-offer is an own specimen of the requester
-- (name copied into both rows, id only on the requester's row, tied to the same account by the composite foreign key)
-- or free text. States only move forward (ADR 0012); this story writes `requested`.
--
-- `friend_offers()` is the only way to read the open offers of other accounts (like `friend_shares()`): it returns the
-- open offers of confirmed friends (both friendship rows confirmed) whose specimen is shared with friends, and nothing
-- while the owner has "Everything private" on. `request_swap()` creates both rows in one transaction, writing the
-- giver's row as the giver by switching the account inside the function (like `answer_friendship()`).
-- Forward-only: the previous app version does not know the table.

create table swap (
  id uuid primary key default gen_random_uuid(),
  -- The owner of this row (one row per side).
  account_id uuid not null references account(id) on delete cascade,
  swap_id uuid not null,
  role text not null check (role in ('giver', 'recipient')),
  other_id uuid not null references account(id) on delete cascade,
  -- Display name of the other side at the time of the request; null = it has none (P-08).
  other_name text check (char_length(other_name) between 1 and 80),
  -- The offer in the giver's account; no foreign key because the recipient's row points into another account (AB-10).
  offer_id uuid not null,
  species_latin text,
  species_german text,
  type text not null check (type in ('cutting', 'plant', 'offshoot')),
  mode text not null check (mode in ('swap', 'give_away')),
  -- The counter-offer: an own specimen of the requester (swap only) or free text, or nothing (left open).
  counter_specimen_id uuid,
  counter_name text,
  counter_text text check (char_length(counter_text) between 1 and 500),
  status text not null default 'requested'
    check (status in ('requested', 'accepted', 'handed_over', 'declined', 'canceled', 'withdrawn')),
  confirmed_giver boolean not null default false,
  confirmed_recipient boolean not null default false,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, swap_id),
  -- Only the requester's row may name an own specimen, and it must be one of the same account.
  check (counter_specimen_id is null or role = 'recipient'),
  constraint swap_counter_specimen foreign key (account_id, counter_specimen_id)
    references specimen (account_id, id) on delete set null (counter_specimen_id)
);
-- Only one open request per requester and offer (US-SOZ-09).
create unique index swap_one_request on swap (account_id, offer_id)
  where role = 'recipient' and status in ('requested', 'accepted');
create index swap_by_account on swap (account_id, requested_at desc);
-- The foreign key to the other side (NFR-12, QG-D5): deleting an account looks up the rows that point at it.
create index swap_other on swap (other_id);
create index swap_counter_specimen_idx on swap (account_id, counter_specimen_id);
select tenant_protection('swap');

-- The open offers of the caller's confirmed friends. Each friend's rows are read as that friend (the account is switched
-- inside the function and restored at the end), so the row rules still decide what is visible. Own offers never appear:
-- the caller is not its own friend.
create function friend_offers()
returns table (
  owner_id uuid, owner_name text, offer_id uuid, specimen_id uuid, type text, mode text, wish text, note text,
  offered_at timestamptz, share_photos boolean
)
language plpgsql security definer set search_path = public, pg_temp
as $$
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
       and not exists (select from public.account_data where everything_private) then
      return query
        select f.other_id, f.other_name, o.id, o.specimen_id, o.type, o.mode, o.wish, o.note, o.created_at, sh.share_photos
          from public.offer o
          join public.sharing sh on sh.account_id = o.account_id and sh.specimen_id = o.specimen_id
         where o.status = 'open'
         order by o.created_at desc, o.id;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;
revoke all on function friend_offers() from public;
grant execute on function friend_offers() to pflanzendex_app;

-- Requests an open offer of a friend as the calling account and writes both sides in one transaction.
-- Outcome: `requested` (with the swap id), `offer_unknown` (not an open offer of a friend, also for a foreign or unknown
-- id: nothing is revealed), `own_offer`, `not_open`, `already_requested` (only one open request per offer),
-- `counter_not_allowed` (a counter-offer only for the mode swap), `counter_unknown` (not an own, active specimen) and
-- `counter_not_shared` (the counter-offer needs Share = friends). Nothing is written unless the outcome is `requested`.
create function request_swap(p_offer_id uuid, p_counter_specimen uuid, p_counter_text text)
returns table (outcome text, swap_id uuid)
language plpgsql security definer set search_path = public, pg_temp
as $$
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
  if exists (select from public.offer where id = p_offer_id) then
    return query select 'own_offer'::text, null::uuid;
    return;
  end if;
  -- Find the offer among the friends' offers, as each friend in turn.
  for f in select fr.other_id, fr.other_name from public.friendship fr
            where fr.account_id = me and fr.status = 'confirmed' order by fr.other_id loop
    perform set_config('app.account_id', f.other_id::text, true);
    select * into o from public.offer where id = p_offer_id;
    if found then
      found_offer := true;
      giver := f.other_id;
      giver_name := f.other_name;
      visible := exists (select from public.friendship where account_id = giver and other_id = me and status = 'confirmed')
        and not exists (select from public.account_data where everything_private)
        and exists (select from public.sharing where specimen_id = o.specimen_id);
      select sp.latin_name, sp.german_name into latin, german from public.species sp
       where sp.id = (select e.species_id from public.specimen e where e.id = o.specimen_id);
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
    select e.name into counter_label from public.specimen e where e.id = p_counter_specimen and e.status <> 'archived';
    if not found then
      return query select 'counter_unknown'::text, null::uuid;
      return;
    end if;
    if not exists (select from public.sharing where specimen_id = p_counter_specimen) then
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
$$;
revoke all on function request_swap(uuid, uuid, text) from public;
grant execute on function request_swap(uuid, uuid, text) to pflanzendex_app;
