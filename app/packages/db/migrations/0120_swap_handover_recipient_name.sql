-- module: swap
-- US-BES-07, US-SOZ-11 (issue 2294): the archive reason of a given plant names the recipient, whoever confirms last.
-- `confirm_handover()` answers one more column at the end, `recipient_name`: the recipient's name as the giver's side
-- stored it at the request (the giver's row, `other_name`), `null` when it has none (P-08). The application took `other_name`
-- of the caller's own row for the reason. That row names the OTHER side, so when the recipient confirmed last the giver's
-- specimen was archived as "Getauscht mit <giver>" or "Verschenkt an <giver>". The name is read from the other side's row
-- in the update that records the confirmation, so no statement is added. Same parameters and same rows as in 0092, and the
-- previous app version keeps working: it selects named columns. Forward-only: archived specimens that already carry a
-- wrong reason are not migrated.

drop function confirm_handover(uuid, text);

create function confirm_handover(p_swap_id uuid, p_marker text)
returns table (
  outcome text, all_done boolean, role text, other_id uuid, offer_id uuid, specimen_id uuid, type text, marker text,
  mode text, other_name text, recipient_name text
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
  their_name text;
begin
  if me is null then
    raise exception 'Confirming a handover needs an account' using errcode = '42501';
  end if;
  select * into s from public.swap where swap_id = p_swap_id and account_id = me;
  if not found then
    return query select 'not_found'::text, false, null::text, null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  if s.status = 'handed_over' then
    return query select 'already_handed_over'::text, true, s.role, s.other_id, s.offer_id, null::uuid, s.type, s.recipient_marker, s.mode, s.other_name, null::text;
    return;
  end if;
  if s.status <> 'accepted' then
    return query select 'wrong_state'::text, false, s.role, s.other_id, s.offer_id, null::uuid, s.type, s.recipient_marker, s.mode, s.other_name, null::text;
    return;
  end if;
  if not public.friendship_holds(s.other_id) then
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'friendship_ended', null);
    perform public.reopen_offer(case when s.role = 'giver' then me else s.other_id end, s.offer_id);
    return query select 'friendship_ended'::text, false, s.role, s.other_id, s.offer_id, null::uuid, s.type, null::text, s.mode, s.other_name, null::text;
    return;
  end if;
  mark := case when s.role = 'recipient' then coalesce(p_marker, s.recipient_marker) else s.recipient_marker end;
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id and account_id = me returning (confirmed_giver and confirmed_recipient) into both_done;
  perform set_config('app.account_id', s.other_id::text, true);
  -- The other side's row holds the name that side gives me (`other_name`): when I am the recipient, the recipient's name.
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id and account_id = s.other_id returning other_name into their_name;
  giver := case when s.role = 'giver' then me else s.other_id end;
  perform set_config('app.account_id', giver::text, true);
  select o.specimen_id into spec from public.offer o where o.id = s.offer_id and o.account_id = giver;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  -- The recipient's name: my own row names it when I am the giver; otherwise the other side's row names me.
  return query select 'ok'::text, both_done, s.role, s.other_id, s.offer_id, spec, s.type, mark, s.mode, s.other_name,
    case when s.role = 'giver' then s.other_name else their_name end;
end
$$;
revoke all on function confirm_handover(uuid, text) from public;
grant execute on function confirm_handover(uuid, text) to pflanzendex_app;
