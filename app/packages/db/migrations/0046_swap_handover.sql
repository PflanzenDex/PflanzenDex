-- module: swap
-- US-SOZ-11, DM-SOZ-03, ADR 0012, P-04, P-10, FR-SOZ-05: the handover of an accepted swap.
--
-- `confirm_handover()` records one side's confirmation on both rows of the swap (and the marker the recipient chose for
-- the new specimen) and answers whether both sides have confirmed. The handover counts only when both did. The collection
-- work (archiving the giver's specimen, creating the recipient's) is done by the application in the same transaction
-- with the connection-taking functions of `collection`; `finish_handover()` then moves both rows to `handed_over`, records
-- which specimens were given and received (the provenance "from <name>" is derived from the received specimen's swap row,
-- US-SOZ-13) and marks the offer `handed_over`. If anything fails, the application rolls the transaction back: the swap
-- stays `accepted`, never a half state (FR-SOZ-05). Forward-only: the previous app version never writes the new columns.

alter table swap add column recipient_marker text check (char_length(recipient_marker) between 1 and 40);
alter table swap add column given_specimen_id uuid;
alter table swap add column received_specimen_id uuid;
alter table swap add column handed_over_at timestamptz;
-- A specimen that is deleted later leaves the history intact: only the link goes (the swap row keeps the names).
alter table swap add constraint swap_given_specimen foreign key (account_id, given_specimen_id)
  references specimen (account_id, id) on delete set null (given_specimen_id);
alter table swap add constraint swap_received_specimen foreign key (account_id, received_specimen_id)
  references specimen (account_id, id) on delete set null (received_specimen_id);
alter table swap add check (given_specimen_id is null or role = 'giver');
alter table swap add check (received_specimen_id is null or role = 'recipient');
create index swap_given_specimen_idx on swap (account_id, given_specimen_id);
create index swap_received_specimen_idx on swap (account_id, received_specimen_id);

-- Records the confirmation of the caller. Outcome: `ok` (with `all_done`: the other side confirmed already), `not_found`,
-- `wrong_state` (only an accepted swap can be handed over), `already_handed_over` (nothing changes) and
-- `friendship_ended` (the swap was canceled). Repeating a confirmation changes nothing but may update the marker. The
-- row also names the other account, the offer and the specimen offered (read as the giver) for the application.
create function confirm_handover(p_swap_id uuid, p_marker text)
returns table (
  outcome text, all_done boolean, role text, other_id uuid, offer_id uuid, specimen_id uuid, type text, marker text,
  mode text, other_name text
)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  cur text := nullif(current_setting('app.account_id', true), '');
  s public.swap;
  giver uuid;
  spec uuid;
  mark text;
  both_done boolean;
begin
  if me is null then
    raise exception 'Confirming a handover needs an account' using errcode = '42501';
  end if;
  select * into s from public.swap where swap_id = p_swap_id and account_id = me;
  if not found then
    return query select 'not_found'::text, false, null::text, null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::text;
    return;
  end if;
  if s.status = 'handed_over' then
    return query select 'already_handed_over'::text, true, s.role, s.other_id, s.offer_id, null::uuid, s.type, s.recipient_marker, s.mode, s.other_name;
    return;
  end if;
  if s.status <> 'accepted' then
    return query select 'wrong_state'::text, false, s.role, s.other_id, s.offer_id, null::uuid, s.type, s.recipient_marker, s.mode, s.other_name;
    return;
  end if;
  if not public.friendship_holds(s.other_id) then
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'friendship_ended', null);
    perform public.reopen_offer(case when s.role = 'giver' then me else s.other_id end, s.offer_id);
    return query select 'friendship_ended'::text, false, s.role, s.other_id, s.offer_id, null::uuid, s.type, null::text, s.mode, s.other_name;
    return;
  end if;
  mark := case when s.role = 'recipient' then coalesce(p_marker, s.recipient_marker) else s.recipient_marker end;
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id returning (confirmed_giver and confirmed_recipient) into both_done;
  perform set_config('app.account_id', s.other_id::text, true);
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id;
  giver := case when s.role = 'giver' then me else s.other_id end;
  perform set_config('app.account_id', giver::text, true);
  select o.specimen_id into spec from public.offer o where o.id = s.offer_id;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  return query select 'ok'::text, both_done, s.role, s.other_id, s.offer_id, spec, s.type, mark, s.mode, s.other_name;
end
$$;
revoke all on function confirm_handover(uuid, text) from public;
grant execute on function confirm_handover(uuid, text) to pflanzendex_app;

-- Completes the handover after the collection work was done in the same transaction: both rows `handed_over`, the specimen
-- given and the one received are recorded, the offer is `handed_over`. Only a party of an accepted swap that both sides
-- confirmed can call it; the two specimens must belong to the giver and the recipient (composite foreign keys).
create function finish_handover(p_swap_id uuid, p_given uuid, p_received uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
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
         updated_at = now() where swap_id = p_swap_id;
  update public.offer set status = 'handed_over', updated_at = now() where id = s.offer_id;
  perform set_config('app.account_id', recipient::text, true);
  update public.swap set status = 'handed_over', received_specimen_id = p_received, handed_over_at = now(),
         decided_at = now(), updated_at = now() where swap_id = p_swap_id;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  return true;
end
$$;
revoke all on function finish_handover(uuid, uuid, uuid) from public;
grant execute on function finish_handover(uuid, uuid, uuid) to pflanzendex_app;
