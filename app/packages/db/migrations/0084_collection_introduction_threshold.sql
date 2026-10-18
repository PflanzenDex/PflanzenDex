-- module: collection
-- US-ONB-08, P-04, P-05, NFR-09, NFR-10: harden `operator_introduction()` (review of 0083).
-- 1. The rule `owner_figures` on `specimen` is dropped. It was opened by a transaction-local setting that every role can
--    set; other `security definer` functions that read `specimen` as the owner (`request_swap()`) then answered
--    differently for a foreign specimen id (an existence oracle). No rule widens any read of `specimen` any more.
-- 2. The function reads the first specimen per account the way `request_swap()` does: it takes over the account of each
--    row of the window in turn (`app.account_id`, transaction-local) and reads `specimen` under the normal row rule,
--    then restores the caller's account. The numbers are computed in the function; no row leaves it.
-- 3. The threshold lives in SQL as well: below 5 accounts behind a figure (assumption, same value as
--    INTRODUCTION_MIN_ACCOUNTS in `core`) the figure is NULL, and so is the count of accounts (P-08, P-05).
-- Expand only: same signature and columns (now nullable), one rule less; the previous app version keeps working.

drop policy owner_figures on specimen;

create or replace function operator_introduction(p_window_days integer, p_settle_days integer)
returns table (
  accounts integer,
  settled integer,
  settled_without_plant integer,
  with_plant integer,
  median_seconds integer
)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  min_accounts constant integer := 5;
  mine text := nullif(current_setting('app.account_id', true), '');
  r record;
  first_plant timestamptz;
  n_accounts integer := 0;
  n_settled integer := 0;
  n_settled_without integer := 0;
  n_with_plant integer := 0;
  seconds double precision[] := '{}';
  median integer;
begin
  if not is_operator() then
    raise exception 'Only the operator sees the figures of the introduction' using errcode = '42501';
  end if;
  for r in select a.id, a.created_at from public.account a
            where a.created_at >= now() - make_interval(days => p_window_days) loop
    perform set_config('app.account_id', r.id::text, true);
    select min(s.created_at) into first_plant from public.specimen s where s.account_id = r.id;
    n_accounts := n_accounts + 1;
    if r.created_at <= now() - make_interval(days => p_settle_days) then
      n_settled := n_settled + 1;
      if first_plant is null then n_settled_without := n_settled_without + 1; end if;
    end if;
    if first_plant is not null then
      n_with_plant := n_with_plant + 1;
      seconds := seconds || extract(epoch from (first_plant - r.created_at));
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
  if n_with_plant >= min_accounts then
    select round(percentile_cont(0.5) within group (order by x))::integer into median from unnest(seconds) as x;
  end if;
  return query select
    case when n_accounts >= min_accounts then n_accounts end,
    case when n_settled >= min_accounts then n_settled end,
    case when n_settled >= min_accounts then n_settled_without end,
    case when n_with_plant >= min_accounts then n_with_plant end,
    median;
end
$$;
