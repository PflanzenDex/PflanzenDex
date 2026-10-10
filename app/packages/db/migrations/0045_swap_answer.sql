-- module: swap
-- US-SOZ-10, DM-SOZ-03, ADR 0012, P-04, P-10: answering a swap request and the cancelations around it.
--
-- New columns on `swap`: `reason` (the optional reason a person gives with a decline or a cancelation), `cause` (why the
-- system ended a swap on its own), `proposal` (the giver changed the counter-offer: "something else"), `decided_at` (the moment
-- of the last transition). States only move forward (ADR 0012): `requested -> accepted`, terminal `declined`,
-- `canceled`, `withdrawn`; `handed_over` follows with US-SOZ-11.
--
-- `answer_swap()` is the one transition function. Both rows of the swap change together in one transaction, the other
-- side's row is written as that account by switching the account inside the function (like `answer_friendship()`). Every
-- transition first checks that the friendship is still confirmed and otherwise ends the swap in `canceled`, so a failed
-- hook can never leave a living swap behind a dead friendship. `cancel_orphaned_swaps()` is that check for all swaps of
-- the caller and is what the hook after ending a friendship calls; `cancel_swaps_for_offer()` cancels the open requests
-- of an offer that is withdrawn. Forward-only: the previous app version never writes the new columns.

alter table swap add column reason text check (char_length(reason) between 1 and 200);
-- Why the system ended a swap on its own (the screen turns the code into text): another request was accepted, the
-- friendship ended, the offer was withdrawn. null for an answer of a person.
alter table swap add column cause text check (cause in ('already_given', 'friendship_ended', 'offer_withdrawn'));
alter table swap add column proposal boolean not null default false;
alter table swap add column decided_at timestamptz;

-- Internal: moves both rows of a swap to a state. Not granted to the application role; only the functions below call it.
create function set_swap_state(p_swap_id uuid, p_other uuid, p_status text, p_reason text, p_cause text, p_proposal text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  cur text := nullif(current_setting('app.account_id', true), '');
begin
  update public.swap set status = p_status, reason = coalesce(p_reason, reason), cause = coalesce(p_cause, cause),
         counter_text = coalesce(p_proposal, counter_text),
         counter_name = case when p_proposal is not null then null else counter_name end,
         counter_specimen_id = case when p_proposal is not null then null else counter_specimen_id end,
         proposal = proposal or p_proposal is not null, decided_at = now(), updated_at = now()
   where swap_id = p_swap_id;
  perform set_config('app.account_id', p_other::text, true);
  update public.swap set status = p_status, reason = coalesce(p_reason, reason), cause = coalesce(p_cause, cause),
         counter_text = coalesce(p_proposal, counter_text),
         counter_name = case when p_proposal is not null then null else counter_name end,
         counter_specimen_id = case when p_proposal is not null then null else counter_specimen_id end,
         proposal = proposal or p_proposal is not null, decided_at = now(), updated_at = now()
   where swap_id = p_swap_id;
  perform set_config('app.account_id', coalesce(cur, ''), true);
end
$$;
revoke all on function set_swap_state(uuid, uuid, text, text, text, text) from public;

-- Internal: both friendship rows between the caller and `p_other` are confirmed. The other row is read as the other
-- account (row rules), then the caller's account is restored.
create function friendship_holds(p_other uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
revoke all on function friendship_holds(uuid) from public;

-- Internal: the offer of the giver goes back from `reserved` to `open` (an acceptance was withdrawn or canceled).
create function reopen_offer(p_giver uuid, p_offer uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  cur text := nullif(current_setting('app.account_id', true), '');
begin
  perform set_config('app.account_id', p_giver::text, true);
  update public.offer set status = 'open', updated_at = now() where id = p_offer and status = 'reserved';
  perform set_config('app.account_id', coalesce(cur, ''), true);
end
$$;
revoke all on function reopen_offer(uuid, uuid) from public;

-- Answers or changes a swap of the caller. Actions of the giver: `accept` (the offer becomes `reserved`, the other open
-- requests for it are declined automatically with the cause `already_given`), `decline` (with an optional reason),
-- `propose` (replaces the counter-offer by free text, the request stays open) and `cancel` (an accepted swap, the offer
-- goes back to `open`). Action of the requester: `withdraw` (a request or an acceptance, the offer goes back to `open`).
-- Repeating an action that already holds changes nothing. Outcome: `ok` (with the status), `not_found` (an unknown or
-- foreign id looks the same), `not_allowed` (the action belongs to the other side), `wrong_state`, `offer_not_open` (the
-- offer is withdrawn or reserved for another request) and `friendship_ended` (the swap was canceled because the
-- friendship is gone). Nothing is written unless the outcome is `ok` or `friendship_ended`.
create function answer_swap(p_swap_id uuid, p_action text, p_reason text, p_proposal text)
returns table (outcome text, status text)
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
revoke all on function answer_swap(uuid, text, text, text) from public;
grant execute on function answer_swap(uuid, text, text, text) to pflanzendex_app;

-- Cancels every open swap of the caller whose friendship is no longer confirmed on both sides (the hook after ending a
-- friendship, SOZ-03). An accepted one gives the offer back (`open`). Returns the number of canceled swaps.
create function cancel_orphaned_swaps()
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
revoke all on function cancel_orphaned_swaps() from public;
grant execute on function cancel_orphaned_swaps() to pflanzendex_app;

-- Cancels the open requests of an offer of the caller (the offer is withdrawn, US-SOZ-08). Returns their number.
create function cancel_swaps_for_offer(p_offer uuid)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
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
$$;
revoke all on function cancel_swaps_for_offer(uuid) from public;
grant execute on function cancel_swaps_for_offer(uuid) to pflanzendex_app;

-- Fix of 0044: "Everything private" is read for the giver's own row. The account data table is readable across accounts
-- for display names, so without the account condition the flag of any other account hid the offers of every friend. The
-- two functions are replaced as they are, with only that condition added.
create or replace function friend_offers()
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
       and not exists (select from public.account_data where account_id = f.other_id and everything_private) then
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

create or replace function request_swap(p_offer_id uuid, p_counter_specimen uuid, p_counter_text text)
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
        and not exists (select from public.account_data where account_id = giver and everything_private)
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

