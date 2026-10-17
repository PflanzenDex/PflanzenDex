-- module: swap
-- US-ACC-04, US-SOZ-10, US-SOZ-13, P-04, P-10: what a deleted account leaves in the swaps of its partners.
--
-- A completed swap stays in the history of the partner with the stored display name, without any further connection
-- (US-ACC-04): `other_id` becomes nullable and is set to null when the other account is deleted (it used to delete the
-- partner's row with it). `other_name` is the stored display name and stays. A running swap is canceled with the cause
-- `account_deleted`, so the partner sees why it ended (P-10). `cancel_swaps_of_deleted_account()` does that for the
-- swaps of the caller, in the state they have right now; the deletion of the account (module privacy) calls it first.
-- Forward-only: the previous app version reads `other_id` as an id and treats null as "no friend" (the friendship
-- checks answer false for it), which is what a deleted partner is.

alter table swap alter column other_id drop not null;
alter table swap drop constraint swap_other_id_fkey;
alter table swap add constraint swap_other_id_fkey foreign key (other_id) references account(id) on delete set null;
alter table swap drop constraint swap_cause_check;
alter table swap add constraint swap_cause_check
  check (cause in ('already_given', 'friendship_ended', 'offer_withdrawn', 'account_deleted'));

create function cancel_swaps_of_deleted_account()
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
            where account_id = me and status in ('requested', 'accepted') and other_id is not null loop
    perform public.set_swap_state(s.swap_id, s.other_id, 'canceled', null, 'account_deleted', null);
    -- A reserved offer of the partner goes back to open; an offer of the caller disappears with the account.
    if s.status = 'accepted' and s.role = 'recipient' then
      perform public.reopen_offer(s.other_id, s.offer_id);
    end if;
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function cancel_swaps_of_deleted_account() from public;
grant execute on function cancel_swaps_of_deleted_account() to pflanzendex_app;
