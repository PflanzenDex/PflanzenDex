-- module: privacy
-- US-ACC-04, P-04, P-05, P-10: deleting an account with a grace period.
--
-- 1. `account_deletion`: the keeper's request, one row per account (tenant data: the keeper reads it, creates it and
--    withdraws it themselves). `due_at` is when the data may go; before that the keeper can withdraw. The row goes with
--    the account.
-- 2. `deletion_log`: one anonymous row per finished deletion, without an account id (the account is gone): when it was
--    requested and finished, the sign-in subject until the operator has removed the identity at the sign-in service
--    (`identity_removed_at`), and nothing else. Closed to the application role like `invitation`; only the background
--    job writes it, through `erase_account()`.
-- 3. `erase_account()`: the one place that deletes an account, for the caller only, and only when a request exists and
--    is due. It cancels running swaps (module swap), removes the proposals that are not shared and anonymizes the shared
--    ones (module catalog), deletes the account (every table with `account_id` goes with it through its foreign key;
--    friendships of the partners go because their `other_id` cascades) and writes the log row. One transaction, so a
--    failure leaves the account as it was and the job tries again (repeatable). Forward-only.

create table account_deletion (
  account_id uuid primary key references account(id) on delete cascade,
  requested_at timestamptz not null default now(),
  due_at timestamptz not null,
  check (due_at > requested_at)
);
select tenant_protection('account_deletion');

create table deletion_log (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null,
  completed_at timestamptz not null default now(),
  subject text,
  identity_removed_at timestamptz
);
create index deletion_log_open on deletion_log (completed_at) where identity_removed_at is null;
revoke all on deletion_log from public;
alter table deletion_log enable row level security;

create function erase_account()
returns table (subject text, requested_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  r public.account_deletion;
  who text;
begin
  if me is null then
    raise exception 'Deleting an account needs an account' using errcode = '42501';
  end if;
  select * into r from public.account_deletion where account_id = me;
  if not found then
    raise exception 'No deletion was requested' using errcode = '42501';
  end if;
  if r.due_at > now() then
    raise exception 'The grace period has not ended yet' using errcode = '42501';
  end if;
  perform public.cancel_swaps_of_deleted_account();
  perform public.erase_catalog_contributions();
  select a.subject into who from public.account a where a.id = me;
  delete from public.account where id = me;
  insert into public.deletion_log (requested_at, subject) values (r.requested_at, who);
  return query select who, r.requested_at;
end
$$;
revoke all on function erase_account() from public;
grant execute on function erase_account() to pflanzendex_app;
