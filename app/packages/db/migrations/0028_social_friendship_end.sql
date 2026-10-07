-- module: social
-- End a friendship (US-SOZ-03, DM-SOZ-01, P-04, P-05, P-10).
-- `end_friendship()`: either side ends a confirmed friendship; both rows become `ended` in one transaction (FR-SOZ-06),
-- so everything that is visible only between friends is withdrawn from both sides at once. The start (`since`) and the
-- stored display names stay (history, FR-SOZ-10). Like `answer_friendship()` it writes the other side's row by switching
-- the account inside the function. Forward-only: no schema change, the previous app version never calls the function.
-- Outcome: `ended` (also when it was ended before: nothing is written twice) or `not_found` (unknown id, an id of
-- another account and a request that is not a friendship yet look the same: existence does not leak).

create function end_friendship(p_id uuid)
returns table (outcome text)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid := current_account();
  mine text := nullif(current_setting('app.account_id', true), '');
  f public.friendship;
begin
  if me is null then
    raise exception 'Ending a friendship needs an account' using errcode = '42501';
  end if;
  select * into f from public.friendship where id = p_id and account_id = me for update;
  if not found or f.status not in ('confirmed', 'ended') then
    return query select 'not_found'::text;
    return;
  end if;
  if f.status = 'confirmed' then
    update public.friendship set status = 'ended' where id = f.id;
    perform set_config('app.account_id', f.other_id::text, true);
    update public.friendship set status = 'ended' where account_id = f.other_id and other_id = me;
    perform set_config('app.account_id', coalesce(mine, ''), true);
  end if;
  return query select 'ended'::text;
end
$$;

revoke all on function end_friendship(uuid) from public;
grant execute on function end_friendship(uuid) to pflanzendex_app;
