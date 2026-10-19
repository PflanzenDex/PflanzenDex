-- module: swap
-- US-SOZ-10, US-SOZ-11, P-04, QG-D1 (#907): `confirm_handover()`, `finish_handover()`, `set_swap_state()` and `reopen_offer()` no longer depend
-- on row security to touch one account's row at a time. All three are `security definer` and switch the session account
-- between two statements; when the owner of the tables bypasses row security (a superuser, as the cluster user of the
-- Docker image and of `make dev` is), `update swap ... where swap_id = ...` hit BOTH rows of the swap each time. For
-- `confirm_handover()` the first update returned two rows into a single variable, so a handover could not be confirmed
-- at all ("query returned more than one row"). For `finish_handover()` that wrote the specimen the recipient received into the giver's row and the given one into the
-- recipient's row (the first update set `given_specimen_id` on both rows, the second `received_specimen_id` on both).
-- Every statement now names its account (`account_id = giver / recipient / current_account() / p_other / p_giver`), so
-- the result is the same under a superuser and under a plain owner. Same signatures, behaviour with a plain owner
-- unchanged: the previous app version keeps working. Grants stay as they are (the two helpers are not granted).

create or replace function set_swap_state(p_swap_id uuid, p_other uuid, p_status text, p_reason text, p_cause text, p_proposal text)
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
   where swap_id = p_swap_id and account_id = current_account();
  perform set_config('app.account_id', p_other::text, true);
  update public.swap set status = p_status, reason = coalesce(p_reason, reason), cause = coalesce(p_cause, cause),
         counter_text = coalesce(p_proposal, counter_text),
         counter_name = case when p_proposal is not null then null else counter_name end,
         counter_specimen_id = case when p_proposal is not null then null else counter_specimen_id end,
         proposal = proposal or p_proposal is not null, decided_at = now(), updated_at = now()
   where swap_id = p_swap_id and account_id = p_other;
  perform set_config('app.account_id', coalesce(cur, ''), true);
end
$$;

create or replace function reopen_offer(p_giver uuid, p_offer uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  cur text := nullif(current_setting('app.account_id', true), '');
begin
  perform set_config('app.account_id', p_giver::text, true);
  update public.offer set status = 'open', updated_at = now()
   where id = p_offer and account_id = p_giver and status = 'reserved';
  perform set_config('app.account_id', coalesce(cur, ''), true);
end
$$;

create or replace function finish_handover(p_swap_id uuid, p_given uuid, p_received uuid)
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
         updated_at = now() where swap_id = p_swap_id and account_id = giver;
  update public.offer set status = 'handed_over', updated_at = now() where id = s.offer_id and account_id = giver;
  perform set_config('app.account_id', recipient::text, true);
  update public.swap set status = 'handed_over', received_specimen_id = p_received, handed_over_at = now(),
         decided_at = now(), updated_at = now() where swap_id = p_swap_id and account_id = recipient;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  return true;
end
$$;

create or replace function confirm_handover(p_swap_id uuid, p_marker text)
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
   where swap_id = p_swap_id and account_id = me returning (confirmed_giver and confirmed_recipient) into both_done;
  perform set_config('app.account_id', s.other_id::text, true);
  update public.swap set confirmed_giver = confirmed_giver or s.role = 'giver',
         confirmed_recipient = confirmed_recipient or s.role = 'recipient',
         recipient_marker = mark, updated_at = now()
   where swap_id = p_swap_id and account_id = s.other_id;
  giver := case when s.role = 'giver' then me else s.other_id end;
  perform set_config('app.account_id', giver::text, true);
  select o.specimen_id into spec from public.offer o where o.id = s.offer_id and o.account_id = giver;
  perform set_config('app.account_id', coalesce(cur, ''), true);
  return query select 'ok'::text, both_done, s.role, s.other_id, s.offer_id, spec, s.type, mark, s.mode, s.other_name;
end
$$;
