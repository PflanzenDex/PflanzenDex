-- module: privacy
-- US-ACC-04, US-DEV-03 (routine "Deletion requests (GDPR)"): the deadline of a deletion request and the identity removals
-- that the operator closes by hand when the identity service is not configured (issue 1673). No table changes.
--
-- 1. `deletion_deadline_rows()`: every open item, for the owner role only (the deadline check of the health details reads
--    it through the owner connection, like `reminder_accounts()`): a request still waiting for the job (`request`), and a
--    finished deletion whose identity is still open (`identity`: the deletion log entry and the sign-in subject). No
--    account id is returned, so an operator reading it learns no account (P-05).
-- 2. `operator_deletion_queue()`: the same rows for the operator; checks the operator role again (P-04).
-- 3. `operator_mark_identity_removed(entry)`: closes one open identity removal that was done by hand. Returns `marked`,
--    `already` (a repeat: nothing changes) or `unknown` (no such entry). It clears the subject, like the job does.
-- Forward-only. Expand only: nothing is removed, no existing function changes.

-- The owner reads every request, as the account overview does (migration 0023): `account_deletion` has forced row security,
-- which binds the table owner too, so a non-superuser owner would see only nothing without this rule. A rule for the
-- owner role only (`to current_user` at migration time, like `owner_count`); the application role keeps the `tenant` rule.
create policy owner_deadlines on account_deletion for select to current_user using (true);

create function deletion_deadline_rows()
returns table (kind text, entry_id uuid, requested_at timestamptz, subject text, completed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select 'request'::text, null::uuid, r.requested_at, null::text, null::timestamptz
    from public.account_deletion r
  union all
  select 'identity'::text, l.id, l.requested_at, l.subject, l.completed_at
    from public.deletion_log l
   where l.subject is not null and l.identity_removed_at is null
$$;
revoke all on function deletion_deadline_rows() from public;

create function operator_deletion_queue()
returns table (kind text, entry_id uuid, requested_at timestamptz, subject text, completed_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_operator() then
    raise exception 'Only the operator may see the deletion queue' using errcode = '42501';
  end if;
  return query select * from public.deletion_deadline_rows();
end
$$;
revoke all on function operator_deletion_queue() from public;
grant execute on function operator_deletion_queue() to pflanzendex_app;

create function operator_mark_identity_removed(entry uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_operator() then
    raise exception 'Only the operator may mark an identity removal' using errcode = '42501';
  end if;
  update public.deletion_log set subject = null, identity_removed_at = now()
   where id = entry and identity_removed_at is null;
  if found then return 'marked'; end if;
  if exists (select 1 from public.deletion_log where id = entry) then return 'already'; end if;
  return 'unknown';
end
$$;
revoke all on function operator_mark_identity_removed(uuid) from public;
grant execute on function operator_mark_identity_removed(uuid) to pflanzendex_app;
