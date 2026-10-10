-- module: monitoring
-- US-MON-01, US-MON-08, DM-MON-01, FR-MON-02, FR-MON-08, P-04, P-05, P-10: the data of the reminders.
-- 1. `reminder_setting`: one row per account: the time of the daily check, quiet hours, pauses per occasion and the days
--    after which a measurement is overdue (US-MON-04). No row means the defaults; nothing is written before the keeper saves.
-- 2. `delivery_channel`: one row per push subscription of a browser (Web Push endpoint and keys, E-10). The endpoint and
--    the keys are secrets of the account's devices and never leave the owner (row rule).
-- 3. `reminder`: one row per account and local calendar day (NFR-08): the stored bundle (the in-app reminder) with its
--    delivery state. The unique key makes the daily check repeatable: the same occasion is not reported twice on a day
--    (FR-MON-02). Status `none` records that the day was checked and nothing was due; nothing is sent then.
-- Forward-only: the previous app version does not know the tables.

create table reminder_setting (
  account_id uuid primary key references account(id) on delete cascade,
  send_time time not null default '08:00',
  quiet_from time,
  quiet_to time,
  -- {occasion: 'YYYY-MM-DD'}: paused until that local date, inclusive (US-MON-08).
  paused jsonb not null default '{}'::jsonb,
  measurement_days integer not null default 30 check (measurement_days between 1 and 365),
  updated_at timestamptz not null default now(),
  check ((quiet_from is null) = (quiet_to is null))
);
select tenant_protection('reminder_setting');

create table delivery_channel (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  kind text not null default 'web_push' check (kind in ('web_push')),
  endpoint text not null check (char_length(endpoint) between 12 and 2000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint delivery_channel_endpoint unique (account_id, endpoint)
);
select tenant_protection('delivery_channel');

create table reminder (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references account(id) on delete cascade,
  local_date date not null,
  items jsonb not null default '[]'::jsonb,
  status text not null check (status in ('none', 'pending', 'in_app', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  constraint reminder_day unique (account_id, local_date)
);
select tenant_protection('reminder');

-- 4. `reminder_accounts()`: the accounts that have chosen a time zone, for the daily scheduler (US-MON-01). The scheduler is
--    not an account and the profile is under the row rule, so the function reads each profile as its own account, one by
--    one, and returns the id and the zone only (NFR-08: nothing is guessed for accounts without a zone). Only the owner
--    role (the worker) may call it; the application role may not.
create function reminder_accounts()
returns table (account_id uuid, time_zone text)
language plpgsql security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  one uuid;
  zone text;
  mine text := nullif(current_setting('app.account_id', true), '');
begin
  for one in select id from public.account order by id loop
    perform set_config('app.account_id', one::text, true);
    select d.time_zone into zone from public.account_data d where d.account_id = one;
    if zone is not null then
      account_id := one;
      time_zone := zone;
      return next;
    end if;
  end loop;
  perform set_config('app.account_id', coalesce(mine, ''), true);
end
$$;

revoke all on function reminder_accounts() from public;
