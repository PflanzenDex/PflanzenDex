-- module: account
-- Cost per user from a manual monthly figure (US-ACC-05, NFR-16, P-08), owner decision 2026-10-05.
-- `operator_cost`: one row for the whole installation, the real hosting cost of one month as entered by the operator.
-- No tenant data (no account id): like `access_setting`, the application role has no rights on the table and reaches
-- it only through the two functions below, which check the operator role in the database again.
-- Expand only: a new table and new functions; `operator_overview()` stays as it is for the previous app version.

create table operator_cost (
  id boolean primary key default true check (id),
  -- 0 to 1,000,000.00 in cents (assumption, starting value; the same limit as in core).
  amount_cents bigint check (amount_cents between 0 and 100000000),
  currency text check (currency ~ '^[A-Z]{3}$'),
  -- The first day of the month the figure belongs to.
  month date check (month = date_trunc('month', month)::date),
  updated_at timestamptz not null default now(),
  -- Either no figure at all or a complete one.
  check ((amount_cents is null) = (currency is null) and (currency is null) = (month is null))
);
insert into operator_cost default values;
revoke all on operator_cost from public;
alter table operator_cost enable row level security;

-- Replaces the figure; the month must not lie after the current month (UTC), the same rule as in core.
create function set_operator_cost(p_amount_cents bigint, p_currency text, p_month date) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator enters the operating cost' using errcode = '42501';
  end if;
  if p_month > date_trunc('month', now() at time zone 'UTC')::date then
    raise exception 'The cost month lies in the future' using errcode = '22023';
  end if;
  update public.operator_cost
     set amount_cents = p_amount_cents, currency = p_currency, month = p_month, updated_at = now();
end
$$;

create function operator_cost() returns table (amount_cents bigint, currency text, month date)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not is_operator() then
    raise exception 'Only the operator sees the operating cost' using errcode = '42501';
  end if;
  return query select c.amount_cents, c.currency, c.month from public.operator_cost c;
end
$$;

revoke all on function set_operator_cost(bigint, text, date), operator_cost() from public;
grant execute on function set_operator_cost(bigint, text, date), operator_cost() to pflanzendex_app;
