-- module: collection
-- US-ONB-08, P-05, NFR-10: the figures of the introduction for the operator, read from data that exists (the creation
-- instant of an account and of its first specimen), aggregated, no tracking of individuals and no event log.
-- `operator_introduction()` is a `security definer` function like `operator_overview()`: it checks the operator role in
-- the database again (P-04) and returns counts and one median, never an account, never a row of a user table. It reads
-- `specimen` across tenants. Unlike `account`, `specimen` is also read by the owner role in other places (tests run as the owner), so a rule that
-- is always true would widen those reads. The rule therefore opens only while the function below holds a transaction-local
-- switch; the application role never matches `to current_user` and cannot set it for the owner.
-- Expand only: a new rule and a new function, nothing removed; the previous app version keeps working.

create policy owner_figures on specimen for select to current_user
  using (current_setting('pflanzendex.introduction_figures', true) = 'on');

-- Accounts created within the last `p_window_days` days: how many, how many of them are at least `p_settle_days` days
-- old, how many of those still have no specimen (archived ones count as a plant), how many have a first specimen and
-- the median seconds from the creation of the account to the creation of its first specimen.
create function operator_introduction(p_window_days integer, p_settle_days integer)
returns table (
  accounts integer,
  settled integer,
  settled_without_plant integer,
  with_plant integer,
  median_seconds integer
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the figures of the introduction' using errcode = '42501';
  end if;
  perform set_config('pflanzendex.introduction_figures', 'on', true);
  return query
  with recent as (
    select a.created_at,
           (select min(s.created_at) from public.specimen s where s.account_id = a.id) as first_plant
      from public.account a
     where a.created_at >= now() - make_interval(days => p_window_days)
  )
  select count(*)::integer,
         (count(*) filter (where created_at <= now() - make_interval(days => p_settle_days)))::integer,
         (count(*) filter (where first_plant is null
                             and created_at <= now() - make_interval(days => p_settle_days)))::integer,
         count(first_plant)::integer,
         round(percentile_cont(0.5) within group (
           order by extract(epoch from (first_plant - created_at))
         ) filter (where first_plant is not null))::integer
    from recent;
  perform set_config('pflanzendex.introduction_figures', 'off', true);
end
$$;

revoke all on function operator_introduction(integer, integer) from public;
grant execute on function operator_introduction(integer, integer) to pflanzendex_app;
